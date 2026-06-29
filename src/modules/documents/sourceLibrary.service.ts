/**
 * The Source Library: persistent uploaded books/documents the user can reuse to
 * generate many decks from any page range, lesson, or chapter.
 *
 * Flow:
 *  1. Upload -> `ingestBookSource` paginates the file, stores a SourceCollection
 *     plus one BookPage per page, detects sections, and marks it `indexed`.
 *  2. Later the agent resolves a natural reference ("Lesson 5", "pages 23-45")
 *     via `resolveBookReference` and pulls just those pages with
 *     `readDocumentPages` / `retrieveSection` — never the whole 250-page book.
 */
import {
  BookChunkModel,
  BookPageModel,
  BookSectionModel,
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  SourceCollectionModel,
  type BookSectionDoc,
  type SourceCollectionDoc,
} from "../../models";
import type {
  BookSectionType,
  SourceCollectionStatus,
  SourceCollectionType,
} from "../../models/enums";
import {
  paginateDocument,
  type ExtractedPage,
} from "./documentPagination.service";
import { detectSections } from "./sectionDetection.service";
import { cosineSimilarity, embedQuery, embedTexts } from "./embeddings.service";
import { renderPdfPages } from "./pdfRender.service";
import { effectiveCloudConfig, getCloudLlmProvider } from "../agents/cloudLlm";
import { recordUsage } from "../usage/usage.service";

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export interface IngestParams {
  fileId: string;
  workspaceId: string;
  ownerId?: string | null;
  projectId?: string | null;
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  buffer: Buffer;
  type?: SourceCollectionType;
}

/**
 * Creates the SourceCollection row immediately with status `processing` and no
 * pages yet, so the upload request can return instantly and the UI can show the
 * book as it indexes. Call `indexSource` afterwards (in the background) to fill
 * in pages and sections.
 */
export async function createSourcePlaceholder(
  params: IngestParams,
): Promise<SourceCollectionDoc> {
  // Replace any prior indexing for the same file so re-uploads stay clean.
  const prior = await SourceCollectionModel.find({ originalFileId: params.fileId })
    .select("_id")
    .lean()
    .catch(() => []);
  for (const p of prior) {
    await BookPageModel.deleteMany({ sourceId: p._id }).catch(() => undefined);
    await BookSectionModel.deleteMany({ sourceId: p._id }).catch(() => undefined);
    await BookChunkModel.deleteMany({ sourceId: p._id }).catch(() => undefined);
  }
  await SourceCollectionModel.deleteMany({ originalFileId: params.fileId }).catch(
    () => undefined,
  );

  return SourceCollectionModel.create({
    workspaceId: params.workspaceId,
    ownerId: params.ownerId ?? null,
    originalFileId: params.fileId,
    projectId: params.projectId ?? null,
    type: params.type ?? "book",
    title: titleFromFilename(params.filename),
    language: "en",
    mimeType: params.mimeType ?? null,
    sizeBytes: params.sizeBytes ?? null,
    status: "processing",
  });
}

/**
 * Paginates the buffer, stores BookPage + BookSection rows, and flips the
 * source to `indexed` (or `error`). Safe to call without awaiting (fire and
 * forget) — it persists its own terminal status. A process restart mid-index
 * leaves the source `processing`; acceptable for Phase A (a durable job queue
 * is a later phase).
 */
export async function indexSource(
  source: SourceCollectionDoc,
  params: Pick<IngestParams, "buffer" | "mimeType" | "filename" | "workspaceId">,
): Promise<void> {
  let pagination;
  try {
    pagination = await paginateDocument(params.buffer, params.mimeType, params.filename);
  } catch (err) {
    source.status = "error";
    source.meta = { warning: `Pagination failed: ${(err as Error).message}` };
    await source.save().catch(() => undefined);
    return;
  }

  if (pagination.pages.length) {
    await BookPageModel.insertMany(
      pagination.pages.map((page) => ({
        sourceId: source._id,
        workspaceId: params.workspaceId,
        pageNumber: page.pageNumber,
        text: page.text,
        charCount: page.charCount,
      })),
      { ordered: false },
    ).catch(() => undefined);
  }

  const { sections, tocDetected } = detectSections(pagination.pages);
  if (sections.length) {
    await BookSectionModel.insertMany(
      sections.map((section) => ({
        sourceId: source._id,
        workspaceId: params.workspaceId,
        type: section.type,
        title: section.title,
        number: section.number,
        startPage: section.startPage,
        endPage: section.endPage,
        keywords: section.keywords,
        order: section.order,
      })),
      { ordered: false },
    ).catch(() => undefined);
  }

  // Persist page/section counts now (status stays `processing`) so that section
  // summarization, which reads pages back via readDocumentPages, sees the real
  // pageCount instead of the placeholder 0. Status only flips to a terminal
  // value at the very end, so a crash before then leaves the source
  // `processing` to be re-indexed idempotently.
  source.pageCount = pagination.pageCount;
  source.sectionCount = sections.length;
  source.tocDetected = tocDetected;
  source.sectionsDetected = sections.length > 0;
  source.language = detectLanguage(pagination.pages);
  await source.save().catch(() => undefined);

  // Build retrieval chunks + embeddings for semantic search. Best-effort: a
  // failure here (e.g. no embeddings key) leaves the source fully usable for
  // page/section retrieval, just without "search this book".
  try {
    await buildChunks(source, pagination.pages, params.workspaceId);
  } catch {
    // ignore — search will fall back to keyword scoring
  }

  // Auto-summaries (book-level + per-section), best-effort. Skipped when no real
  // LLM is configured.
  let bookSummary = "";
  try {
    bookSummary = await generateSummaries(source, pagination.pages, params.workspaceId);
  } catch {
    // ignore — summaries are an enhancement
  }

  // ready/empty are indexed (empty = no selectable text, still a valid source);
  // unsupported/failed are errors.
  source.status =
    pagination.status === "ready" || pagination.status === "empty" ? "indexed" : "error";
  const finalMeta: Record<string, unknown> = {};
  if (pagination.warning) finalMeta.warning = pagination.warning;
  if (bookSummary) finalMeta.summary = bookSummary;
  // Replacing meta also clears `indexingStartedAt`, releasing the worker claim.
  source.meta = Object.keys(finalMeta).length ? finalMeta : null;
  await source.save().catch(() => undefined);
}

const MAX_AUTO_SUMMARY_SECTIONS = 12;

async function generateSummaries(
  source: SourceCollectionDoc,
  pages: ExtractedPage[],
  workspaceId: string,
): Promise<string> {
  const provider = await getCloudLlmProvider();
  if (provider.name === "mock") return "";

  const bookText = pages.map((p) => p.text).join("\n\n").slice(0, 12_000);
  let bookSummary = "";
  if (bookText.trim()) {
    const prompt = [
      "Summarize this document in 4-6 sentences plus 3-5 key points. Plain text only.",
      "",
      bookText,
    ].join("\n");
    // Background work: don't retry/compete for tokens with live deck generation.
    bookSummary = (
      await provider.generate(prompt, { temperature: 0.3, maxTokens: 500, maxRetries: 0 })
    ).trim();
  }

  // Section summaries are cached onto BookSection.summary by summarizeBookRange.
  const sections = await BookSectionModel.find({ sourceId: source._id, workspaceId })
    .sort({ order: 1 })
    .limit(MAX_AUTO_SUMMARY_SECTIONS)
    .select("_id")
    .lean()
    .catch(() => []);
  for (const s of sections) {
    await summarizeBookRange({
      workspaceId,
      sourceId: String(source._id),
      sectionId: String(s._id),
      lowPriority: true,
    }).catch(() => undefined);
  }

  return bookSummary;
}

const CHUNK_TARGET_CHARS = 1200;

function chunkPages(pages: ExtractedPage[]): Array<{
  chunkIndex: number;
  startPage: number;
  endPage: number;
  text: string;
}> {
  const chunks: Array<{ chunkIndex: number; startPage: number; endPage: number; text: string }> = [];
  let buf = "";
  let startPage = pages[0]?.pageNumber ?? 1;
  let endPage = startPage;
  const flush = () => {
    const text = buf.trim();
    if (text) chunks.push({ chunkIndex: chunks.length, startPage, endPage, text });
    buf = "";
  };
  for (const page of pages) {
    if (!page.text.trim()) continue;
    if (!buf) startPage = page.pageNumber;
    endPage = page.pageNumber;
    buf += (buf ? "\n\n" : "") + page.text;
    if (buf.length >= CHUNK_TARGET_CHARS) flush();
  }
  flush();
  return chunks;
}

async function buildChunks(
  source: SourceCollectionDoc,
  pages: ExtractedPage[],
  workspaceId: string,
): Promise<void> {
  const chunks = chunkPages(pages);
  if (!chunks.length) return;
  let embeddings: number[][] | null = null;
  try {
    embeddings = await embedTexts(chunks.map((c) => c.text));
  } catch {
    embeddings = null;
  }
  await BookChunkModel.insertMany(
    chunks.map((c, i) => ({
      sourceId: source._id,
      workspaceId,
      chunkIndex: c.chunkIndex,
      startPage: c.startPage,
      endPage: c.endPage,
      text: c.text,
      embedding: embeddings ? embeddings[i] : undefined,
      dim: embeddings ? embeddings[i]?.length ?? 0 : 0,
    })),
    { ordered: false },
  ).catch(() => undefined);
}

/**
 * Full synchronous ingest (create + index, awaited). Used by tests and any
 * caller that wants the finished source back. HTTP upload uses the split
 * create/index pair instead so it can respond before indexing finishes.
 */
export async function ingestBookSource(
  params: IngestParams,
): Promise<SourceCollectionDoc> {
  const source = await createSourcePlaceholder(params);
  await indexSource(source, params);
  return source;
}

// A `processing` source is re-claimable after this long, so an index that died
// mid-run (e.g. a server restart) gets picked up again instead of stalling.
const INDEX_STALE_MS = 2 * 60 * 1000;

/**
 * (Re)indexes a source by id, reading the original bytes back from its File so
 * indexing never depends on the upload request's in-memory buffer. Idempotent:
 * clears any partial pages/sections/chunks first.
 */
export async function indexSourceById(sourceId: string): Promise<void> {
  const source = await SourceCollectionModel.findById(sourceId);
  if (!source) return;
  const file = source.originalFileId
    ? await FileModel.findById(source.originalFileId).lean()
    : null;
  const buffer = file ? bufferFromDataUrl(file.storageUrl) : null;
  if (!buffer) {
    source.status = "error";
    source.meta = { ...metaRecord(source.meta), warning: "Source file is unavailable for indexing." };
    await source.save().catch(() => undefined);
    return;
  }
  await BookPageModel.deleteMany({ sourceId: source._id }).catch(() => undefined);
  await BookSectionModel.deleteMany({ sourceId: source._id }).catch(() => undefined);
  await BookChunkModel.deleteMany({ sourceId: source._id }).catch(() => undefined);
  await indexSource(source, {
    buffer,
    mimeType: file?.mimeType ?? source.mimeType ?? null,
    filename: file?.filename ?? source.title,
    workspaceId: String(source.workspaceId),
  });
}

/**
 * Atomically claims the oldest `processing` source that isn't being indexed
 * (or whose claim went stale) by stamping `meta.indexingStartedAt`. Returns its
 * id, or null when there's nothing to do. Used by the background worker.
 */
export async function claimNextSourceForIndexing(): Promise<string | null> {
  const cutoff = new Date(Date.now() - INDEX_STALE_MS);
  const claimed = await SourceCollectionModel.findOneAndUpdate(
    {
      status: "processing",
      $or: [{ indexingStartedAt: null }, { indexingStartedAt: { $lt: cutoff } }],
    },
    { $set: { indexingStartedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  ).catch(() => null);
  return claimed ? String(claimed._id) : null;
}

function bufferFromDataUrl(storageUrl?: string | null): Buffer | null {
  if (!storageUrl) return null;
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(storageUrl);
  if (!match) return null;
  try {
    return match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "utf8");
  } catch {
    return null;
  }
}

function metaRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Registers an already-uploaded File as a Source Library entry (status
 * `processing`); the background worker indexes it. Used by the
 * create_source_collection / ingest_book agent tools.
 */
export async function createSourceFromFile(params: {
  fileId: string;
  workspaceId: string;
  ownerId?: string | null;
  projectId?: string | null;
  type?: SourceCollectionType;
}): Promise<SourceCollectionDoc | null> {
  const file = await FileModel.findById(params.fileId).lean().catch(() => null);
  if (!file) return null;
  if (String(file.workspaceId) !== params.workspaceId) return null;
  // Already ingested? Return the existing source instead of duplicating.
  const existing = await SourceCollectionModel.findOne({
    originalFileId: params.fileId,
    workspaceId: params.workspaceId,
  });
  if (existing) return existing;
  return createSourcePlaceholder({
    fileId: params.fileId,
    workspaceId: params.workspaceId,
    ownerId: params.ownerId ?? null,
    projectId: params.projectId ?? null,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    buffer: Buffer.alloc(0), // unused by createSourcePlaceholder; worker reads the File
    type: params.type,
  });
}

export interface CreateDeckParams {
  workspaceId: string;
  ownerId?: string | null;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  reference?: string;
  fromPage?: number;
  toPage?: number;
  sectionId?: string;
  deckKind?: string; // slides | quiz | teacher | bilingual | homework
  designStyle?: string;
  language?: string;
  slideCount?: number;
}

export interface CreateDeckResult {
  ok: boolean;
  error?: string;
  deckId?: string;
  jobId?: string;
  projectId?: string;
  sourceTitle?: string;
  sectionTitle?: string | null;
  pageRange?: { start: number; end: number } | null;
}

/**
 * Creates a book-aware deck generation job from a source range/section. Resolves
 * the reference to pages, persists a DeckSourceReference on the project, and
 * queues a `generate` job the worker picks up. Backs create_deck_from_source_range.
 */
export async function createDeckFromSourceRange(
  params: CreateDeckParams,
): Promise<CreateDeckResult> {
  const source = await resolveSource(params);
  if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };
  const summary = sourceSummaryFromLean(source);

  let startPage = params.fromPage;
  let endPage = params.toPage;
  let sectionId = params.sectionId ?? null;
  let sectionTitle: string | null = null;

  if (params.sectionId) {
    const sec = await BookSectionModel.findOne({
      _id: params.sectionId,
      workspaceId: params.workspaceId,
    }).lean();
    if (sec) {
      startPage = sec.startPage;
      endPage = sec.endPage;
      sectionTitle = sec.title;
    }
  } else if (params.reference && !startPage) {
    const resolved = await resolveBookReference({
      workspaceId: params.workspaceId,
      sourceId: String(source._id),
      reference: params.reference,
    });
    if (resolved.ok) {
      startPage = resolved.startPage;
      endPage = resolved.endPage;
      sectionTitle = resolved.sectionTitle ?? null;
      sectionId = resolved.sectionId ?? null;
    }
  }

  const label = sectionTitle ?? (startPage && endPage ? `pages ${startPage}-${endPage}` : "the whole book");
  const slideCount = clamp(params.slideCount ?? 10, 3, 40);
  const language = params.language ?? summary.language ?? "en";
  const kindPhrase = deckKindPhrase(params.deckKind);
  const pageHint = startPage && endPage ? ` Use pages ${startPage}-${endPage}.` : "";
  const langHint = language && language !== "en" ? ` Write the deck in ${language}.` : "";
  const prompt = `Create a ${slideCount}-slide ${kindPhrase} from ${label} of "${summary.title}".${pageHint}${langHint}`;

  const pageRange = startPage && endPage ? { start: startPage, end: endPage } : null;
  const sourceRef = {
    sourceId: String(source._id),
    sourceTitle: summary.title,
    fileId: summary.fileId,
    sectionId,
    sectionTitle,
    pageRange,
    matchedBy: params.sectionId ? "section" : params.reference ? "reference" : "pages",
  };

  const cloud = await effectiveCloudConfig();
  const ownerId =
    params.ownerId ?? (source.ownerId ? String(source.ownerId) : undefined);
  const project = await DeckProjectModel.create({
    workspaceId: params.workspaceId,
    ownerId,
    title: `${capitalizeFirst(kindPhrase)} — ${label}`.slice(0, 90),
    description: prompt,
    meta: { mode: "cloud", source: "source_range", sourceRef },
  });
  const job = await DeckJobModel.create({
    projectId: project.id,
    workspaceId: params.workspaceId,
    type: "generate",
    status: "queued",
    progress: 0,
    inputParams: {
      prompt,
      fileId: summary.fileId ?? undefined,
      deckType: "general",
      designStyle: params.designStyle ?? "modern",
      language,
      slideCount,
      generationMode: "auto",
      researchMode: "file_only",
      pipeline: "agentic",
      mode: "cloud",
      cloudProvider: cloud.llmProvider,
      cloudModel: cloud.llmProvider === "mock" ? "mock" : cloud.models[cloud.llmProvider],
      sourceId: String(source._id),
    },
  });
  await recordUsage(params.workspaceId, "deck.job.generate", 1).catch(() => undefined);

  return {
    ok: true,
    deckId: job.id,
    jobId: job.id,
    projectId: project.id,
    sourceTitle: summary.title,
    sectionTitle,
    pageRange,
  };
}

function deckKindPhrase(kind?: string): string {
  switch ((kind ?? "slides").toLowerCase()) {
    case "quiz":
      return "quiz deck (each slide a multiple-choice question, answer in the notes)";
    case "teacher":
      return "teacher lesson-plan deck with detailed speaker notes";
    case "bilingual":
      return "bilingual lesson deck";
    case "homework":
      return "homework deck with practice tasks and exercises";
    default:
      return "lesson slide deck";
  }
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function deleteSource(params: {
  workspaceId: string;
  sourceId: string;
}): Promise<boolean> {
  const doc = await SourceCollectionModel.findOne({
    _id: params.sourceId,
    workspaceId: params.workspaceId,
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (!doc) return false;
  await BookPageModel.deleteMany({ sourceId: doc._id }).catch(() => undefined);
  await BookSectionModel.deleteMany({ sourceId: doc._id }).catch(() => undefined);
  await BookChunkModel.deleteMany({ sourceId: doc._id }).catch(() => undefined);
  await SourceCollectionModel.deleteOne({ _id: doc._id }).catch(() => undefined);
  return true;
}

export async function getSourceStatus(params: {
  workspaceId: string;
  sourceId: string;
}): Promise<{ status: SourceCollectionStatus; pageCount: number; sectionCount: number } | null> {
  const doc = await SourceCollectionModel.findOne({
    _id: params.sourceId,
    workspaceId: params.workspaceId,
  })
    .select("status pageCount sectionCount")
    .lean()
    .catch(() => null);
  if (!doc) return null;
  return {
    status: (doc.status as SourceCollectionStatus) ?? "processing",
    pageCount: doc.pageCount ?? 0,
    sectionCount: doc.sectionCount ?? 0,
  };
}

/** Light script heuristic so non-English books are tagged for the agent. */
function detectLanguage(pages: ExtractedPage[]): string {
  const sample = pages
    .slice(0, 5)
    .map((p) => p.text)
    .join(" ")
    .slice(0, 4000);
  if (!sample.trim()) return "en";
  const cyrillic = (sample.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (sample.match(/[a-zA-Z]/g) ?? []).length;
  if (cyrillic > latin) return "ru";
  return "en";
}

// ---------------------------------------------------------------------------
// Listing / detail
// ---------------------------------------------------------------------------

export interface SourceSummary {
  id: string;
  fileId: string | null;
  title: string;
  filename: string;
  type: SourceCollectionType;
  mimeType: string | null;
  language: string;
  pageCount: number;
  sectionCount: number;
  status: SourceCollectionStatus;
  tocDetected: boolean;
  sectionsDetected: boolean;
  summary?: string;
  warning?: string;
  createdAt?: string;
}

export interface SectionSummary {
  id: string;
  type: BookSectionType;
  title: string;
  number: string | null;
  startPage: number;
  endPage: number;
  pageCount: number;
  keywords: string[];
  summary?: string;
}

export async function listSourceCollections(params: {
  workspaceId: string;
  projectId?: string | null;
  limit?: number;
}): Promise<SourceSummary[]> {
  const query: Record<string, unknown> = { workspaceId: params.workspaceId };
  if (params.projectId) query.$or = [{ projectId: params.projectId }, { projectId: null }];
  const docs = await SourceCollectionModel.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)))
    .lean();
  return docs.map(sourceSummaryFromLean);
}

export async function getSourceDetail(params: {
  workspaceId: string;
  sourceId: string;
}): Promise<{ source: SourceSummary; sections: SectionSummary[] } | null> {
  const doc = await SourceCollectionModel.findOne({
    _id: params.sourceId,
    workspaceId: params.workspaceId,
  })
    .lean()
    .catch(() => null);
  if (!doc) return null;
  const sections = await listSections({ workspaceId: params.workspaceId, sourceId: params.sourceId });
  return { source: sourceSummaryFromLean(doc), sections };
}

export async function listSections(params: {
  workspaceId: string;
  sourceId: string;
}): Promise<SectionSummary[]> {
  const sections = await BookSectionModel.find({
    sourceId: params.sourceId,
    workspaceId: params.workspaceId,
  })
    .sort({ order: 1, startPage: 1 })
    .lean()
    .catch(() => []);
  return sections.map((s) => ({
    id: String(s._id),
    type: (s.type as BookSectionType) ?? "section",
    title: s.title ?? "",
    number: s.number ?? null,
    startPage: s.startPage,
    endPage: s.endPage,
    pageCount: Math.max(1, s.endPage - s.startPage + 1),
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    summary: typeof s.summary === "string" && s.summary ? s.summary : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Page retrieval
// ---------------------------------------------------------------------------

export interface ReadPagesParams {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  documentId?: string; // alias for sourceId (back-compat)
  fileId?: string;
  filename?: string;
  fromPage?: number;
  toPage?: number;
  maxChars?: number;
}

export interface ReadPagesResult {
  ok: boolean;
  error?: string;
  source?: SourceSummary;
  fromPage?: number;
  toPage?: number;
  pages?: ExtractedPage[];
  text?: string;
  truncated?: boolean;
}

const READ_DEFAULT_MAX_CHARS = 40_000;

export async function readDocumentPages(params: ReadPagesParams): Promise<ReadPagesResult> {
  const source = await resolveSource(params);
  if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };

  const total = source.pageCount ?? 0;
  if (total === 0) {
    return { ok: false, error: "NO_PAGES", source: sourceSummaryFromLean(source) };
  }

  const from = clamp(params.fromPage ?? 1, 1, total);
  const to = clamp(params.toPage ?? total, from, total);
  const maxChars = Math.max(1_000, Math.min(params.maxChars ?? READ_DEFAULT_MAX_CHARS, 120_000));

  const pageDocs = await BookPageModel.find({
    sourceId: source._id,
    pageNumber: { $gte: from, $lte: to },
  })
    .sort({ pageNumber: 1 })
    .lean();

  let used = 0;
  let truncated = false;
  const out: ExtractedPage[] = [];
  for (const page of pageDocs) {
    if (used >= maxChars) {
      truncated = true;
      break;
    }
    let text = page.text ?? "";
    if (used + text.length > maxChars) {
      text = text.slice(0, maxChars - used);
      truncated = true;
    }
    used += text.length;
    out.push({ pageNumber: page.pageNumber, text, charCount: text.length });
  }

  const text = out.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
  return {
    ok: true,
    source: sourceSummaryFromLean(source),
    fromPage: from,
    toPage: to,
    pages: out,
    text,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Reference resolution ("Lesson 5", "the grammar section", "pages 23-45")
// ---------------------------------------------------------------------------

export interface ResolveParams {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  reference: string;
}

export interface ResolveResult {
  ok: boolean;
  error?: string;
  source?: SourceSummary;
  sectionId?: string;
  sectionTitle?: string;
  type?: BookSectionType | "page_range";
  number?: string | null;
  startPage?: number;
  endPage?: number;
  matchedBy?: "pages" | "section_number" | "keyword" | "single_page" | "whole_book";
  confidence?: number;
  candidates?: SectionSummary[];
}

export async function resolveBookReference(params: ResolveParams): Promise<ResolveResult> {
  const source = await resolveSource(params);
  if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };
  const summary = sourceSummaryFromLean(source);
  const reference = (params.reference ?? "").trim();

  // 1. Explicit page range wins.
  const range = parsePageRange(reference);
  if (range && range.fromPage !== range.toPage) {
    return {
      ok: true,
      source: summary,
      type: "page_range",
      startPage: clamp(range.fromPage, 1, summary.pageCount || range.toPage),
      endPage: clamp(range.toPage, 1, summary.pageCount || range.toPage),
      matchedBy: "pages",
      confidence: 1,
    };
  }

  const sections = await listSections({
    workspaceId: params.workspaceId,
    sourceId: String(source._id),
  });

  // 2. Numbered section ("lesson 5", "unit 3", "chapter 2").
  const numbered =
    /\b(chapter|lesson|unit|section|part|module)\s+([0-9]{1,3}|[ivxlcdm]{1,7})\b/i.exec(reference);
  if (numbered && sections.length) {
    const kind = numbered[1].toLowerCase();
    const num = normalizeRefNumber(numbered[2]);
    const match = sections.find(
      (s) => s.type === kind && (s.number === num || s.number === numbered[2].toLowerCase()),
    );
    if (match) return sectionResult(summary, match, "section_number", 0.95);
  }

  // 3. Keyword match against section titles/keywords ("grammar", "animals").
  if (sections.length) {
    const tokens = referenceTokens(reference);
    if (tokens.length) {
      let best: { section: SectionSummary; score: number } | null = null;
      for (const section of sections) {
        const hay = new Set([
          ...section.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
          ...section.keywords.map((k) => k.toLowerCase()),
        ]);
        let score = 0;
        for (const t of tokens) if (hay.has(t)) score += 1;
        if (score > 0 && (!best || score > best.score)) best = { section, score };
      }
      if (best) {
        return sectionResult(summary, best.section, "keyword", Math.min(1, 0.5 + best.score * 0.2));
      }
    }
  }

  // 4. Single page ("page 72").
  if (range && range.fromPage === range.toPage) {
    const p = clamp(range.fromPage, 1, summary.pageCount || range.fromPage);
    return {
      ok: true,
      source: summary,
      type: "page_range",
      startPage: p,
      endPage: p,
      matchedBy: "single_page",
      confidence: 0.9,
    };
  }

  // 5. Couldn't resolve — hand back candidates so the caller can ask the user.
  return {
    ok: false,
    error: "AMBIGUOUS_REFERENCE",
    source: summary,
    candidates: sections,
  };
}

export interface RetrieveSectionParams {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  sectionId?: string;
  reference?: string;
  maxChars?: number;
}

export async function retrieveSection(
  params: RetrieveSectionParams,
): Promise<ReadPagesResult & { section?: SectionSummary }> {
  let startPage: number | undefined;
  let endPage: number | undefined;
  let section: SectionSummary | undefined;
  let sourceId = params.sourceId;

  if (params.sectionId) {
    const doc = await BookSectionModel.findOne({
      _id: params.sectionId,
      workspaceId: params.workspaceId,
    }).lean();
    if (!doc) return { ok: false, error: "SECTION_NOT_FOUND" };
    sourceId = String(doc.sourceId);
    startPage = doc.startPage;
    endPage = doc.endPage;
    section = {
      id: String(doc._id),
      type: (doc.type as BookSectionType) ?? "section",
      title: doc.title ?? "",
      number: doc.number ?? null,
      startPage: doc.startPage,
      endPage: doc.endPage,
      pageCount: Math.max(1, doc.endPage - doc.startPage + 1),
      keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
    };
  } else if (params.reference) {
    const resolved = await resolveBookReference({
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sourceId: params.sourceId,
      fileId: params.fileId,
      filename: params.filename,
      reference: params.reference,
    });
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, source: resolved.source };
    }
    sourceId = resolved.source?.id ?? params.sourceId;
    startPage = resolved.startPage;
    endPage = resolved.endPage;
    if (resolved.sectionId) {
      section = (resolved.candidates ?? []).find((c) => c.id === resolved.sectionId);
    }
  } else {
    return { ok: false, error: "BAD_ARGS" };
  }

  const read = await readDocumentPages({
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    sourceId,
    fromPage: startPage,
    toPage: endPage,
    maxChars: params.maxChars,
  });
  return { ...read, section };
}

// ---------------------------------------------------------------------------
// Semantic search ("search this book")
// ---------------------------------------------------------------------------

export interface SearchHit {
  startPage: number;
  endPage: number;
  text: string;
  score: number;
}

export interface SearchResult {
  ok: boolean;
  error?: string;
  source?: SourceSummary;
  method?: "semantic" | "keyword";
  hits?: SearchHit[];
}

export interface SearchParams {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  query: string;
  topK?: number;
  fromPage?: number;
  toPage?: number;
}

export async function searchBookContent(params: SearchParams): Promise<SearchResult> {
  const source = await resolveSource(params);
  if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };
  const summary = sourceSummaryFromLean(source);
  const topK = Math.max(1, Math.min(params.topK ?? 6, 20));

  const filter: Record<string, unknown> = { sourceId: source._id };
  if (params.fromPage != null) filter.endPage = { $gte: params.fromPage };
  if (params.toPage != null) filter.startPage = { $lte: params.toPage };
  const chunks = await BookChunkModel.find(filter).sort({ chunkIndex: 1 }).lean();
  if (!chunks.length) {
    return { ok: true, source: summary, method: "keyword", hits: [] };
  }

  const queryVec = await embedQuery(params.query).catch(() => null);
  const haveVectors = chunks.some((c) => Array.isArray(c.embedding) && c.embedding.length);

  let scored: SearchHit[];
  let method: "semantic" | "keyword";
  if (queryVec && haveVectors) {
    method = "semantic";
    scored = chunks
      .filter((c) => Array.isArray(c.embedding) && c.embedding.length)
      .map((c) => ({
        startPage: c.startPage,
        endPage: c.endPage,
        text: c.text,
        score: cosineSimilarity(queryVec, c.embedding as number[]),
      }));
  } else {
    method = "keyword";
    const terms = queryTerms(params.query);
    scored = chunks.map((c) => ({
      startPage: c.startPage,
      endPage: c.endPage,
      text: c.text,
      score: keywordScore(c.text, terms),
    }));
  }

  const hits = scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((h) => ({ ...h, text: h.text.slice(0, 1500) }));
  return { ok: true, source: summary, method, hits };
}

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  );
}

function keywordScore(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    const matches = lower.split(t).length - 1;
    score += matches;
  }
  return score / Math.sqrt(text.length || 1);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface SummarizeParams {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  fromPage?: number;
  toPage?: number;
  sectionId?: string;
  reference?: string;
  // Background auto-summary: skip retries so it doesn't compete for tokens.
  lowPriority?: boolean;
}

export interface SummarizeResult {
  ok: boolean;
  error?: string;
  source?: SourceSummary;
  summary?: string;
  fromPage?: number;
  toPage?: number;
  sectionTitle?: string;
  cached?: boolean;
}

export async function summarizeBookRange(params: SummarizeParams): Promise<SummarizeResult> {
  // Cached section summary?
  if (params.sectionId) {
    const sec = await BookSectionModel.findOne({
      _id: params.sectionId,
      workspaceId: params.workspaceId,
    }).catch(() => null);
    if (!sec) return { ok: false, error: "SECTION_NOT_FOUND" };
    if (sec.summary && sec.summary.trim()) {
      return {
        ok: true,
        summary: sec.summary,
        fromPage: sec.startPage,
        toPage: sec.endPage,
        sectionTitle: sec.title,
        cached: true,
      };
    }
  }

  const read = params.sectionId || params.reference
    ? await retrieveSection({
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        sourceId: params.sourceId,
        fileId: params.fileId,
        filename: params.filename,
        sectionId: params.sectionId,
        reference: params.reference,
        maxChars: 14_000,
      })
    : await readDocumentPages({
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        sourceId: params.sourceId,
        fileId: params.fileId,
        filename: params.filename,
        fromPage: params.fromPage,
        toPage: params.toPage,
        maxChars: 14_000,
      });

  if (!read.ok || !read.text) {
    return { ok: false, error: read.error ?? "NO_TEXT", source: read.source };
  }

  const provider = await getCloudLlmProvider();
  const prompt = [
    "Summarize the following source pages into a concise study summary.",
    "Return 4-8 sentences plus a short list of key points. Plain text only.",
    "",
    read.text,
  ].join("\n");
  const summary = (
    await provider.generate(prompt, {
      temperature: 0.3,
      maxTokens: 600,
      maxRetries: params.lowPriority ? 0 : undefined,
    })
  ).trim();

  // Cache onto the section so repeated requests are free.
  if (params.sectionId && summary) {
    await BookSectionModel.updateOne(
      { _id: params.sectionId, workspaceId: params.workspaceId },
      { $set: { summary } },
    ).catch(() => undefined);
  }

  return {
    ok: true,
    source: read.source,
    summary,
    fromPage: read.fromPage,
    toPage: read.toPage,
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Page images (rendered on demand, cached on BookPage.imageRefs)
// ---------------------------------------------------------------------------

// Cap per call so a single request never rasterizes a whole large book.
const MAX_RENDER_PAGES = 12;

export interface PageImageRef {
  pageNumber: number;
  fileId: string;
}

export interface EnsureImagesResult {
  ok: boolean;
  error?: string;
  source?: SourceSummary;
  images?: PageImageRef[];
}

export async function ensurePageImages(params: {
  workspaceId: string;
  sourceId?: string;
  fileId?: string;
  filename?: string;
  fromPage?: number;
  toPage?: number;
}): Promise<EnsureImagesResult> {
  const source = await resolveSource(params);
  if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };
  const summary = sourceSummaryFromLean(source);
  const total = summary.pageCount || 1;
  const from = clamp(params.fromPage ?? 1, 1, total);
  const to = clamp(params.toPage ?? from, from, Math.min(total, from + MAX_RENDER_PAGES - 1));

  const pages = await BookPageModel.find({
    sourceId: source._id,
    pageNumber: { $gte: from, $lte: to },
  })
    .sort({ pageNumber: 1 })
    .select("pageNumber imageRefs");

  const refs: PageImageRef[] = [];
  const missing: number[] = [];
  for (const p of pages) {
    const existing = Array.isArray(p.imageRefs) && p.imageRefs.length ? String(p.imageRefs[0]) : null;
    if (existing) refs.push({ pageNumber: p.pageNumber, fileId: existing });
    else missing.push(p.pageNumber);
  }
  // Cover requested pages even if BookPage rows are sparse (e.g. empty pages).
  for (let n = from; n <= to; n += 1) {
    if (!refs.some((r) => r.pageNumber === n) && !missing.includes(n)) missing.push(n);
  }

  if (missing.length) {
    const file = source.originalFileId
      ? await FileModel.findById(source.originalFileId).lean()
      : null;
    const buffer = file ? bufferFromDataUrl(file.storageUrl) : null;
    if (buffer) {
      const rendered = await renderPdfPages(buffer, missing, 2).catch(() => []);
      for (const r of rendered) {
        const storageUrl = `data:image/png;base64,${r.png.toString("base64")}`;
        const fileDoc = await FileModel.create({
          workspaceId: params.workspaceId,
          projectId: source.projectId ?? null,
          scope: "workspace",
          kind: "book_page_image",
          filename: `page_${String(r.pageNumber).padStart(4, "0")}.png`,
          mimeType: "image/png",
          sizeBytes: r.png.byteLength,
          storageUrl,
          meta: {
            source: "book_page_render",
            sourceId: String(source._id),
            pageNumber: r.pageNumber,
            width: r.width,
            height: r.height,
          },
        });
        await BookPageModel.updateOne(
          { sourceId: source._id, pageNumber: r.pageNumber },
          { $set: { imageRefs: [fileDoc.id] } },
        ).catch(() => undefined);
        refs.push({ pageNumber: r.pageNumber, fileId: fileDoc.id });
      }
    }
  }

  refs.sort((a, b) => a.pageNumber - b.pageNumber);
  return { ok: true, source: summary, images: refs };
}

/** Renders+caches a single page and returns its PNG bytes (for streaming). */
export async function getPageImageBuffer(params: {
  workspaceId: string;
  sourceId: string;
  pageNumber: number;
}): Promise<Buffer | null> {
  const result = await ensurePageImages({
    workspaceId: params.workspaceId,
    sourceId: params.sourceId,
    fromPage: params.pageNumber,
    toPage: params.pageNumber,
  });
  const ref = result.images?.find((r) => r.pageNumber === params.pageNumber);
  if (!ref) return null;
  const file = await FileModel.findById(ref.fileId).lean();
  return file ? bufferFromDataUrl(file.storageUrl) : null;
}

// ---------------------------------------------------------------------------
// Page-range parsing (shared with the deterministic pipeline)
// ---------------------------------------------------------------------------

/**
 * Extracts a page range from natural language, e.g. "pages 12-24",
 * "page 12 to 24", "pp. 12–24", "from page 12 through 24", "slide for page 7".
 */
export function parsePageRange(text: string): { fromPage: number; toPage: number } | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const range =
    /\b(?:pages?|pp?\.?)\s*(\d{1,5})\s*(?:-|–|—|to|through|thru|until|\.\.\.?)\s*(\d{1,5})\b/i.exec(
      lower,
    );
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (Number.isFinite(from) && Number.isFinite(to)) {
      return from <= to ? { fromPage: from, toPage: to } : { fromPage: to, toPage: from };
    }
  }
  const single = /\b(?:page|p\.?)\s*(\d{1,5})\b/i.exec(lower);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n)) return { fromPage: n, toPage: n };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function resolveSource(params: {
  workspaceId: string;
  projectId?: string | null;
  sourceId?: string;
  documentId?: string;
  fileId?: string;
  filename?: string;
}): Promise<SourceCollectionDoc | null> {
  const scope = { workspaceId: params.workspaceId };
  const id = params.sourceId ?? params.documentId;
  if (id) {
    const byId = await SourceCollectionModel.findOne({ ...scope, _id: id }).catch(() => null);
    if (byId) return byId;
  }
  if (params.fileId) {
    const byFile = await SourceCollectionModel.findOne({ ...scope, originalFileId: params.fileId })
      .sort({ createdAt: -1 })
      .catch(() => null);
    if (byFile) return byFile;
  }
  if (params.filename) {
    const safe = escapeRegExp(params.filename.trim().replace(/\.[a-z0-9]+$/i, ""));
    const byName = await SourceCollectionModel.findOne({
      ...scope,
      title: new RegExp(`^${safe}$`, "i"),
    })
      .sort({ createdAt: -1 })
      .catch(() => null);
    if (byName) return byName;
  }
  if (!id && !params.fileId && !params.filename) {
    const query: Record<string, unknown> = { ...scope };
    if (params.projectId) query.$or = [{ projectId: params.projectId }, { projectId: null }];
    return SourceCollectionModel.findOne(query).sort({ createdAt: -1 });
  }
  return null;
}

function sectionResult(
  source: SourceSummary,
  section: SectionSummary,
  matchedBy: ResolveResult["matchedBy"],
  confidence: number,
): ResolveResult {
  return {
    ok: true,
    source,
    sectionId: section.id,
    sectionTitle: section.title,
    type: section.type,
    number: section.number,
    startPage: section.startPage,
    endPage: section.endPage,
    matchedBy,
    confidence,
    candidates: [section],
  };
}

// Accepts either a lean object or a hydrated Mongoose document.
function sourceSummaryFromLean(doc: Record<string, unknown> | SourceCollectionDoc): SourceSummary {
  const d = doc as Record<string, unknown>;
  const meta = isRecord(d.meta) ? d.meta : null;
  return {
    id: String(d._id),
    fileId: d.originalFileId ? String(d.originalFileId) : null,
    title: String(d.title ?? "Untitled"),
    filename: String(d.title ?? "Untitled"),
    type: (d.type as SourceCollectionType) ?? "book",
    mimeType: (d.mimeType as string | null) ?? null,
    language: String(d.language ?? "en"),
    pageCount: Number(d.pageCount ?? 0),
    sectionCount: Number(d.sectionCount ?? 0),
    status: (d.status as SourceCollectionStatus) ?? "processing",
    tocDetected: Boolean(d.tocDetected),
    sectionsDetected: Boolean(d.sectionsDetected),
    summary: meta && typeof meta.summary === "string" ? meta.summary : undefined,
    warning: meta && typeof meta.warning === "string" ? meta.warning : undefined,
    createdAt: d.createdAt ? new Date(d.createdAt as string).toISOString() : undefined,
  };
}

function referenceTokens(text: string): string[] {
  const stop = new Set([
    "the", "and", "for", "from", "about", "make", "create", "deck", "slides", "slide",
    "presentation", "quiz", "lesson", "chapter", "unit", "section", "part", "page", "pages",
    "this", "that", "with", "into", "please", "book", "source",
  ]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stop.has(w)),
    ),
  );
}

function normalizeRefNumber(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (/^[0-9]+$/.test(value)) return value;
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const cur = map[value[i]];
    if (!cur) return value;
    if (cur < prev) total -= cur;
    else {
      total += cur;
      prev = cur;
    }
  }
  return total > 0 ? String(total) : value;
}

function titleFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled source"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
