/**
 * Splits an uploaded document into addressable pages of plain text.
 *
 * PDFs are parsed with pdfjs-dist (one entry per real page). Plain text and
 * markdown are split into pseudo-pages on form-feed boundaries when present,
 * otherwise into ~PAGE_TARGET_CHARS chunks at paragraph breaks. Anything else
 * is reported as `unsupported` so the caller can fall back gracefully.
 */

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
}

export type PaginationStatus = "ready" | "empty" | "unsupported" | "failed";

export interface PaginationResult {
  pages: ExtractedPage[];
  pageCount: number;
  status: PaginationStatus;
  warning?: string;
}

// Per-page and per-document guards so one huge book cannot blow past Mongo's
// 16MB document limit. A typical page is a few thousand chars; these caps only
// bite on pathological inputs.
const PER_PAGE_CHAR_CAP = 24_000;
const MAX_TOTAL_CHARS = 6_000_000;
const MAX_PAGES = 5_000;

// Target size for a pseudo-page when splitting un-paginated plain text.
const PAGE_TARGET_CHARS = 3_500;

/**
 * Loads ESM-only pdfjs-dist from CommonJS. Written via `new Function` so the
 * TypeScript->CommonJS build cannot rewrite it into a `require()` (which would
 * fail for an ESM module). tsx (dev) and Node 26 (prod) both honour it.
 */
const esmImport = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<unknown>;

export type DocumentKind = "pdf" | "text" | "unsupported";

export function detectDocumentKind(
  mimeType: string | null | undefined,
  filename: string | null | undefined,
): DocumentKind {
  const mime = (mimeType ?? "").toLowerCase();
  const name = (filename ?? "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("text/") ||
    mime.includes("markdown") ||
    mime.includes("json") ||
    mime.includes("csv") ||
    /\.(txt|md|markdown|csv|json|log|rtf)$/.test(name)
  ) {
    return "text";
  }
  return "unsupported";
}

export async function paginateDocument(
  buffer: Buffer,
  mimeType: string | null | undefined,
  filename: string | null | undefined,
): Promise<PaginationResult> {
  const kind = detectDocumentKind(mimeType, filename);
  try {
    if (kind === "pdf") return capResult(await paginatePdf(buffer));
    if (kind === "text") return capResult(paginateText(buffer.toString("utf8")));
    return {
      pages: [],
      pageCount: 0,
      status: "unsupported",
      warning: `No paginator for ${mimeType ?? filename ?? "this file type"}.`,
    };
  } catch (err) {
    return {
      pages: [],
      pageCount: 0,
      status: "failed",
      warning: `Pagination failed: ${(err as Error).message}`,
    };
  }
}

async function paginatePdf(buffer: Buffer): Promise<PaginationResult> {
  const pdfjs = (await esmImport("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfDocumentProxy> };
  };
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    // ERRORS only — silence pdfjs info/warn noise during text extraction.
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pages: ExtractedPage[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = joinTextItems(content.items);
    pages.push({ pageNumber: n, text, charCount: text.length });
  }
  await pdf.cleanup?.();
  const hasText = pages.some((p) => p.charCount > 0);
  return {
    pages,
    pageCount: pages.length,
    status: hasText ? "ready" : "empty",
    warning: hasText
      ? undefined
      : "No selectable text found (the PDF may be scanned images — OCR required).",
  };
}

function joinTextItems(items: PdfTextItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    parts.push(item.str);
    // pdfjs sets hasEOL at line ends; turn those into newlines so paragraphs
    // survive instead of collapsing into one run-on line.
    if (item.hasEOL) parts.push("\n");
    else parts.push(" ");
  }
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paginateText(raw: string): PaginationResult {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) {
    return { pages: [], pageCount: 0, status: "empty" };
  }

  // Respect explicit form-feed page breaks if the source carries them.
  if (normalized.includes("\f")) {
    const chunks = normalized.split("\f");
    const pages = chunks
      .map((chunk, ix) => makePage(ix + 1, chunk.trim()))
      .filter((p) => p.charCount > 0)
      .map((p, ix) => ({ ...p, pageNumber: ix + 1 }));
    return { pages, pageCount: pages.length, status: pages.length ? "ready" : "empty" };
  }

  // Otherwise chunk into ~PAGE_TARGET_CHARS pseudo-pages at paragraph breaks so
  // page references stay stable and meaningful.
  const paragraphs = normalized.split(/\n{2,}/);
  const pages: ExtractedPage[] = [];
  let current = "";
  const flush = () => {
    const text = current.trim();
    if (text) pages.push(makePage(pages.length + 1, text));
    current = "";
  };
  for (const para of paragraphs) {
    if (current && current.length + para.length > PAGE_TARGET_CHARS) flush();
    current += (current ? "\n\n" : "") + para;
    while (current.length > PAGE_TARGET_CHARS * 1.5) {
      // Hard-split a single oversized paragraph.
      const slice = current.slice(0, PAGE_TARGET_CHARS);
      pages.push(makePage(pages.length + 1, slice.trim()));
      current = current.slice(PAGE_TARGET_CHARS);
    }
  }
  flush();
  return { pages, pageCount: pages.length, status: pages.length ? "ready" : "empty" };
}

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, charCount: text.length };
}

/** Enforce per-page and per-document caps, truncating with a warning. */
function capResult(result: PaginationResult): PaginationResult {
  if (!result.pages.length) return result;
  const capped: ExtractedPage[] = [];
  let total = 0;
  let truncated = false;
  for (const page of result.pages) {
    if (capped.length >= MAX_PAGES) {
      truncated = true;
      break;
    }
    let text = page.text;
    if (text.length > PER_PAGE_CHAR_CAP) {
      text = text.slice(0, PER_PAGE_CHAR_CAP);
      truncated = true;
    }
    if (total + text.length > MAX_TOTAL_CHARS) {
      text = text.slice(0, Math.max(0, MAX_TOTAL_CHARS - total));
      truncated = true;
    }
    total += text.length;
    capped.push({ pageNumber: page.pageNumber, text, charCount: text.length });
    if (total >= MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
  }
  return {
    pages: capped,
    // Keep the real page count even when we stored fewer, so page references
    // still line up for the pages we did keep.
    pageCount: result.pageCount,
    status: result.status,
    warning: truncated
      ? [result.warning, "Document text was truncated to fit storage limits."]
          .filter(Boolean)
          .join(" ")
      : result.warning,
  };
}

// Minimal structural typings for the parts of pdfjs we touch.
interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}
interface PdfTextContent {
  items: PdfTextItem[];
}
interface PdfPageProxy {
  getTextContent: () => Promise<PdfTextContent>;
}
interface PdfDocumentProxy {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageProxy>;
  cleanup?: () => Promise<void>;
}
