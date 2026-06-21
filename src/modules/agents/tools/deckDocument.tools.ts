import { z } from "zod";
import { DeckProjectModel } from "../../../models";
import { registerTool } from "./registry";
import type { CloudDeckArtifact } from "./cloudDeck.tools";
import type { ToolResult } from "./types";
import { applyEditBlocks, parseEditBlocks, parseSuggestionBlocks } from "./editBlocks";

const ProjectRefSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    slideNumber: z.number().int().positive().optional(),
  })
  .strict();

const CreateDocArgsSchema = ProjectRefSchema.extend({
  title: z.string().min(1).max(240).optional(),
  body: z.string().max(10_000).default(""),
});

const UpdateDocArgsSchema = ProjectRefSchema.extend({
  body: z.string().max(10_000),
});

const EditDocArgsSchema = ProjectRefSchema.extend({
  edits: z.string().min(1).max(10_000),
});

const SuggestDocArgsSchema = ProjectRefSchema.extend({
  suggestions: z.string().min(1).max(10_000),
});

interface SlideBodyShape {
  slideNumber?: number;
  title?: string;
  bullets?: string[];
  speakerNotes?: string;
  body?: string;
  html?: string;
  previewHtml?: string;
}

export function registerDeckDocumentTools(): void {
  registerTool({
    name: "create_document",
    description:
      "Create or replace a cloud deck slide. Markdown-ish body: `# Title`, `- bullet`, `Notes:` section.",
    risk: "write",
    schema: CreateDocArgsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      const projectId = args.projectId ?? ctx.projectId;
      if (!projectId) return { ok: false, content: "projectId required", error: "BAD_ARGS" };
      const project = await DeckProjectModel.findById(projectId);
      if (!project) return { ok: false, content: "Project not found", error: "NOT_FOUND" };
      const slideNumber = args.slideNumber ?? 1;
      const body = args.title ? `# ${args.title}\n${args.body}` : args.body;
      const deck = deckFromProject(project);
      upsertSlide(deck, slideNumber, bodyToSlidePatch(body, slideNumber));
      await saveDeck(project, deck, ctx.jobId, "create_document");
      ctx.publish?.({ channel: "slide.completed", payload: { slideNumber, action: "create_document", diff: true } });
      return { ok: true, content: `Created slide ${slideNumber}` };
    },
  });

  registerTool({
    name: "update_document",
    description:
      "Replace the body of a slide, or replace the deck outline when slideNumber is omitted.",
    risk: "write",
    schema: UpdateDocArgsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      const projectId = args.projectId ?? ctx.projectId;
      if (!projectId) return { ok: false, content: "projectId required", error: "BAD_ARGS" };
      const project = await DeckProjectModel.findById(projectId);
      if (!project) return { ok: false, content: "Project not found", error: "NOT_FOUND" };
      if (args.slideNumber != null) {
        const deck = deckFromProject(project);
        upsertSlide(deck, args.slideNumber, bodyToSlidePatch(args.body, args.slideNumber));
        await saveDeck(project, deck, ctx.jobId, "update_document");
        ctx.publish?.({ channel: "slide.completed", payload: { slideNumber: args.slideNumber, action: "update_document", diff: true } });
        return { ok: true, content: `Updated slide ${args.slideNumber}` };
      }
      const meta = metaRecord(project.meta);
      project.meta = { ...meta, outline: { raw: args.body }, lastJobId: ctx.jobId ?? meta.lastJobId };
      project.markModified("meta");
      await project.save();
      ctx.publish?.({ channel: "outline", payload: { raw: args.body, diff: true } });
      return { ok: true, content: "Updated deck outline" };
    },
  });

  registerTool({
    name: "edit_document",
    description:
      "Apply <<<FIND>>>...<<<REPLACE>>>...<<<END>>> blocks to a slide body or the deck outline.",
    risk: "write",
    schema: EditDocArgsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      const projectId = args.projectId ?? ctx.projectId;
      if (!projectId) return { ok: false, content: "projectId required", error: "BAD_ARGS" };
      const project = await DeckProjectModel.findById(projectId);
      if (!project) return { ok: false, content: "Project not found", error: "NOT_FOUND" };
      const target = loadTargetBody(project.meta, args.slideNumber);
      if (!target) return { ok: false, content: "Target not found", error: "NOT_FOUND" };
      const blocks = parseEditBlocks(args.edits);
      if (!blocks.length) return { ok: false, content: "No valid edit blocks found", error: "NO_EDITS" };
      const result = applyEditBlocks(target.body, blocks);
      if (result.applied === 0) {
        return {
          ok: false,
          content: "No edits matched the document body",
          error: "EDITS_DID_NOT_MATCH",
          data: { skipped: result.skipped },
        };
      }
      if (args.slideNumber != null) {
        const deck = deckFromProject(project);
        upsertSlide(deck, args.slideNumber, bodyToSlidePatch(result.content, args.slideNumber));
        await saveDeck(project, deck, ctx.jobId, "edit_document");
      } else {
        const meta = metaRecord(project.meta);
        project.meta = { ...meta, outline: { raw: result.content }, lastJobId: ctx.jobId ?? meta.lastJobId };
        project.markModified("meta");
        await project.save();
      }
      ctx.publish?.({
        channel: "slide.completed",
        payload: { slideNumber: args.slideNumber ?? 0, action: "edit_document", applied: result.applied, skipped: result.skipped.length },
      });
      return {
        ok: true,
        content: `Applied ${result.applied}/${blocks.length} edits`,
        data: { applied: result.applied, skipped: result.skipped },
      };
    },
  });

  registerTool({
    name: "suggest_document",
    description:
      "Stage <<<FIND>>>...<<<REPLACE>>>...<<<REASON>>>...<<<END>>> suggestions. Does not modify the deck.",
    risk: "read",
    schema: SuggestDocArgsSchema,
    execute: async (args, ctx): Promise<ToolResult> => {
      const suggestions = parseSuggestionBlocks(args.suggestions);
      ctx.publish?.({
        channel: "agent.action",
        payload: { action: "suggest_document", slideNumber: args.slideNumber, suggestions },
      });
      return { ok: true, content: `Staged ${suggestions.length} suggestions`, data: { suggestions } };
    },
  });
}

function deckFromProject(project: { title: string; meta?: unknown }): CloudDeckArtifact {
  const meta = metaRecord(project.meta);
  const existing = meta.deckArtifact;
  if (isDeckArtifact(existing)) return existing;
  return {
    deckTitle: project.title,
    deckType: "general",
    designStyle: "modern",
    language: "en",
    slides: [],
  };
}

async function saveDeck(
  project: { meta?: unknown; markModified(path: string): void; save(): Promise<unknown> },
  deck: CloudDeckArtifact,
  jobId: string | undefined,
  updatedBy: string,
): Promise<void> {
  const meta = metaRecord(project.meta);
  project.meta = {
    ...meta,
    deckArtifact: { ...deck, generatedAt: new Date().toISOString(), updatedBy },
    lastJobId: jobId ?? meta.lastJobId,
  };
  project.markModified("meta");
  await project.save();
}

function loadTargetBody(meta: unknown, slideNumber?: number): { body: string } | null {
  const record = metaRecord(meta);
  if (slideNumber == null) {
    const outline = metaRecord(record.outline);
    if (typeof outline.raw === "string") return { body: outline.raw };
    const deck = isDeckArtifact(record.deckArtifact) ? record.deckArtifact : null;
    if (!deck) return null;
    return { body: deck.slides.map((s) => slideToBody(s)).join("\n\n---\n\n") };
  }
  const deck = isDeckArtifact(record.deckArtifact) ? record.deckArtifact : null;
  const slide = deck?.slides.find((s) => s.slideNumber === slideNumber);
  return slide ? { body: slideToBody(slide) } : null;
}

function slideToBody(slide: SlideBodyShape): string {
  const lines: string[] = [];
  if (slide.title) lines.push(`# ${slide.title}`);
  for (const b of slide.bullets ?? []) lines.push(`- ${b}`);
  if (slide.body) lines.push(slide.body);
  if (slide.speakerNotes) lines.push("\nNotes:\n" + slide.speakerNotes);
  return lines.join("\n");
}

function bodyToSlidePatch(body: string, slideNumber: number): SlideBodyShape {
  const lines = body.split("\n");
  const titleLine = lines.find((l) => l.startsWith("# "));
  const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const notesIx = lines.findIndex((l) => l.trim().toLowerCase() === "notes:");
  const speakerNotes = notesIx >= 0 ? lines.slice(notesIx + 1).join("\n").trim() || undefined : undefined;
  return {
    slideNumber,
    title: titleLine?.slice(2).trim() || `Slide ${slideNumber}`,
    bullets,
    speakerNotes,
  };
}

function upsertSlide(deck: CloudDeckArtifact, slideNumber: number, patch: SlideBodyShape): void {
  const ix = deck.slides.findIndex((s) => s.slideNumber === slideNumber);
  const next = { ...patch, slideNumber, title: patch.title ?? `Slide ${slideNumber}` };
  if (ix === -1) deck.slides.push(next as CloudDeckArtifact["slides"][number]);
  else deck.slides[ix] = { ...deck.slides[ix], ...next };
  deck.slides.sort((a, b) => (a.slideNumber ?? 0) - (b.slideNumber ?? 0));
}

function metaRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isDeckArtifact(value: unknown): value is CloudDeckArtifact {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { deckTitle?: unknown }).deckTitle === "string" &&
    Array.isArray((value as { slides?: unknown }).slides)
  );
}
