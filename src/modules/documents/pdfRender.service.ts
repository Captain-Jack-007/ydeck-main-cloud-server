/**
 * Rasterizes PDF pages to PNG images using pdfjs-dist + @napi-rs/canvas.
 *
 * Used to surface page thumbnails and to let decks reuse figures/pages from an
 * uploaded book. Rendering is comparatively heavy, so callers render only the
 * page ranges they need (never the whole book at ingest).
 */
import { createCanvas } from "@napi-rs/canvas";

export interface RenderedPage {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
}

// Loads ESM-only pdfjs from CommonJS without tsc rewriting it to require().
const esmImport = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<unknown>;

interface PdfPageProxy {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
}
interface PdfDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
  cleanup?: () => Promise<void>;
}

export async function renderPdfPages(
  buffer: Buffer,
  pageNumbers: number[],
  scale = 2,
): Promise<RenderedPage[]> {
  const pdfjs = (await esmImport("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfDocumentProxy> };
  };
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const wanted = Array.from(new Set(pageNumbers))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= pdf.numPages)
    .sort((a, b) => a - b);

  const out: RenderedPage[] = [];
  for (const n of wanted) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ pageNumber: n, png: canvas.toBuffer("image/png"), width, height });
  }
  await pdf.cleanup?.();
  return out;
}
