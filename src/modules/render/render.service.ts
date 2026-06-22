import crypto from "node:crypto";

import { chromium, type Browser } from "playwright";

import { env } from "../../config/env";
import { FileModel } from "../../models";

export interface RenderSlideInput {
  html: string;
  slideNumber?: number;
  jobId?: string;
  deckId?: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
  width?: number;
  height?: number;
  format?: "png";
  deviceScaleFactor?: number;
}

export interface RenderScreenshotResult {
  ok: true;
  slideNumber: number;
  screenshotUrl: string;
  fileId?: string;
  width: number;
  height: number;
  format: "png";
  bytes: number;
  renderedAt: string;
  metadata: {
    renderer: "playwright_chromium";
    deviceScaleFactor: number;
    selector: string;
    jobId?: string;
    deckId?: string;
  };
}

let browserPromise: Promise<Browser> | null = null;

export async function renderSlideScreenshot(input: RenderSlideInput): Promise<RenderScreenshotResult> {
  if (!env.renderServiceEnabled) {
    throw new Error("Render service is disabled.");
  }
  if (!input.html?.trim()) throw new Error("render_slide_screenshot requires html.");

  const width = positiveInt(input.width, env.renderViewportWidth);
  const height = positiveInt(input.height, env.renderViewportHeight);
  const deviceScaleFactor = positiveNumber(input.deviceScaleFactor, env.renderDeviceScaleFactor);
  const slideNumber = positiveInt(input.slideNumber, 1);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(env.renderTimeoutMs);
  page.setDefaultNavigationTimeout(env.renderTimeoutMs);

  try {
    await page.setContent(wrapSlideHtml(input.html, width, height), { waitUntil: "networkidle", timeout: env.renderTimeoutMs });
    await page.addStyleTag({ content: disableAnimationCss() });
    await waitForRenderReady(page);
    const locator = page.locator(".ydeck-slide").first();
    const count = await locator.count();
    const screenshot = count > 0
      ? await locator.screenshot({ type: "png", timeout: env.renderTimeoutMs })
      : await page.screenshot({ type: "png", fullPage: false, timeout: env.renderTimeoutMs });
    const renderedAt = new Date().toISOString();
    const stored = await storeScreenshot(input, screenshot, slideNumber, renderedAt, width, height, deviceScaleFactor);
    return {
      ok: true,
      slideNumber,
      screenshotUrl: stored.screenshotUrl,
      fileId: stored.fileId,
      width,
      height,
      format: "png",
      bytes: screenshot.byteLength,
      renderedAt,
      metadata: {
        renderer: "playwright_chromium",
        deviceScaleFactor,
        selector: count > 0 ? ".ydeck-slide" : "page",
        jobId: input.jobId,
        deckId: input.deckId,
      },
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function renderDeckScreenshots(input: {
  slides: Array<RenderSlideInput & { slideNumber?: number }>;
  jobId?: string;
  deckId?: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}): Promise<RenderScreenshotResult[]> {
  const results: RenderScreenshotResult[] = [];
  for (const [index, slide] of input.slides.entries()) {
    results.push(await renderSlideScreenshot({
      ...slide,
      jobId: slide.jobId ?? input.jobId,
      deckId: slide.deckId ?? input.deckId,
      projectId: slide.projectId ?? input.projectId,
      workspaceId: slide.workspaceId ?? input.workspaceId,
      userId: slide.userId ?? input.userId,
      width: slide.width ?? input.width,
      height: slide.height ?? input.height,
      deviceScaleFactor: slide.deviceScaleFactor ?? input.deviceScaleFactor,
      slideNumber: slide.slideNumber ?? index + 1,
    }));
  }
  return results;
}

async function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({
    headless: true,
    executablePath: env.renderChromiumExecutablePath || undefined,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  return browserPromise;
}

async function storeScreenshot(
  input: RenderSlideInput,
  buffer: Buffer,
  slideNumber: number,
  renderedAt: string,
  width: number,
  height: number,
  deviceScaleFactor: number,
): Promise<{ screenshotUrl: string; fileId?: string }> {
  const storageUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  const filename = `slide_${String(slideNumber).padStart(3, "0")}.png`;
  if (!input.workspaceId) {
    return { screenshotUrl: storageUrl };
  }
  const file = await FileModel.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? input.deckId ?? null,
    scope: "job",
    kind: "render_screenshot",
    filename,
    mimeType: "image/png",
    sizeBytes: buffer.byteLength,
    storageUrl,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    meta: {
      source: "render_service",
      renderer: "playwright_chromium",
      slideNumber,
      jobId: input.jobId ?? null,
      deckId: input.deckId ?? input.projectId ?? null,
      width,
      height,
      deviceScaleFactor,
      renderedAt,
    },
  });
  return { fileId: file.id, screenshotUrl: `/v1/cloud/exports/${file.id}/download` };
}

function wrapSlideHtml(html: string, width: number, height: number): string {
  const hasDocument = /<!doctype html|<html[\s>]/i.test(html);
  const baseCss = `
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #fff;
    }
    body {
      display: grid;
      place-items: center;
    }
    .ydeck-slide {
      width: ${width}px;
      height: ${height}px;
      box-sizing: border-box;
      overflow: hidden;
    }
    img, svg, video, canvas {
      max-width: 100%;
    }
  `;
  if (hasDocument) {
    return html.replace(/<\/head>/i, `<style>${baseCss}</style></head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss}</style></head><body>${html}</body></html>`;
}

function disableAnimationCss(): string {
  return `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  `;
}

async function waitForRenderReady(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    }));
  });
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
