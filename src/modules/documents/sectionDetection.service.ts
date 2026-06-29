/**
 * Detects chapters / lessons / units inside a paginated source so the agent can
 * resolve "Lesson 5" or "the grammar section" to a concrete page range.
 *
 * Heuristic and dependency-free: scans each page's text for heading lines
 * (numbered like "Lesson 5"/"Chapter 2"/"Unit 3", or named like "Vocabulary"/
 * "Grammar Focus"), then turns the ordered headings into page ranges. Also flags
 * whether a table-of-contents page is present. Embeddings/LLM-based detection is
 * a later phase.
 */
import type { BookSectionType } from "../../models/enums";
import type { ExtractedPage } from "./documentPagination.service";

export interface DetectedSection {
  type: BookSectionType;
  title: string;
  number: string | null;
  startPage: number;
  endPage: number;
  keywords: string[];
  order: number;
}

export interface SectionDetectionResult {
  sections: DetectedSection[];
  tocDetected: boolean;
}

// Numbered headings: "Lesson 5", "Unit 3 — Animals", "Chapter II: Intro".
const NUMBERED_HEADING =
  /^\s*(chapter|lesson|unit|section|part|module)\s+([0-9]{1,3}|[ivxlcdm]{1,7})\b[\s:.\-–—]*(.{0,80})$/i;

// Named headings common in textbooks (no number).
const NAMED_HEADINGS = [
  "vocabulary",
  "grammar focus",
  "grammar",
  "reading practice",
  "reading passage",
  "reading",
  "listening",
  "speaking",
  "writing",
  "review",
  "exercises",
  "summary",
  "introduction",
  "conclusion",
  "glossary",
  "appendix",
];

const TYPE_ALIASES: Record<string, BookSectionType> = {
  chapter: "chapter",
  lesson: "lesson",
  unit: "unit",
  section: "section",
  part: "part",
  module: "module",
};

interface HeadingHit {
  type: BookSectionType;
  title: string;
  number: string | null;
  page: number;
}

export function detectSections(pages: ExtractedPage[]): SectionDetectionResult {
  if (!pages.length) return { sections: [], tocDetected: false };
  const lastPage = pages[pages.length - 1].pageNumber;

  const tocDetected = detectTableOfContents(pages);
  const hits: HeadingHit[] = [];

  for (const page of pages) {
    const lines = page.text.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length < 3 || line.length > 90) continue;

      const numbered = NUMBERED_HEADING.exec(line);
      if (numbered) {
        const kind = numbered[1].toLowerCase();
        const type = TYPE_ALIASES[kind] ?? "section";
        const number = normalizeNumber(numbered[2]);
        const tail = numbered[3]?.trim() ?? "";
        const title = tail
          ? `${capitalize(kind)} ${number}${tail ? `: ${tail}` : ""}`
          : `${capitalize(kind)} ${number}`;
        hits.push({ type, title, number, page: page.pageNumber });
        continue;
      }

      const named = matchNamedHeading(line);
      if (named) {
        hits.push({ type: "section", title: named, number: null, page: page.pageNumber });
      }
    }
  }

  const deduped = dedupeHeadings(hits);
  if (!deduped.length) return { sections: [], tocDetected };

  const pageText = new Map(pages.map((p) => [p.pageNumber, p.text]));
  const sections: DetectedSection[] = deduped.map((hit, ix) => {
    const next = deduped[ix + 1];
    const endPage = next ? Math.max(hit.page, next.page - 1) : lastPage;
    // Keywords come from the heading itself plus the opening of the section's
    // first page, so natural references like "the grammar section" or "the
    // chapter about animals" can be matched even when the topic is on its own
    // line rather than in the heading.
    const keywords = Array.from(
      new Set([
        ...keywordsFromTitle(hit.title),
        ...keywordsFromText(pageText.get(hit.page) ?? "", hit.title),
      ]),
    ).slice(0, 10);
    return {
      type: hit.type,
      title: hit.title,
      number: hit.number,
      startPage: hit.page,
      endPage,
      keywords,
      order: ix,
    };
  });

  return { sections, tocDetected };
}

function matchNamedHeading(line: string): string | null {
  const lower = line.toLowerCase().replace(/[:.\-–—]+$/, "").trim();
  // Only treat as a heading when the line *is* the heading (short, standalone).
  if (lower.split(/\s+/).length > 4) return null;
  for (const name of NAMED_HEADINGS) {
    if (lower === name) return capitalizeWords(name);
  }
  return null;
}

function dedupeHeadings(hits: HeadingHit[]): HeadingHit[] {
  const sorted = [...hits].sort((a, b) => a.page - b.page);
  const out: HeadingHit[] = [];
  const seen = new Set<string>();
  for (const hit of sorted) {
    const key = `${hit.type}|${hit.number ?? hit.title.toLowerCase()}`;
    // Skip exact repeats (e.g. a running header repeated on every page) and
    // headings that collide on the same page.
    if (seen.has(key)) continue;
    if (out.length && out[out.length - 1].page === hit.page) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function detectTableOfContents(pages: ExtractedPage[]): boolean {
  const scan = pages.slice(0, Math.min(pages.length, 12));
  for (const page of scan) {
    const lower = page.text.toLowerCase();
    if (!/(table of contents|^\s*contents\s*$|\bcontents\b)/m.test(lower)) continue;
    // A real TOC page has several "Title .... 23" dotted/number-terminated lines.
    const tocLines = page.text
      .split("\n")
      .filter((l) => /\.{2,}\s*\d{1,4}\s*$/.test(l) || /\s\d{1,4}\s*$/.test(l.trim())).length;
    if (tocLines >= 3) return true;
  }
  return false;
}

function normalizeNumber(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (/^[0-9]+$/.test(value)) return value;
  const roman = romanToInt(value);
  return roman ? String(roman) : value;
}

function romanToInt(roman: string): number | null {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = roman.length - 1; i >= 0; i -= 1) {
    const cur = map[roman[i]];
    if (!cur) return null;
    if (cur < prev) total -= cur;
    else {
      total += cur;
      prev = cur;
    }
  }
  return total > 0 ? total : null;
}

const HEADING_STOPWORDS = new Set([
  "chapter", "lesson", "unit", "section", "part", "module", "topic", "page",
  "the", "and", "for", "from", "about", "with", "into", "this", "that", "your",
  "what", "when", "where", "how", "body", "text", "number", "focus", "practice",
]);

function keywordsFromTitle(title: string): string[] {
  return Array.from(
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !HEADING_STOPWORDS.has(w)),
    ),
  ).slice(0, 8);
}

// Pull a few salient words from the opening of a section's first page.
function keywordsFromText(text: string, title: string): string[] {
  if (!text) return [];
  const titleWords = new Set(
    title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean),
  );
  const head = text.slice(0, 400).toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const counts = new Map<string, number>();
  for (const word of head.split(/\s+/)) {
    if (word.length < 4 || HEADING_STOPWORDS.has(word) || titleWords.has(word)) continue;
    if (/^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => capitalize(w))
    .join(" ");
}
