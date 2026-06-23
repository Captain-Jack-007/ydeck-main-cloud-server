/**
 * Pixel-perfect PDF export. Screenshots each slide from the same HTML the PPTX
 * exporter measures and assembles the images into a landscape 16:9 PDF (one
 * slide per page), so the PDF matches the on-screen preview exactly. PDF is a
 * print/share format, so slides are full images (not editable) by design.
 */
import { PDFDocument } from "pdf-lib";
import type { CloudDeckArtifact } from "../agents/tools/cloudDeck.tools";
import { buildDeckHtml } from "./buildDeckHtml";
import { getTheme } from "./theme";

const PAGE_TIMEOUT_MS = 20_000;
const PAGE_W = 960; // 13.333in * 72pt  (matches the slide canvas aspect)
const PAGE_H = 540; // 7.5in    * 72pt

export async function renderDeckArtifactToPdf(
  deck: CloudDeckArtifact
): Promise<Buffer> {
  const html = buildDeckHtml(deck, getTheme(deck.designStyle));

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error('PDF export needs the "playwright" package (run `npm install`).');
  }
  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>>;
  try {
    browser = await playwright.chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (err) {
    throw new Error(
      `PDF export could not launch Chromium — run \`npx playwright install chromium\`. (${(err as Error).message})`
    );
  }

  const shots: Buffer[] = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1120 },
      deviceScaleFactor: 2,
    });
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    await page.setContent(html, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
    await page.evaluate("document.fonts && document.fonts.ready ? document.fonts.ready : null");
    // Flatten the slide's own rounded corners / shadow so each full-bleed page
    // has no transparent edges.
    await page.addStyleTag({
      content: ".ydeck-slide{border-radius:0 !important;box-shadow:none !important}",
    });
    const handles = await page.locator(".ydeck-slide").elementHandles();
    for (const h of handles) {
      shots.push((await h.screenshot({ type: "png" })) as Buffer);
    }
  } finally {
    await browser.close();
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(deck.deckTitle);
  for (const shot of shots) {
    const img = await pdf.embedPng(shot);
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  }
  if (shots.length === 0) pdf.addPage([PAGE_W, PAGE_H]); // never a 0-page PDF
  return Buffer.from(await pdf.save());
}
