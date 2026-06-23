/**
 * HTML-measurement PPTX renderer.
 *
 *   deck artifact → buildDeckHtml → headless Chromium lays it out / wraps text
 *     → read per-element geometry + computed styles → emit native PptxGenJS
 *       objects (text boxes, shapes, tables) at the measured coordinates
 *
 * The browser is the single layout authority, so the editable export matches
 * what the preview shows. The 1920x1080 HTML canvas maps 1:1 to PPTX
 * LAYOUT_WIDE (13.333x7.5 in) at 144 PPI. Returns the .pptx as a Buffer so the
 * caller can persist it however it likes (the cloud stores it on a File doc).
 *
 * Playwright is imported dynamically so the rest of the server never hard-
 * depends on a Chromium build being installed.
 */
import PptxGenJS from "pptxgenjs";
import type { CloudDeckArtifact } from "../agents/tools/cloudDeck.tools";
import { buildDeckHtml } from "./buildDeckHtml";
import { getTheme } from "./theme";

const PPI = 144;
const inFromPx = (px: number) => px / PPI;
const ptFromPx = (px: number) => px * (72 / PPI);
const PAGE_TIMEOUT_MS = 20_000;

interface Box { x: number; y: number; w: number; h: number }
interface ExShape { box: Box; fill: string | null; border: { color: string; width: number } | null; radius: number }
interface ExText {
  box: Box; text: string; color: string; fontSizePx: number; fontFamily: string;
  weight: number; italic: boolean; align: string; uppercase: boolean; letterSpacingPx: number;
}
interface ExTableCell { text: string; color: string; fill: string; bold: boolean }
interface ExTable { box: Box; headers: ExTableCell[]; rows: ExTableCell[][]; fontSizePx: number; fontFamily: string; borderColor: string }
interface ExSlide { bg: string; shapes: ExShape[]; texts: ExText[]; tables: ExTable[] }

// In-page extractor. Annotated `any` for DOM since this Node project has no DOM
// lib; it only ever runs inside the browser.
function extractAllSlides(): ExSlide[] {
  const doc: any = (globalThis as any).document;
  const gcs: any = (globalThis as any).getComputedStyle;
  const alpha = (c: string): number => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c === "transparent" ? 0 : 1;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    return p.length >= 4 ? p[3] : 1;
  };
  const hasOwnText = (el: any): boolean => {
    for (const n of Array.from(el.childNodes) as any[]) {
      if (n.nodeType === 3 && (n.textContent ?? "").trim()) return true;
    }
    return false;
  };
  const isTextLeaf = (el: any): boolean => {
    if (!(el.textContent ?? "").trim()) return false;
    for (const c of Array.from(el.querySelectorAll("*")) as any[]) {
      if (hasOwnText(c)) return false;
    }
    return hasOwnText(el) || el.children.length === 0;
  };

  return Array.from(doc.querySelectorAll(".ydeck-slide")).map((slide: any) => {
    const sr = slide.getBoundingClientRect();
    const scale = 1920 / sr.width;
    const norm = (el: any): Box => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - sr.left) * scale, y: (r.top - sr.top) * scale, w: r.width * scale, h: r.height * scale };
    };
    const cs = (el: any, pseudo?: string) => gcs(el, pseudo);
    const shapes: ExShape[] = [];
    const texts: ExText[] = [];
    const tables: ExTable[] = [];

    const skip = new Set<any>();
    slide.querySelectorAll("table").forEach((table: any) => {
      table.querySelectorAll("*").forEach((d: any) => skip.add(d));
      skip.add(table);
      const ts = cs(table);
      const cell = (el: any): ExTableCell => {
        const s = cs(el);
        return { text: el.innerText, color: s.color, fill: s.backgroundColor, bold: (parseInt(s.fontWeight, 10) || 400) >= 600 };
      };
      tables.push({
        box: norm(table),
        headers: Array.from(table.querySelectorAll("thead th")).map(cell),
        rows: Array.from(table.querySelectorAll("tbody tr")).map((tr: any) =>
          Array.from(tr.querySelectorAll("td")).map(cell)
        ),
        fontSizePx: parseFloat(ts.fontSize) * scale,
        fontFamily: ts.fontFamily,
        borderColor: ts.borderBottomColor,
      });
    });

    Array.from(slide.querySelectorAll("*")).forEach((el: any) => {
      if (skip.has(el)) return;
      const s = cs(el);
      const box = norm(el);
      const bgVisible = alpha(s.backgroundColor) > 0;
      const sides = ["Top", "Right", "Bottom", "Left"] as const;
      const sideW = sides.map((n) => parseFloat(s.getPropertyValue(`border-${n.toLowerCase()}-width`)) || 0);
      const sideC = sides.map((n) => s.getPropertyValue(`border-${n.toLowerCase()}-color`));
      const sideVis = sideW.map((w, i) => w > 0 && alpha(sideC[i]) > 0);
      const uniform = sideVis.every(Boolean) && sideW.every((w) => Math.abs(w - sideW[0]) < 0.5);
      const radius = parseFloat(s.borderTopLeftRadius) * scale || 0;

      if (bgVisible) {
        shapes.push({ box, fill: s.backgroundColor, border: uniform ? { color: sideC[0], width: sideW[0] * scale } : null, radius });
      }
      if (!uniform) {
        sideVis.forEach((vis, i) => {
          if (!vis) return;
          const w = sideW[i] * scale;
          let strip: Box;
          if (i === 0) strip = { x: box.x, y: box.y, w: box.w, h: w };
          else if (i === 1) strip = { x: box.x + box.w - w, y: box.y, w, h: box.h };
          else if (i === 2) strip = { x: box.x, y: box.y + box.h - w, w: box.w, h: w };
          else strip = { x: box.x, y: box.y, w, h: box.h };
          shapes.push({ box: strip, fill: sideC[i], border: null, radius: 0 });
        });
      }

      const before = cs(el, "::before");
      if (before.content && before.content !== "none" && before.content !== "normal" && before.position === "absolute" && alpha(before.backgroundColor) > 0) {
        const bw = parseFloat(before.width);
        const bh = parseFloat(before.height);
        const bl = parseFloat(before.left);
        const bt = parseFloat(before.top);
        if ([bw, bh, bl, bt].every((n) => Number.isFinite(n)) && bw > 0) {
          shapes.push({
            box: { x: box.x + bl * scale, y: box.y + bt * scale, w: bw * scale, h: bh * scale },
            fill: before.backgroundColor, border: null, radius: parseFloat(before.borderTopLeftRadius) * scale || 0,
          });
        }
      }

      if (isTextLeaf(el)) {
        const ls = parseFloat(s.letterSpacing);
        texts.push({
          box, text: el.innerText, color: s.color, fontSizePx: parseFloat(s.fontSize) * scale,
          fontFamily: s.fontFamily, weight: parseInt(s.fontWeight, 10) || 400, italic: s.fontStyle === "italic",
          align: s.textAlign, uppercase: s.textTransform === "uppercase",
          letterSpacingPx: Number.isFinite(ls) ? ls * scale : 0,
        });
      }
    });

    return { bg: cs(slide).backgroundColor, shapes, texts, tables };
  });
}

function rgbToHex(rgb: string | null): { hex: string; alpha: number } {
  if (!rgb) return { hex: "000000", alpha: 0 };
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) {
    const hx = rgb.replace(/^#/, "");
    return /^[0-9a-f]{6}$/i.test(hx) ? { hex: hx.toUpperCase(), alpha: 1 } : { hex: "000000", alpha: 1 };
  }
  const p = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = p;
  const hex = [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { hex, alpha: a };
}
function firstFontFace(stack: string): string {
  return (stack.split(",")[0]?.trim() ?? "Arial").replace(/['"]/g, "");
}
type Align = "left" | "center" | "right";
const toAlign = (a: string): Align => (a === "center" ? "center" : a === "right" ? "right" : "left");

function emitSlide(slide: PptxGenJS.Slide, data: ExSlide, speakerNotes?: string): void {
  slide.background = { color: rgbToHex(data.bg).hex };

  for (const sh of data.shapes) {
    const fill = rgbToHex(sh.fill);
    if (fill.alpha === 0 && !sh.border) continue;
    const rounded = sh.radius > 1;
    slide.addShape(rounded ? "roundRect" : "rect", {
      x: inFromPx(sh.box.x), y: inFromPx(sh.box.y), w: inFromPx(sh.box.w), h: inFromPx(sh.box.h),
      fill: fill.alpha > 0 ? { color: fill.hex } : { type: "none" },
      line: sh.border ? { color: rgbToHex(sh.border.color).hex, width: ptFromPx(sh.border.width) } : { type: "none" },
      ...(rounded ? { rectRadius: inFromPx(sh.radius) } : {}),
    });
  }

  for (const t of data.texts) {
    slide.addText(t.uppercase ? t.text.toUpperCase() : t.text, {
      x: inFromPx(t.box.x), y: inFromPx(t.box.y), w: inFromPx(t.box.w), h: inFromPx(t.box.h) + 0.04,
      fontFace: firstFontFace(t.fontFamily), fontSize: ptFromPx(t.fontSizePx), color: rgbToHex(t.color).hex,
      bold: t.weight >= 600, italic: t.italic, align: toAlign(t.align), valign: "top",
      charSpacing: t.letterSpacingPx ? ptFromPx(t.letterSpacingPx) : undefined, margin: 0, isTextBox: true,
    });
  }

  for (const tbl of data.tables) {
    const headerFill = tbl.headers[0] ? rgbToHex(tbl.headers[0].fill) : null;
    const rows: PptxGenJS.TableRow[] = [];
    if (tbl.headers.length) {
      rows.push(tbl.headers.map((h) => ({
        text: h.text,
        options: { bold: true, color: rgbToHex(h.color).hex, fill: headerFill && headerFill.alpha > 0 ? { color: headerFill.hex } : undefined },
      })));
    }
    for (const r of tbl.rows) {
      rows.push(r.map((c) => {
        const cf = rgbToHex(c.fill);
        return { text: c.text, options: { color: rgbToHex(c.color).hex, bold: c.bold, fill: cf.alpha > 0 ? { color: cf.hex } : undefined } };
      }));
    }
    if (!rows.length) continue;
    slide.addTable(rows, {
      x: inFromPx(tbl.box.x), y: inFromPx(tbl.box.y), w: inFromPx(tbl.box.w),
      fontFace: firstFontFace(tbl.fontFamily), fontSize: ptFromPx(tbl.fontSizePx), valign: "middle",
      border: { type: "solid", pt: 0.5, color: rgbToHex(tbl.borderColor).hex },
    });
  }

  if (speakerNotes) slide.addNotes(speakerNotes);
}

async function launchChromium() {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error('PPTX export needs the "playwright" package (run `npm install`).');
  }
  try {
    return await playwright.chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch (err) {
    throw new Error(`PPTX export could not launch Chromium — run \`npx playwright install chromium\`. (${(err as Error).message})`);
  }
}

/**
 * Render a deck artifact to an editable .pptx and return it as a Buffer.
 * A browser is launched per export — simple and leak-free for this workload.
 */
export async function renderDeckArtifactToPptx(deck: CloudDeckArtifact): Promise<Buffer> {
  const html = buildDeckHtml(deck, getTheme(deck.designStyle));

  const browser = await launchChromium();
  let slidesData: ExSlide[];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1120 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    await page.setContent(html, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });
    await page.evaluate("document.fonts && document.fonts.ready ? document.fonts.ready : null");
    await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f);");
    slidesData = (await page.evaluate(extractAllSlides)) as ExSlide[];
  } finally {
    await browser.close();
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "YDECK_WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "YDECK_WIDE";
  pptx.title = deck.deckTitle;
  pptx.company = "YDeck";

  slidesData.forEach((data, i) => {
    emitSlide(pptx.addSlide(), data, deck.slides[i]?.speakerNotes);
  });

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
