import crypto from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { FileModel } from "../../models";
import { effectiveCloudConfig } from "../agents/cloudLlm";

const severitySchema = z.enum(["low", "medium", "high"]);

const problemSchema = z.object({
  type: z.string().min(1).default("design_issue"),
  severity: severitySchema.default("medium"),
  description: z.string().min(1).default("Design issue detected."),
});

const slideReviewSchema = z.object({
  slideNumber: z.number().int().positive().default(1),
  score: z.number().min(0).max(10),
  approved: z.boolean(),
  summary: z.string().default(""),
  problems: z.array(problemSchema).default([]),
  repairInstructions: z.array(z.string()).default([]),
  suggestedLayoutChange: z.string().default(""),
  contentWarnings: z.array(z.string()).default([]),
});

const deckReviewSchema = z.object({
  averageScore: z.number().min(0).max(10),
  approved: z.boolean(),
  deckSummary: z.string().default(""),
  deckProblems: z.array(problemSchema).default([]),
  slidesNeedingRepair: z.array(z.number().int().positive()).default([]),
  deckRepairInstructions: z.array(z.string()).default([]),
  slideReviews: z.array(slideReviewSchema).default([]),
});

export type VisionSlideReviewResult = z.infer<typeof slideReviewSchema> & {
  ok: true;
  provider: "openai_vision" | "tencent_hunyuan_vision";
  model: string;
  fallbackFrom?: string;
  providerFailures?: string[];
};

export type VisionDeckReviewResult = z.infer<typeof deckReviewSchema> & {
  ok: true;
  provider: "openai_vision" | "tencent_hunyuan_vision";
  model: string;
  fallbackFrom?: string;
  providerFailures?: string[];
};

export interface VisionSlideReviewInput {
  jobId?: string;
  deckId?: string;
  projectId?: string;
  workspaceId?: string;
  slideNumber?: number;
  slideTitle?: string;
  layoutId?: string;
  screenshotUrl?: string;
  fileId?: string;
  imageBase64?: string;
  deckBrief?: unknown;
  slidePlan?: unknown;
}

export interface VisionDeckReviewInput {
  jobId?: string;
  deckId?: string;
  projectId?: string;
  workspaceId?: string;
  screenshots: Array<{
    slideNumber?: number;
    title?: string;
    screenshotUrl?: string;
    fileId?: string;
    imageBase64?: string;
    layoutId?: string;
  }>;
  deckBrief?: unknown;
}

interface ImagePayload {
  dataUrl: string;
  mimeType: string;
  bytes: number;
}

export async function isVisionQaConfigured(): Promise<{ openai: boolean; tencent: boolean }> {
  const cfg = await effectiveCloudConfig();
  return {
    openai: Boolean(cfg.keys.openai || env.openaiApiKey),
    tencent: Boolean(env.tencentOcrSecretId && env.tencentOcrSecretKey),
  };
}

export async function reviewSlideWithVision(input: VisionSlideReviewInput): Promise<VisionSlideReviewResult> {
  const image = await loadImage(input);
  const failures: string[] = [];
  let result: VisionSlideReviewResult | null = null;

  const configured = await isVisionQaConfigured();
  if (configured.openai) {
    try {
      result = await reviewSlideWithOpenAI(input, image);
    } catch (err) {
      logVisionFailure("slide", "openai_vision", (err as Error).message);
      failures.push(`openai_vision: ${(err as Error).message}`);
    }
  }
  if (!result && configured.tencent) {
    try {
      result = await reviewSlideWithTencent(input, image);
      if (failures.length) result.fallbackFrom = "openai_vision";
    } catch (err) {
      logVisionFailure("slide", "tencent_hunyuan_vision", (err as Error).message);
      failures.push(`tencent_hunyuan_vision: ${(err as Error).message}`);
    }
  }
  if (!result) {
    throw new Error(`Vision QA failed: ${failures.join(" | ") || "No vision provider configured."}`);
  }
  result.providerFailures = failures;
  return result;
}

export async function reviewDeckWithVision(input: VisionDeckReviewInput): Promise<VisionDeckReviewResult> {
  const images = await Promise.all(input.screenshots.map((shot) => loadImage({ ...shot, workspaceId: input.workspaceId, projectId: input.projectId })));
  const failures: string[] = [];
  let result: VisionDeckReviewResult | null = null;
  const configured = await isVisionQaConfigured();

  if (configured.openai) {
    try {
      result = await reviewDeckWithOpenAI(input, images);
    } catch (err) {
      logVisionFailure("deck", "openai_vision", (err as Error).message);
      failures.push(`openai_vision: ${(err as Error).message}`);
    }
  }
  if (!result && configured.tencent) {
    try {
      result = await reviewDeckWithTencent(input, images);
      if (failures.length) result.fallbackFrom = "openai_vision";
    } catch (err) {
      logVisionFailure("deck", "tencent_hunyuan_vision", (err as Error).message);
      failures.push(`tencent_hunyuan_vision: ${(err as Error).message}`);
    }
  }
  if (!result) {
    throw new Error(`Vision deck QA failed: ${failures.join(" | ") || "No vision provider configured."}`);
  }
  result.providerFailures = failures;
  return result;
}

async function reviewSlideWithOpenAI(input: VisionSlideReviewInput, image: ImagePayload): Promise<VisionSlideReviewResult> {
  const cfg = await effectiveCloudConfig();
  const apiKey = cfg.keys.openai || env.openaiApiKey;
  const model = env.visionQaOpenaiModel;
  const res = await withTimeout(fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: slidePrompt(input) },
          { type: "image_url", image_url: { url: image.dataUrl } },
        ],
      }],
    }),
  }), env.visionQaTimeoutMs, "OpenAI vision QA timed out.");
  if (!res.ok) throw new Error(`OpenAI vision request failed: ${res.status} ${await res.text()}`);
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content ?? "";
  logVisionReturn("slide", "openai_vision", model, raw);
  const parsed = slideReviewSchema.parse(parseJson(raw));
  logVisionParsed("slide", "openai_vision", model, parsed);
  return { ok: true, provider: "openai_vision", model, ...parsed };
}

async function reviewDeckWithOpenAI(input: VisionDeckReviewInput, images: ImagePayload[]): Promise<VisionDeckReviewResult> {
  const cfg = await effectiveCloudConfig();
  const apiKey = cfg.keys.openai || env.openaiApiKey;
  const model = env.visionQaOpenaiModel;
  const content: unknown[] = [{ type: "text", text: deckPrompt(input) }];
  for (const [index, image] of images.entries()) {
    content.push({ type: "text", text: `Screenshot ${index + 1}: slide ${input.screenshots[index]?.slideNumber ?? index + 1}` });
    content.push({ type: "image_url", image_url: { url: image.dataUrl } });
  }
  const res = await withTimeout(fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 2600,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  }), env.visionQaTimeoutMs, "OpenAI deck vision QA timed out.");
  if (!res.ok) throw new Error(`OpenAI deck vision request failed: ${res.status} ${await res.text()}`);
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body.choices?.[0]?.message?.content ?? "";
  logVisionReturn("deck", "openai_vision", model, raw);
  const parsed = deckReviewSchema.parse(parseJson(raw));
  logVisionParsed("deck", "openai_vision", model, parsed);
  return { ok: true, provider: "openai_vision", model, ...parsed };
}

async function reviewSlideWithTencent(input: VisionSlideReviewInput, image: ImagePayload): Promise<VisionSlideReviewResult> {
  const model = env.visionQaTencentModel;
  const raw = await callTencentHunyuanVision(model, [
    slidePrompt(input),
    "",
    "Tencent fallback note: this provider endpoint expects string content in this environment, so review the provided slide metadata and screenshot availability metadata conservatively.",
    `Screenshot bytes: ${image.bytes}`,
    `Screenshot mimeType: ${image.mimeType}`,
  ].join("\n"));
  logVisionReturn("slide", "tencent_hunyuan_vision", model, raw);
  const parsed = slideReviewSchema.parse(parseJson(raw));
  logVisionParsed("slide", "tencent_hunyuan_vision", model, parsed);
  return { ok: true, provider: "tencent_hunyuan_vision", model, ...parsed };
}

async function reviewDeckWithTencent(input: VisionDeckReviewInput, images: ImagePayload[]): Promise<VisionDeckReviewResult> {
  const model = env.visionQaTencentModel;
  const raw = await callTencentHunyuanVision(model, [
    deckPrompt(input),
    "",
    "Tencent fallback note: this provider endpoint expects string content in this environment, so review the deck metadata and screenshot availability metadata conservatively.",
    `Screenshots: ${images.map((image, index) => `slide ${input.screenshots[index]?.slideNumber ?? index + 1}: ${image.bytes} bytes ${image.mimeType}`).join("; ")}`,
  ].join("\n"));
  logVisionReturn("deck", "tencent_hunyuan_vision", model, raw);
  const parsed = deckReviewSchema.parse(parseJson(raw));
  logVisionParsed("deck", "tencent_hunyuan_vision", model, parsed);
  return { ok: true, provider: "tencent_hunyuan_vision", model, ...parsed };
}

async function callTencentHunyuanVision(model: string, content: string): Promise<string> {
  const host = env.visionQaTencentEndpoint;
  const service = "hunyuan";
  const action = "ChatCompletions";
  const version = "2023-09-01";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify({
    Model: model,
    Messages: [{ Role: "user", Content: content }],
    Temperature: 0.1,
    Stream: false,
  });
  const credentialScope = `${date}/${service}/tc3_request`;
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256Hex(body)].join("\n");
  const stringToSign = ["TC3-HMAC-SHA256", String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join("\n");
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
      "X-TC-Region": env.visionQaTencentRegion,
    },
    body,
  }), env.visionQaTimeoutMs, "Tencent Hunyuan vision QA timed out.");
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Tencent Hunyuan returned non-JSON HTTP ${res.status}.`);
  }
  const response = typeof json.Response === "object" && json.Response !== null ? json.Response as Record<string, unknown> : json;
  const error = typeof response.Error === "object" && response.Error !== null ? response.Error as Record<string, unknown> : null;
  if (!res.ok || error) {
    throw new Error(`Tencent Hunyuan failed: ${String(error?.Code ?? res.status)} ${String(error?.Message ?? text.slice(0, 300))}`);
  }
  const choices = Array.isArray(response.Choices) ? response.Choices as Array<Record<string, unknown>> : [];
  const message = typeof choices[0]?.Message === "object" && choices[0]?.Message !== null ? choices[0].Message as Record<string, unknown> : {};
  return String(message.Content ?? response.Content ?? "");
}

async function loadImage(input: { screenshotUrl?: string; fileId?: string; imageBase64?: string; workspaceId?: string; projectId?: string }): Promise<ImagePayload> {
  if (input.imageBase64) return dataUrlFromBase64(input.imageBase64, "image/png");
  if (input.fileId) return loadFileImage(input.fileId, input.workspaceId, input.projectId);
  const url = String(input.screenshotUrl ?? "").trim();
  if (!url) throw new Error("Vision QA requires screenshotUrl, fileId, or imageBase64.");
  if (url.startsWith("data:")) return dataUrlFromDataUrl(url);
  const fileId = /\/exports\/([^/]+)\/download/.exec(url)?.[1];
  if (fileId) return loadFileImage(fileId, input.workspaceId, input.projectId);
  if (/^https?:\/\//i.test(url)) return loadRemoteImage(url);
  throw new Error("Vision QA screenshotUrl must be data URL, cloud export download URL, or HTTP(S) URL.");
}

async function loadFileImage(fileId: string, workspaceId?: string, projectId?: string): Promise<ImagePayload> {
  const file = await FileModel.findById(fileId).lean();
  if (!file) throw new Error("Screenshot file not found.");
  if (workspaceId && String(file.workspaceId) !== workspaceId) throw new Error("Screenshot is outside this workspace.");
  if (projectId && file.projectId && String(file.projectId) !== projectId) throw new Error("Screenshot is outside this project.");
  return dataUrlFromDataUrl(file.storageUrl);
}

async function loadRemoteImage(url: string): Promise<ImagePayload> {
  const res = await withTimeout(fetch(url), env.visionQaTimeoutMs, "Vision QA image fetch timed out.");
  if (!res.ok) throw new Error(`Vision QA image fetch failed: HTTP ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`, mimeType, bytes: buffer.byteLength };
}

function dataUrlFromBase64(base64: string, mimeType: string): ImagePayload {
  const clean = base64.replace(/^data:[^;,]+;base64,/i, "");
  return { dataUrl: `data:${mimeType};base64,${clean}`, mimeType, bytes: Buffer.byteLength(clean, "base64") };
}

function dataUrlFromDataUrl(dataUrl: string): ImagePayload {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL.");
  const mimeType = match[1] || "image/png";
  const buffer = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`, mimeType, bytes: buffer.byteLength };
}

function slidePrompt(input: VisionSlideReviewInput): string {
  return [
    "You are YDeck Vision QA, a senior presentation design director.",
    "Review this slide screenshot as a professional PPT slide.",
    "",
    "Evaluate visual hierarchy, readability, spacing, alignment, information density, whitespace, contrast, layout suitability, professional polish, whether content looks final or generic, and whether the slide is ready for business presentation use.",
    "Scoring: 9-10 premium human-level, 8-8.9 professional and ready, 7-7.9 acceptable but can improve, 6-6.9 clean but generic, 5-5.9 weak and needs repair, below 5 reject.",
    "Do not give 10 unless the slide is truly premium.",
    `Approval threshold: ${env.visionQaApprovalThreshold}.`,
    "",
    "Return only valid JSON with keys: slideNumber, score, approved, summary, problems, repairInstructions, suggestedLayoutChange, contentWarnings.",
    "Each problem must include type, severity low|medium|high, and description.",
    "",
    JSON.stringify({
      slideNumber: input.slideNumber ?? 1,
      slideTitle: input.slideTitle ?? "",
      layoutId: input.layoutId ?? "",
      deckBrief: input.deckBrief ?? null,
      slidePlan: input.slidePlan ?? null,
    }),
  ].join("\n");
}

function deckPrompt(input: VisionDeckReviewInput): string {
  return [
    "You are YDeck Vision QA, a senior presentation design director.",
    "Review these slide screenshots together as one professional deck.",
    "Check consistency, rhythm, repeated layouts, color discipline, story flow, weak slides, data visualization strength, and business polish.",
    `Deck approval threshold: ${env.visionQaDeckApprovalThreshold}.`,
    "Return only valid JSON with keys: averageScore, approved, deckSummary, deckProblems, slidesNeedingRepair, deckRepairInstructions, slideReviews.",
    "Each deckProblem and slide problem must include type, severity low|medium|high, and description.",
    JSON.stringify({
      deckBrief: input.deckBrief ?? null,
      screenshots: input.screenshots.map((shot, index) => ({
        slideNumber: shot.slideNumber ?? index + 1,
        title: shot.title ?? "",
        layoutId: shot.layoutId ?? "",
      })),
    }),
  ].join("\n");
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) throw new Error("Vision QA did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function logVisionReturn(scope: "slide" | "deck", provider: string, model: string, raw: string): void {
  if (!env.agentFlowLogOutput) return;
  const payload = {
    scope,
    provider,
    model,
    rawLength: raw.length,
    raw: raw.slice(0, 6000),
  };
  logger.info(payload, "vision_qa.return_raw");
  console.log("[ydeck:vision:return]", JSON.stringify(payload, null, 2));
}

function logVisionParsed(scope: "slide" | "deck", provider: string, model: string, parsed: z.infer<typeof slideReviewSchema> | z.infer<typeof deckReviewSchema>): void {
  if (!env.agentFlowLogOutput) return;
  const payload = scope === "slide"
    ? {
        scope,
        provider,
        model,
        score: (parsed as z.infer<typeof slideReviewSchema>).score,
        approved: (parsed as z.infer<typeof slideReviewSchema>).approved,
        problemCount: (parsed as z.infer<typeof slideReviewSchema>).problems.length,
        repairInstructionCount: (parsed as z.infer<typeof slideReviewSchema>).repairInstructions.length,
        parsed,
      }
    : {
        scope,
        provider,
        model,
        averageScore: (parsed as z.infer<typeof deckReviewSchema>).averageScore,
        approved: (parsed as z.infer<typeof deckReviewSchema>).approved,
        deckProblemCount: (parsed as z.infer<typeof deckReviewSchema>).deckProblems.length,
        slidesNeedingRepair: (parsed as z.infer<typeof deckReviewSchema>).slidesNeedingRepair,
        parsed,
      };
  logger.info(payload, "vision_qa.return_parsed");
  console.log("[ydeck:vision:parsed]", JSON.stringify(payload, null, 2));
}

function logVisionFailure(scope: "slide" | "deck", provider: string, error: string): void {
  if (!env.agentFlowLogOutput) return;
  const payload = { scope, provider, error: error.slice(0, 2000) };
  logger.warn(payload, "vision_qa.provider_failed");
  console.log("[ydeck:vision:error]", JSON.stringify(payload, null, 2));
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
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
