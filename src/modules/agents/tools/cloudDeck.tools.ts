import { z } from "zod";
import {
  DeckJobModel,
  DeckProjectModel,
  InstalledPackModel,
  PluginPackModel,
  TemplatePackModel,
  WorkspaceBrandingModel,
  WorkspacePreferenceModel,
} from "../../../models";
import { registerTool } from "./registry";

const slideSchema = z.object({
  slideNumber: z.number().int().positive().optional(),
  slideType: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(240),
  subtitle: z.string().max(500).optional(),
  bullets: z.array(z.string().max(500)).max(8).optional(),
  body: z.string().max(2000).optional(),
  speakerNotes: z.string().max(2000).optional(),
  layoutId: z.string().max(120).optional(),
  visual: z.record(z.string(), z.unknown()).optional(),
});

const deckArtifactSchema = z.object({
  deckTitle: z.string().min(1).max(255),
  deckType: z.string().min(1).max(80).default("general"),
  designStyle: z.string().min(1).max(120).default("modern"),
  language: z.string().min(1).max(20).default("en"),
  summary: z.string().max(2000).optional(),
  slides: z.array(slideSchema).min(1).max(100),
});

const createDeckSchema = z.object({
  deck: deckArtifactSchema,
});

const updateDeckSchema = z.object({
  deck: deckArtifactSchema,
  changeSummary: z.string().max(2000).optional(),
});

export type CloudDeckArtifact = z.infer<typeof deckArtifactSchema>;

export function registerCloudDeckTools(): void {
  registerTool({
    name: "inspect_project",
    description:
      "Read the current DeckProject title, description, template, and existing generated deck artifact for this job.",
    risk: "read",
    execute: async (_args, ctx) => {
      if (!ctx.projectId) return { ok: false, error: "NO_PROJECT", content: "No projectId in tool context." };
      const project = await DeckProjectModel.findById(ctx.projectId).lean();
      if (!project) return { ok: false, error: "PROJECT_NOT_FOUND", content: "Project not found." };
      return {
        ok: true,
        content: JSON.stringify(
          {
            id: String(project._id),
            title: project.title,
            description: project.description,
            templateId: project.templateId,
            meta: project.meta ?? null,
          },
          null,
          2,
        ),
      };
    },
  });

  registerTool({
    name: "read_workspace_context",
    description:
      "Read workspace branding and preferences, including default language, deck type, style, slide count, colors, and product/company names.",
    risk: "read",
    execute: async (_args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, error: "NO_WORKSPACE", content: "No workspaceId in tool context." };
      const [preferences, branding] = await Promise.all([
        WorkspacePreferenceModel.findOne({ workspaceId: ctx.workspaceId }).lean(),
        WorkspaceBrandingModel.findOne({ workspaceId: ctx.workspaceId }).lean(),
      ]);
      return {
        ok: true,
        content: JSON.stringify({ preferences: preferences ?? null, branding: branding ?? null }, null, 2),
      };
    },
  });

  registerTool({
    name: "list_packs",
    description:
      "List installed template/plugin packs for the workspace and the project-selected template. Use this before choosing style hints.",
    risk: "read",
    execute: async (_args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, error: "NO_WORKSPACE", content: "No workspaceId in tool context." };
      const [installed, templates, plugins] = await Promise.all([
        InstalledPackModel.find({ workspaceId: ctx.workspaceId, enabled: true }).lean(),
        TemplatePackModel.find().select("slug name description version manifest").limit(50).lean(),
        PluginPackModel.find().select("slug name description version manifest").limit(50).lean(),
      ]);
      return {
        ok: true,
        content: JSON.stringify({ installed, templates, plugins }, null, 2),
      };
    },
  });

  registerTool({
    name: "create_deck",
    description:
      "Persist a newly generated YDeck JSON artifact for the current job. Arguments: { deck: { deckTitle, deckType, designStyle, language, summary, slides[] } }.",
    risk: "write",
    schema: createDeckSchema,
    execute: async (args, ctx) => {
      const deck = normalizeDeck(args.deck);
      const saved = await saveDeckArtifact(ctx, deck, "create_deck");
      return saved;
    },
  });

  registerTool({
    name: "update_deck",
    description:
      "Persist a refined YDeck JSON artifact for the current job. Arguments: { deck: {...}, changeSummary?: string }.",
    risk: "write",
    schema: updateDeckSchema,
    execute: async (args, ctx) => {
      const deck = normalizeDeck(args.deck);
      const saved = await saveDeckArtifact(ctx, deck, "update_deck", args.changeSummary);
      return saved;
    },
  });
}

async function saveDeckArtifact(
  ctx: { projectId?: string; jobId?: string; publish?: (event: { channel: string; payload: unknown }) => void },
  deck: CloudDeckArtifact,
  source: string,
  changeSummary?: string,
) {
  if (!ctx.projectId || !ctx.jobId) {
    return { ok: false, error: "MISSING_CONTEXT", content: "projectId and jobId are required." };
  }
  const artifact = { ...deck, generatedAt: new Date().toISOString(), source, changeSummary };
  await DeckProjectModel.findByIdAndUpdate(ctx.projectId, {
    $set: {
      title: deck.deckTitle,
      meta: {
        deckArtifact: artifact,
        lastJobId: ctx.jobId,
        updatedBy: source,
      },
    },
  });
  await DeckJobModel.findByIdAndUpdate(ctx.jobId, {
    $set: {
      resultMeta: {
        deckArtifact: artifact,
        slideCount: deck.slides.length,
        source,
        changeSummary,
      },
    },
  });
  ctx.publish?.({ channel: "deck.artifact", payload: { slideCount: deck.slides.length, deckTitle: deck.deckTitle } });
  return {
    ok: true,
    content: `Saved deck artifact with ${deck.slides.length} slides.`,
    data: { slideCount: deck.slides.length, deckTitle: deck.deckTitle },
  };
}

function normalizeDeck(deck: CloudDeckArtifact): CloudDeckArtifact {
  return {
    ...deck,
    slides: deck.slides.map((slide, index) => ({
      ...slide,
      slideNumber: slide.slideNumber ?? index + 1,
    })),
  };
}
