import { z } from "zod";
import {
  createDeckFromSourceRange,
  createSourceFromFile,
  ensurePageImages,
  getSourceStatus,
  listSections,
  listSourceCollections,
  readDocumentPages,
  resolveBookReference,
  retrieveSection,
  searchBookContent,
  summarizeBookRange,
} from "../../documents/sourceLibrary.service";
import { registerTool } from "./registry";
import type { ToolResult } from "./types";

const ListSourcesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

const SourceRefSchema = z.object({
  sourceId: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
  filename: z.string().min(1).max(255).optional(),
});

const ListSectionsSchema = SourceRefSchema;

const ResolveRefSchema = SourceRefSchema.extend({
  reference: z.string().min(1).max(300),
});

const RetrievePagesSchema = SourceRefSchema.extend({
  fromPage: z.number().int().min(1).max(100_000).optional(),
  toPage: z.number().int().min(1).max(100_000).optional(),
  maxChars: z.number().int().min(1_000).max(120_000).optional(),
});

const RetrieveSectionSchema = SourceRefSchema.extend({
  sectionId: z.string().min(1).optional(),
  reference: z.string().min(1).max(300).optional(),
  maxChars: z.number().int().min(1_000).max(120_000).optional(),
});

const SearchSchema = SourceRefSchema.extend({
  query: z.string().min(1).max(500),
  topK: z.number().int().min(1).max(20).optional(),
  fromPage: z.number().int().min(1).max(100_000).optional(),
  toPage: z.number().int().min(1).max(100_000).optional(),
});

const SummarizeSchema = SourceRefSchema.extend({
  sectionId: z.string().min(1).optional(),
  reference: z.string().min(1).max(300).optional(),
  fromPage: z.number().int().min(1).max(100_000).optional(),
  toPage: z.number().int().min(1).max(100_000).optional(),
});

const ExtractImagesSchema = SourceRefSchema.extend({
  fromPage: z.number().int().min(1).max(100_000).optional(),
  toPage: z.number().int().min(1).max(100_000).optional(),
});

const IngestSchema = z.object({
  fileId: z.string().min(1),
  type: z
    .enum(["book", "course", "report", "manual", "paper_bundle", "other"])
    .optional(),
  title: z.string().min(1).max(240).optional(),
});

const CreateDeckSchema = SourceRefSchema.extend({
  reference: z.string().min(1).max(300).optional(),
  sectionId: z.string().min(1).optional(),
  fromPage: z.number().int().min(1).max(100_000).optional(),
  toPage: z.number().int().min(1).max(100_000).optional(),
  deckKind: z.enum(["slides", "quiz", "teacher", "bilingual", "homework"]).optional(),
  language: z.string().min(2).max(8).optional(),
  designStyle: z.string().min(1).max(40).optional(),
  slideCount: z.number().int().min(3).max(40).optional(),
});

export function registerBookSourceTools(): void {
  registerTool({
    name: "list_source_collections",
    description:
      "List the user's persistent uploaded sources (books, courses, reports) with page counts, detected section counts, and indexing status. Use first to discover what is available.",
    risk: "read",
    schema: ListSourcesSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const sources = await listSourceCollections({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        limit: args.limit,
      });
      return {
        ok: true,
        content: sources.length
          ? `${sources.length} source(s) in the library.`
          : "No sources have been uploaded yet.",
        data: { sources },
      };
    },
  });

  registerTool({
    name: "get_book_status",
    description:
      "Check whether an uploaded source has finished indexing. Returns status (processing/indexed/error), page count, and section count. Use before reading pages if an upload was just made.",
    risk: "read",
    schema: SourceRefSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      let sourceId = args.sourceId;
      if (!sourceId) {
        const resolved = await resolveBookReference({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
          fileId: args.fileId,
          filename: args.filename,
          reference: "",
        });
        sourceId = resolved.source?.id;
      }
      if (!sourceId) return { ok: false, content: "Source not found.", error: "SOURCE_NOT_FOUND" };
      const status = await getSourceStatus({ workspaceId: ctx.workspaceId, sourceId });
      if (!status) return { ok: false, content: "Source not found.", error: "SOURCE_NOT_FOUND" };
      return {
        ok: true,
        content:
          status.status === "indexed"
            ? `Indexed: ${status.pageCount} pages, ${status.sectionCount} sections.`
            : status.status === "processing"
              ? "Still indexing — try again shortly."
              : `Indexing ${status.status}.`,
        data: status,
      };
    },
  });

  registerTool({
    name: "list_book_sections",
    description:
      "List the detected chapters/lessons/units of a source with their page ranges. Identify the source by sourceId, fileId, or filename.",
    risk: "read",
    schema: ListSectionsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      // Resolve the source first so callers can pass fileId/filename too.
      const resolved = await resolveBookReference({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        reference: "",
      });
      const sourceId = resolved.source?.id ?? args.sourceId;
      if (!sourceId) return { ok: false, content: "Source not found.", error: "SOURCE_NOT_FOUND" };
      const sections = await listSections({ workspaceId: ctx.workspaceId, sourceId });
      return {
        ok: true,
        content: sections.length
          ? `${sections.length} section(s) detected.`
          : "No sections were detected for this source; use page ranges instead.",
        data: { source: resolved.source, sections },
      };
    },
  });

  registerTool({
    name: "resolve_book_reference",
    description:
      "Resolve a natural reference like 'Lesson 5', 'the grammar section', 'pages 23-45', or 'page 72' to a concrete page range within a source. Returns the matched section (if any) and start/end pages.",
    risk: "read",
    schema: ResolveRefSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const resolved = await resolveBookReference({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        reference: args.reference,
      });
      if (!resolved.ok) {
        return {
          ok: false,
          content:
            resolved.error === "SOURCE_NOT_FOUND"
              ? "No matching source was found."
              : `Could not confidently resolve "${args.reference}". Available sections are returned so you can ask the user.`,
          error: resolved.error,
          data: { source: resolved.source, candidates: resolved.candidates ?? [] },
        };
      }
      const label = resolved.sectionTitle
        ? `${resolved.sectionTitle} (pages ${resolved.startPage}-${resolved.endPage})`
        : `pages ${resolved.startPage}-${resolved.endPage}`;
      return {
        ok: true,
        content: `Resolved "${args.reference}" to ${label}.`,
        data: resolved,
      };
    },
  });

  registerTool({
    name: "retrieve_book_pages",
    description:
      "Read the text of a specific page range from a source (e.g. pages 23-45). 1-based, inclusive. Identify the source by sourceId, fileId, or filename; if none given the most recent upload is used.",
    risk: "read",
    schema: RetrievePagesSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const result = await readDocumentPages({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        fromPage: args.fromPage,
        toPage: args.toPage,
        maxChars: args.maxChars,
      });
      if (!result.ok) return pageError(result.error, result.source?.title);
      return {
        ok: true,
        content: `Read pages ${result.fromPage}-${result.toPage} of "${result.source?.title ?? "source"}"${
          result.truncated ? " (truncated)" : ""
        }.\n\n${result.text ?? ""}`,
        data: {
          source: result.source,
          fromPage: result.fromPage,
          toPage: result.toPage,
          pages: result.pages,
          truncated: result.truncated,
        },
      };
    },
  });

  registerTool({
    name: "retrieve_book_section",
    description:
      "Read the full text of a chapter/lesson/unit. Provide a sectionId, or a natural reference like 'Lesson 5' to resolve and read in one call.",
    risk: "read",
    schema: RetrieveSectionSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      if (!args.sectionId && !args.reference) {
        return { ok: false, content: "Provide sectionId or reference.", error: "BAD_ARGS" };
      }
      const result = await retrieveSection({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        sectionId: args.sectionId,
        reference: args.reference,
        maxChars: args.maxChars,
      });
      if (!result.ok) return pageError(result.error, result.source?.title);
      const title = result.section?.title ?? `pages ${result.fromPage}-${result.toPage}`;
      return {
        ok: true,
        content: `Read ${title} (pages ${result.fromPage}-${result.toPage})${
          result.truncated ? " (truncated)" : ""
        }.\n\n${result.text ?? ""}`,
        data: {
          source: result.source,
          section: result.section,
          fromPage: result.fromPage,
          toPage: result.toPage,
          pages: result.pages,
          truncated: result.truncated,
        },
      };
    },
  });

  registerTool({
    name: "search_book_content",
    description:
      "Semantic search inside a source for a topic or question (e.g. 'photosynthesis', 'how taxes work'). Returns the most relevant passages with their page numbers. Use this when the user asks for a deck about a TOPIC rather than a specific page/lesson.",
    risk: "read",
    schema: SearchSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const result = await searchBookContent({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        query: args.query,
        topK: args.topK,
        fromPage: args.fromPage,
        toPage: args.toPage,
      });
      if (!result.ok) return pageError(result.error, result.source?.title);
      const hits = result.hits ?? [];
      const body = hits
        .map((h) => `[Pages ${h.startPage}-${h.endPage}] ${h.text}`)
        .join("\n\n");
      return {
        ok: true,
        content: hits.length
          ? `${hits.length} relevant passage(s) (${result.method} search):\n\n${body}`
          : `No matching passages found for "${args.query}".`,
        data: { source: result.source, method: result.method, hits },
      };
    },
  });

  registerTool({
    name: "summarize_book_range",
    description:
      "Summarize a page range, section, or reference of a source into a short study summary. Provide sectionId, a reference like 'Lesson 5', or fromPage/toPage.",
    risk: "read",
    schema: SummarizeSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const result = await summarizeBookRange({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        sectionId: args.sectionId,
        reference: args.reference,
        fromPage: args.fromPage,
        toPage: args.toPage,
      });
      if (!result.ok) return pageError(result.error, result.source?.title);
      return {
        ok: true,
        content: result.summary ?? "",
        data: {
          source: result.source,
          fromPage: result.fromPage,
          toPage: result.toPage,
          cached: result.cached,
        },
      };
    },
  });

  registerTool({
    name: "extract_book_images",
    description:
      "Render page images from a source for a page range (max 12 pages/call), so the deck can reuse figures/visuals from the book. Returns image file ids per page.",
    risk: "read",
    schema: ExtractImagesSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const result = await ensurePageImages({
        workspaceId: ctx.workspaceId,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        fromPage: args.fromPage,
        toPage: args.toPage,
      });
      if (!result.ok) return pageError(result.error, result.source?.title);
      const images = result.images ?? [];
      return {
        ok: true,
        content: images.length
          ? `Rendered ${images.length} page image(s).`
          : "No page images could be rendered (the source may not be a PDF).",
        data: { source: result.source, images },
      };
    },
  });

  const ingestExecute = async (
    args: { fileId: string; type?: string },
    ctx: { workspaceId?: string; userId?: string; projectId?: string },
  ): Promise<ToolResult> => {
    if (!ctx.workspaceId) return badArgs();
    const source = await createSourceFromFile({
      fileId: args.fileId,
      workspaceId: ctx.workspaceId,
      ownerId: ctx.userId ?? null,
      projectId: ctx.projectId,
      type: args.type as never,
    });
    if (!source) {
      return { ok: false, content: "File not found in this workspace.", error: "FILE_NOT_FOUND" };
    }
    return {
      ok: true,
      content: `Source ${source.id} is ${source.status} — indexing runs in the background.`,
      data: { sourceId: source.id, status: source.status },
    };
  };

  registerTool({
    name: "create_source_collection",
    description:
      "Register an uploaded file as a persistent Source (book/course/report) so it can be reused for many decks. Indexing runs in the background; poll get_book_status.",
    risk: "write",
    schema: IngestSchema,
    execute: (args, ctx) => ingestExecute(args, ctx),
  });

  registerTool({
    name: "ingest_book",
    description:
      "Ingest/(re)index an uploaded file into the Source Library. Same as create_source_collection; returns the source id and indexing status.",
    risk: "write",
    schema: IngestSchema,
    execute: (args, ctx) => ingestExecute(args, ctx),
  });

  registerTool({
    name: "create_deck_from_source_range",
    description:
      "Start a book-aware deck from a source range/section: resolves 'Lesson 5' / 'pages 23-45' to pages, links the deck back to the source, and queues generation. deckKind: slides|quiz|teacher|bilingual|homework. Returns the deck/job id.",
    risk: "write",
    schema: CreateDeckSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!ctx.workspaceId) return badArgs();
      const result = await createDeckFromSourceRange({
        workspaceId: ctx.workspaceId,
        ownerId: ctx.userId ?? null,
        sourceId: args.sourceId,
        fileId: args.fileId,
        filename: args.filename,
        reference: args.reference,
        sectionId: args.sectionId,
        fromPage: args.fromPage,
        toPage: args.toPage,
        deckKind: args.deckKind,
        language: args.language,
        designStyle: args.designStyle,
        slideCount: args.slideCount,
      });
      if (!result.ok) return pageError(result.error, result.sourceTitle);
      ctx.publish?.({
        channel: "deck.requested",
        payload: { jobId: result.jobId, projectId: result.projectId, sourceRef: result },
      });
      const where = result.sectionTitle
        ? result.sectionTitle
        : result.pageRange
          ? `pages ${result.pageRange.start}-${result.pageRange.end}`
          : "the whole book";
      return {
        ok: true,
        content: `Queued a deck from ${where} of "${result.sourceTitle}". Job ${result.jobId}.`,
        data: result,
      };
    },
  });
}

function badArgs(): ToolResult {
  return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
}

function pageError(error: string | undefined, title?: string): ToolResult {
  const map: Record<string, string> = {
    SOURCE_NOT_FOUND: "No matching source was found. Call list_source_collections first.",
    SECTION_NOT_FOUND: "That section was not found.",
    NO_PAGES: `"${title ?? "The source"}" has no readable text pages (it may be a scanned/image PDF needing OCR).`,
    AMBIGUOUS_REFERENCE: "Could not resolve that reference; list sections and ask the user.",
    BAD_ARGS: "Missing required arguments.",
  };
  return {
    ok: false,
    content: map[error ?? ""] ?? "Could not read the requested pages.",
    error: error ?? "READ_FAILED",
  };
}
