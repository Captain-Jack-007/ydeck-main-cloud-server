import { env } from "../../config/env";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { FileModel } from "../../models";

export type ImageSource = "pexels" | "user_upload";
export type ImageOrientation = "landscape" | "portrait" | "square";

export interface ImageSearchInput {
  workspaceId: string;
  projectId?: string;
  deckId?: string;
  query: string;
  orientation?: ImageOrientation;
  style?: string;
  count?: number;
  sources?: ImageSource[];
}

export interface ImageCandidate {
  assetCandidateId: string;
  source: ImageSource;
  sourceImageId: string;
  previewUrl: string;
  originalUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  photographerName?: string;
  photographerUrl?: string;
  attributionText?: string;
  licenseSummary: string;
  orientation: ImageOrientation;
  dominantColor?: string;
  query: string;
  tags: string[];
}

export interface SelectImageInput {
  workspaceId: string;
  projectId?: string;
  deckId?: string;
  assetCandidateId: string;
  slideNumber?: number;
  reason?: string;
}

export interface ImageAsset {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  deckId?: string;
  slideNumber?: number;
  source: ImageSource;
  sourceImageId: string;
  sourceUrl: string;
  photographerName?: string;
  photographerUrl?: string;
  attributionText?: string;
  licenseType?: string;
  originalUrl: string;
  storedUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  dominantColor?: string;
  orientation: ImageOrientation;
  tags: string[];
  query: string;
  selectedBy: "agent" | "user" | "fallback";
  createdAt: string;
}

const candidateCache = new Map<string, { candidate: ImageCandidate; expiresAt: number }>();
const CANDIDATE_TTL_MS = 30 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function searchImages(input: ImageSearchInput): Promise<ImageCandidate[]> {
  const sources = input.sources?.length ? input.sources : ["pexels"];
  const count = Math.max(1, Math.min(input.count ?? 8, 12));
  const candidates: ImageCandidate[] = [];

  if (sources.includes("pexels")) {
    candidates.push(...(await searchPexels(input, count)));
  }

  const ranked = rankImages(candidates, input).slice(0, count);
  for (const candidate of ranked) {
    candidateCache.set(candidate.assetCandidateId, {
      candidate,
      expiresAt: Date.now() + CANDIDATE_TTL_MS,
    });
  }
  return ranked;
}

export async function selectImage(input: SelectImageInput): Promise<ImageAsset> {
  const cached = candidateCache.get(input.assetCandidateId);
  if (!cached || cached.expiresAt < Date.now()) {
    throw new Error("Image candidate expired. Search images again.");
  }
  const candidate = cached.candidate;
  const downloaded = await downloadImage(candidate.originalUrl);
  const checksum = sha256Hex(downloaded.buffer.toString("base64"));
  const filename = `${safeFileName(candidate.query)}-${randomToken(4)}.${extensionForMime(downloaded.mimeType)}`;
  const storageUrl = `data:${downloaded.mimeType};base64,${downloaded.buffer.toString("base64")}`;
  const file = await FileModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    scope: input.projectId ? "job" : "workspace",
    kind: "image_asset",
    filename,
    mimeType: downloaded.mimeType,
    sizeBytes: downloaded.buffer.byteLength,
    storageUrl,
    checksum,
    meta: {
      source: candidate.source,
      sourceImageId: candidate.sourceImageId,
      sourceUrl: candidate.sourceUrl,
      photographerName: candidate.photographerName,
      photographerUrl: candidate.photographerUrl,
      attributionText: candidate.attributionText,
      licenseType: candidate.licenseSummary,
      originalUrl: candidate.originalUrl,
      thumbnailUrl: candidate.previewUrl,
      width: candidate.width,
      height: candidate.height,
      dominantColor: candidate.dominantColor,
      orientation: candidate.orientation,
      tags: candidate.tags,
      query: candidate.query,
      deckId: input.deckId,
      slideNumber: input.slideNumber,
      selectedBy: "agent",
      reason: input.reason,
    },
  });
  return fileToImageAsset(file.toJSON() as Record<string, unknown>);
}

export async function uploadUserImageAsset(input: {
  workspaceId: string;
  projectId?: string;
  deckId?: string;
  fileId: string;
  purpose?: string;
}): Promise<ImageAsset> {
  const file = await FileModel.findById(input.fileId);
  if (!file) throw new Error("File not found.");
  if (String(file.workspaceId) !== input.workspaceId) throw new Error("File is outside this workspace.");
  if (!String(file.mimeType ?? "").startsWith("image/")) throw new Error("File is not an image.");
  file.kind = "image_asset";
  file.projectId = input.projectId ? (input.projectId as never) : file.projectId;
  file.meta = {
    ...(isRecord(file.meta) ? file.meta : {}),
    source: "user_upload",
    sourceImageId: input.fileId,
    sourceUrl: "",
    originalUrl: file.storageUrl,
    thumbnailUrl: file.storageUrl,
    attributionText: "User uploaded image",
    licenseType: "user_provided",
    deckId: input.deckId,
    purpose: input.purpose,
    selectedBy: "user",
  };
  await file.save();
  return fileToImageAsset(file.toJSON() as Record<string, unknown>);
}

export async function listImageAssets(input: {
  workspaceId: string;
  projectId?: string;
  limit?: number;
}): Promise<ImageAsset[]> {
  const query: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    kind: "image_asset",
  };
  if (input.projectId) query.$or = [{ projectId: input.projectId }, { projectId: null }];
  const files = await FileModel.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(input.limit ?? 20, 50)))
    .lean();
  return files.map((file) => fileToImageAsset(file as unknown as Record<string, unknown>));
}

async function searchPexels(input: ImageSearchInput, count: number): Promise<ImageCandidate[]> {
  if (!env.pexelsApiKey) throw new Error("PEXELS_API_KEY is not set.");
  const params = new URLSearchParams({
    query: [input.query, input.style].filter(Boolean).join(" "),
    per_page: String(count),
    orientation: input.orientation ?? "landscape",
  });
  const res = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: {
      Authorization: env.pexelsApiKey,
      "User-Agent": "YDeckMainServer/1.0",
    },
  });
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    photos?: Array<{
      id: number;
      width: number;
      height: number;
      url: string;
      photographer?: string;
      photographer_url?: string;
      alt?: string;
      avg_color?: string;
      src?: Record<string, string>;
    }>;
  };
  return (body.photos ?? []).map((photo) => {
    const orientation = orientationFor(photo.width, photo.height);
    const photographer = photo.photographer || "Pexels photographer";
    return {
      assetCandidateId: `pexels_${photo.id}_${randomToken(4)}`,
      source: "pexels",
      sourceImageId: String(photo.id),
      previewUrl: photo.src?.medium ?? photo.src?.small ?? photo.src?.original ?? "",
      originalUrl: photo.src?.large2x ?? photo.src?.large ?? photo.src?.original ?? "",
      sourceUrl: photo.url,
      width: photo.width,
      height: photo.height,
      photographerName: photographer,
      photographerUrl: photo.photographer_url,
      attributionText: `Photo by ${photographer} on Pexels`,
      licenseSummary: "pexels_free_to_use",
      orientation,
      dominantColor: photo.avg_color,
      query: input.query,
      tags: [input.query, input.style, photo.alt].filter((v): v is string => Boolean(v)),
    };
  });
}

function rankImages(candidates: ImageCandidate[], input: ImageSearchInput): ImageCandidate[] {
  const target = input.orientation ?? "landscape";
  return [...candidates].sort((a, b) => scoreCandidate(b, target) - scoreCandidate(a, target));
}

function scoreCandidate(candidate: ImageCandidate, target: ImageOrientation): number {
  let score = 0;
  if (candidate.orientation === target) score += 30;
  if (candidate.width >= 1600) score += 20;
  if (candidate.height >= 900) score += 20;
  if (candidate.dominantColor) score += 5;
  if (candidate.photographerName) score += 5;
  return score;
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!/^https:\/\//i.test(url)) throw new Error("Only HTTPS image URLs are supported.");
  const res = await fetch(url, { headers: { "User-Agent": "YDeckMainServer/1.0" } });
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error(`Downloaded asset is not an image: ${mimeType}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_IMAGE_BYTES) throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes.`);
  return { buffer: Buffer.from(ab), mimeType };
}

function fileToImageAsset(file: Record<string, unknown>): ImageAsset {
  const meta = isRecord(file.meta) ? file.meta : {};
  return {
    id: String(file.id ?? file._id),
    workspaceId: String(file.workspaceId),
    projectId: file.projectId ? String(file.projectId) : null,
    deckId: typeof meta.deckId === "string" ? meta.deckId : undefined,
    slideNumber: typeof meta.slideNumber === "number" ? meta.slideNumber : undefined,
    source: meta.source === "user_upload" ? "user_upload" : "pexels",
    sourceImageId: String(meta.sourceImageId ?? file.id ?? file._id),
    sourceUrl: String(meta.sourceUrl ?? ""),
    photographerName: typeof meta.photographerName === "string" ? meta.photographerName : undefined,
    photographerUrl: typeof meta.photographerUrl === "string" ? meta.photographerUrl : undefined,
    attributionText: typeof meta.attributionText === "string" ? meta.attributionText : undefined,
    licenseType: typeof meta.licenseType === "string" ? meta.licenseType : undefined,
    originalUrl: String(meta.originalUrl ?? file.storageUrl ?? ""),
    storedUrl: String(file.storageUrl ?? ""),
    thumbnailUrl: String(meta.thumbnailUrl ?? file.storageUrl ?? ""),
    width: Number(meta.width ?? 0),
    height: Number(meta.height ?? 0),
    dominantColor: typeof meta.dominantColor === "string" ? meta.dominantColor : undefined,
    orientation: meta.orientation === "portrait" || meta.orientation === "square" ? meta.orientation : "landscape",
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    query: String(meta.query ?? ""),
    selectedBy: meta.selectedBy === "user" || meta.selectedBy === "fallback" ? meta.selectedBy : "agent",
    createdAt: String(file.createdAt ?? new Date().toISOString()),
  };
}

function orientationFor(width: number, height: number): ImageOrientation {
  const ratio = width / Math.max(1, height);
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

