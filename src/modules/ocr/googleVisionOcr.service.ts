import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import { ImageAnnotatorClient } from "@google-cloud/vision";

import { env } from "../../config/env";
import { FileModel } from "../../models";

const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;

export interface OcrInput {
  fileId?: string;
  path?: string;
  imagePath?: string;
  url?: string;
  imageUrl?: string;
  base64?: string;
  imageBase64?: string;
  content?: string;
  workspaceId?: string;
  projectId?: string;
}

export interface OcrResult {
  provider: "google_vision" | "tencent_ocr";
  text: string;
  pages: Array<{ text: string; confidence?: number | null }>;
  blocks: Array<{ text: string; confidence?: number | null; boundingPoly?: unknown }>;
  source: {
    type: "file" | "path" | "url" | "base64";
    fileId?: string;
    path?: string;
    url?: string;
    mimeType?: string | null;
    bytes: number;
  };
  fallbackFrom?: string;
}

export type GoogleVisionOcrInput = OcrInput;
export type GoogleVisionOcrResult = OcrResult & { provider: "google_vision" };
export type TencentOcrInput = OcrInput;
export type TencentOcrResult = OcrResult & { provider: "tencent_ocr" };

let cachedClient: ImageAnnotatorClient | null = null;

export function isGoogleVisionOcrConfigured(): boolean {
  return Boolean(env.googleVisionCredentialsPath || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function isTencentOcrConfigured(): boolean {
  return Boolean(env.tencentOcrSecretId && env.tencentOcrSecretKey);
}

export async function runGoogleVisionOcr(input: GoogleVisionOcrInput): Promise<GoogleVisionOcrResult> {
  const image = await loadImageInput(input);
  const client = getGoogleVisionClient();
  const [response] = await withTimeout(
    client.documentTextDetection({ image: { content: image.buffer } }),
    env.googleVisionOcrTimeoutMs,
    "Google Vision OCR timed out.",
  );
  const annotation = response.fullTextAnnotation;
  const text = annotation?.text?.trim() || response.textAnnotations?.[0]?.description?.trim() || "";
  const pages = (annotation?.pages ?? []).map((page) => ({
    text,
    confidence: typeof page.confidence === "number" ? page.confidence : null,
  }));
  const blocks = (annotation?.pages ?? []).flatMap((page) =>
    (page.blocks ?? []).map((block) => ({
      text: (block.paragraphs ?? []).flatMap((paragraph) =>
        (paragraph.words ?? []).map((word) =>
          (word.symbols ?? []).map((symbol) => symbol.text ?? "").join(""),
        ),
      ).join(" ").trim(),
      confidence: typeof block.confidence === "number" ? block.confidence : null,
      boundingPoly: block.boundingBox ?? null,
    })).filter((block) => block.text.length > 0) ?? [],
  );

  return {
    provider: "google_vision",
    text,
    pages,
    blocks,
    source: image.source,
  };
}

export async function runTencentOcr(input: TencentOcrInput): Promise<TencentOcrResult> {
  if (!isTencentOcrConfigured()) {
    throw new Error("Tencent OCR credentials are not configured.");
  }

  const image = await loadImageInput(input);
  const response = await callTencentOcr({
    ImageBase64: image.buffer.toString("base64"),
  });
  const textDetections = Array.isArray(response.TextDetections) ? response.TextDetections : [];
  const blocks = textDetections.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      text: String(record.DetectedText ?? "").trim(),
      confidence: typeof record.Confidence === "number" ? record.Confidence : null,
      boundingPoly: record.Polygon ?? null,
    };
  }).filter((block) => block.text.length > 0);
  const text = blocks.map((block) => block.text).join("\n").trim();

  return {
    provider: "tencent_ocr",
    text,
    pages: text ? [{ text, confidence: averageConfidence(blocks) }] : [],
    blocks,
    source: image.source,
  };
}

function getGoogleVisionClient(): ImageAnnotatorClient {
  if (cachedClient) return cachedClient;
  if (!isGoogleVisionOcrConfigured()) {
    throw new Error("Google Vision OCR credentials are not configured.");
  }
  cachedClient = new ImageAnnotatorClient({
    keyFilename: env.googleVisionCredentialsPath || undefined,
    projectId: env.googleVisionProjectId || undefined,
  });
  return cachedClient;
}

async function callTencentOcr(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const host = env.tencentOcrEndpoint;
  const service = "ocr";
  const action = "GeneralBasicOCR";
  const version = "2018-11-19";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const credentialScope = `${date}/${service}/tc3_request`;
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedRequestPayload = sha256Hex(body);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join("\n");
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${env.tencentOcrSecretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${env.tencentOcrSecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await withTimeout(fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": env.tencentOcrRegion,
    },
    body,
  }), env.tencentOcrTimeoutMs, "Tencent OCR timed out.");

  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Tencent OCR returned non-JSON HTTP ${res.status}.`);
  }
  const response = typeof json.Response === "object" && json.Response !== null ? json.Response as Record<string, unknown> : json;
  const error = typeof response.Error === "object" && response.Error !== null ? response.Error as Record<string, unknown> : null;
  if (!res.ok || error) {
    const code = String(error?.Code ?? res.status);
    const message = String(error?.Message ?? raw.slice(0, 300));
    if (code === "FailedOperation.ImageNoText") {
      return { TextDetections: [] };
    }
    throw new Error(`Tencent OCR failed: ${code} ${message}`);
  }
  return response;
}

async function loadImageInput(input: GoogleVisionOcrInput): Promise<{
  buffer: Buffer;
  source: GoogleVisionOcrResult["source"];
}> {
  const fileId = clean(input.fileId);
  if (fileId) {
    const file = await FileModel.findById(fileId).lean();
    if (!file) throw new Error("OCR file not found.");
    if (input.workspaceId && String(file.workspaceId) !== input.workspaceId) {
      throw new Error("OCR file is outside this workspace.");
    }
    if (input.projectId && file.projectId && String(file.projectId) !== input.projectId) {
      throw new Error("OCR file is outside this project.");
    }
    const loaded = await loadStorageUrl(file.storageUrl);
    return {
      buffer: loaded.buffer,
      source: {
        type: loaded.type,
        fileId,
        url: loaded.url,
        mimeType: file.mimeType ?? loaded.mimeType,
        bytes: loaded.buffer.byteLength,
      },
    };
  }

  const base64 = clean(input.base64) || clean(input.imageBase64) || base64FromDataUrl(clean(input.content));
  if (base64) {
    const buffer = Buffer.from(stripDataUrlPrefix(base64), "base64");
    assertImageSize(buffer);
    return { buffer, source: { type: "base64", bytes: buffer.byteLength } };
  }

  const url = clean(input.imageUrl) || clean(input.url);
  if (url) {
    const loaded = await loadStorageUrl(url);
    return {
      buffer: loaded.buffer,
      source: { type: loaded.type, url: loaded.url, mimeType: loaded.mimeType, bytes: loaded.buffer.byteLength },
    };
  }

  const imagePath = clean(input.imagePath) || clean(input.path);
  if (imagePath) {
    const resolved = path.resolve(imagePath);
    const buffer = await fs.readFile(resolved);
    assertImageSize(buffer);
    return { buffer, source: { type: "path", path: resolved, bytes: buffer.byteLength } };
  }

  throw new Error("ocr_image requires fileId, path/imagePath, url/imageUrl, base64, or image content.");
}

async function loadStorageUrl(storageUrl: string): Promise<{
  buffer: Buffer;
  type: "url" | "base64";
  url?: string;
  mimeType?: string | null;
}> {
  if (storageUrl.startsWith("data:")) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(storageUrl);
    if (!match) throw new Error("Invalid image data URL.");
    const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
    assertImageSize(buffer);
    return { buffer, type: "base64", mimeType: match[1] ?? null };
  }

  if (!/^https?:\/\//i.test(storageUrl)) {
    throw new Error("OCR supports data URLs, HTTP(S) URLs, local paths, base64, or FileModel IDs.");
  }

  const res = await fetch(storageUrl);
  if (!res.ok) throw new Error(`Image fetch failed with HTTP ${res.status}.`);
  const buffer = Buffer.from(await res.arrayBuffer());
  assertImageSize(buffer);
  return {
    buffer,
    type: "url",
    url: storageUrl,
    mimeType: res.headers.get("content-type")?.split(";")[0] ?? null,
  };
}

function assertImageSize(buffer: Buffer): void {
  if (!buffer.byteLength) throw new Error("OCR image is empty.");
  if (buffer.byteLength > MAX_OCR_IMAGE_BYTES) {
    throw new Error(`OCR image exceeds ${MAX_OCR_IMAGE_BYTES} bytes.`);
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;,]+;base64,([\s\S]*)$/i.exec(value);
  return match ? match[1] : value;
}

function base64FromDataUrl(value: string): string {
  return /^data:[^;,]+;base64,/i.test(value) ? stripDataUrlPrefix(value) : "";
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function averageConfidence(blocks: Array<{ confidence?: number | null }>): number | null {
  const values = blocks.map((block) => block.confidence).filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
