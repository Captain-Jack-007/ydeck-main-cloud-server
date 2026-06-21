import { z } from "zod";

export const cloudAgentNames = [
  "request_classifier",
  "planner",
  "context",
  "file_extractor",
  "researcher",
  "outliner",
  "content_writer",
  "layout_selector",
  "html_designer",
  "screenshot_renderer",
  "vision_qa",
  "repair",
  "exporter",
  "delivery",
] as const;

export type CloudAgentName = (typeof cloudAgentNames)[number];

export const cloudWorkflowNames = [
  "prompt_to_deck",
  "file_to_deck",
  "edit_deck",
  "research_deck",
  "export_deck",
] as const;

export type CloudWorkflowName = (typeof cloudWorkflowNames)[number];

export const cloudEventChannels = [
  "deck.plan",
  "deck.context",
  "deck.file",
  "deck.research",
  "deck.outline",
  "deck.content",
  "slide.preview",
  "deck.qa",
  "deck.repair",
  "deck.asset",
  "deck.export",
  "deck.version",
  "deck.done",
  "deck.error",
] as const;

export type CloudEventChannel = (typeof cloudEventChannels)[number];

export const cloudProductionStatuses = [
  "queued",
  "planning",
  "context_loading",
  "file_processing",
  "researching",
  "outlining",
  "awaiting_user_approval",
  "content_writing",
  "layouting",
  "designing",
  "qa_checking",
  "repairing",
  "rendering",
  "exporting",
  "delivering",
  "done",
  "error",
  "canceled",
] as const;

export type CloudProductionStatus = (typeof cloudProductionStatuses)[number];

export const deckBriefSchema = z.object({
  intent: z.enum(["create_deck", "edit_deck", "export_deck", "share_deck"]).default("create_deck"),
  deckType: z.string().min(1).max(80).default("general"),
  audience: z.string().min(1).max(160).default("presentation audience"),
  slideCount: z.number().int().min(1).max(100).default(6),
  language: z.string().min(1).max(20).default("en"),
  needsResearch: z.boolean().default(false),
  hasFiles: z.boolean().default(false),
  requiresOutlineApproval: z.boolean().default(false),
});

export const planStepSchema = z.object({
  label: z.string().min(1).max(160),
  status: z.enum(["pending", "running", "done", "skipped", "error"]).default("pending"),
});

export const planArtifactSchema = z.object({
  type: z.literal("deck.plan").default("deck.plan"),
  source: z.literal("planner_agent").default("planner_agent"),
  summary: z.string().max(1000).optional(),
  steps: z.array(planStepSchema).min(1).max(20),
});

export const outlineSlideSchema = z.object({
  slideNumber: z.number().int().positive(),
  slideType: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  purpose: z.string().max(500).optional(),
});

export const outlineArtifactSchema = z.object({
  deckTitle: z.string().min(1).max(255),
  slides: z.array(outlineSlideSchema).min(1).max(100),
  requiresApproval: z.boolean().default(false),
});

export const contentSlideSchema = z.object({
  slideNumber: z.number().int().positive(),
  title: z.string().min(1).max(240),
  subtitle: z.string().max(500).optional(),
  bullets: z.array(z.string().max(500)).max(8).default([]),
  speakerNotes: z.string().max(2000).optional(),
  visualSuggestion: z.string().max(500).optional(),
});

export const contentArtifactSchema = z.object({
  slides: z.array(contentSlideSchema).min(1).max(100),
});

export const layoutDecisionSchema = z.object({
  slideNumber: z.number().int().positive(),
  layoutId: z.string().min(1).max(120),
  reason: z.string().max(500).optional(),
});

export const layoutArtifactSchema = z.object({
  layouts: z.array(layoutDecisionSchema).min(1).max(100),
});

export const designSlideSchema = z.object({
  slideNumber: z.number().int().positive(),
  layoutId: z.string().min(1).max(120),
  html: z.string().min(1).max(80_000),
  previewHtml: z.string().max(100_000).optional(),
});

export const designArtifactSchema = z.object({
  slides: z.array(designSlideSchema).min(1).max(100),
});

export const qaIssueSchema = z.object({
  slideNumber: z.number().int().positive(),
  severity: z.enum(["info", "warning", "error"]).default("warning"),
  problem: z.string().min(1).max(500),
  repairInstruction: z.string().max(500).optional(),
});

export const qaArtifactSchema = z.object({
  averageScore: z.number().min(0).max(100),
  acceptedSlides: z.number().int().min(0),
  repairedSlides: z.number().int().min(0).default(0),
  issues: z.array(qaIssueSchema).max(200).default([]),
});

export const exportArtifactSchema = z.object({
  formats: z.array(z.enum(["pptx", "pdf", "png", "html"])).min(1),
  files: z
    .array(
      z.object({
        format: z.enum(["pptx", "pdf", "png", "html"]),
        fileId: z.string().min(1).max(255).optional(),
        url: z.string().url().optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
});

export interface CloudAgentDefinition {
  name: CloudAgentName;
  stage: CloudProductionStatus;
  emits: CloudEventChannel[];
  description: string;
}

export interface CloudWorkflowDefinition {
  name: CloudWorkflowName;
  agents: CloudAgentName[];
  description: string;
}

export const cloudAgentRegistry: Record<CloudAgentName, CloudAgentDefinition> = {
  request_classifier: {
    name: "request_classifier",
    stage: "planning",
    emits: ["deck.plan"],
    description: "Classifies intent, deck type, audience, slide count, files, and research needs.",
  },
  planner: {
    name: "planner",
    stage: "planning",
    emits: ["deck.plan"],
    description: "Creates the visible user plan and high-level workflow steps.",
  },
  context: {
    name: "context",
    stage: "context_loading",
    emits: ["deck.context"],
    description: "Loads workspace, brand, project, user preferences, packs, and previous deck versions.",
  },
  file_extractor: {
    name: "file_extractor",
    stage: "file_processing",
    emits: ["deck.file"],
    description: "Extracts summaries, facts, sections, and suggested slides from uploaded files.",
  },
  researcher: {
    name: "researcher",
    stage: "researching",
    emits: ["deck.research"],
    description: "Runs optional cloud research for market, company, competitor, or factual context.",
  },
  outliner: {
    name: "outliner",
    stage: "outlining",
    emits: ["deck.outline"],
    description: "Creates the professional deck outline and slide purposes.",
  },
  content_writer: {
    name: "content_writer",
    stage: "content_writing",
    emits: ["deck.content"],
    description: "Writes slide titles, bullets, notes, and visual suggestions without choosing CSS.",
  },
  layout_selector: {
    name: "layout_selector",
    stage: "layouting",
    emits: ["deck.content"],
    description: "Chooses approved YDeck layout IDs for each slide.",
  },
  html_designer: {
    name: "html_designer",
    stage: "designing",
    emits: ["slide.preview"],
    description: "Generates export-compatible HTML/CSS previews using the selected layouts and theme.",
  },
  screenshot_renderer: {
    name: "screenshot_renderer",
    stage: "rendering",
    emits: ["slide.preview"],
    description: "Renders HTML slides in a browser and produces screenshot previews.",
  },
  vision_qa: {
    name: "vision_qa",
    stage: "qa_checking",
    emits: ["deck.qa"],
    description: "Scores screenshots and DOM checks for readability, overflow, spacing, and design quality.",
  },
  repair: {
    name: "repair",
    stage: "repairing",
    emits: ["deck.repair", "slide.preview", "deck.qa"],
    description: "Repairs weak slide HTML/CSS and reruns preview/QA loops within a bounded attempt limit.",
  },
  exporter: {
    name: "exporter",
    stage: "exporting",
    emits: ["deck.export"],
    description: "Exports approved slides to PPTX, PDF, PNG previews, and HTML artifacts.",
  },
  delivery: {
    name: "delivery",
    stage: "delivering",
    emits: ["deck.done"],
    description: "Delivers the final artifact to web, social channels, or future email/API targets.",
  },
};

export const cloudWorkflowRegistry: Record<CloudWorkflowName, CloudWorkflowDefinition> = {
  prompt_to_deck: {
    name: "prompt_to_deck",
    description: "Default cloud prompt-to-deck workflow.",
    agents: [
      "request_classifier",
      "planner",
      "context",
      "outliner",
      "content_writer",
      "layout_selector",
      "html_designer",
      "screenshot_renderer",
      "vision_qa",
      "repair",
      "exporter",
      "delivery",
    ],
  },
  file_to_deck: {
    name: "file_to_deck",
    description: "Cloud deck workflow grounded in uploaded files.",
    agents: [
      "request_classifier",
      "planner",
      "context",
      "file_extractor",
      "outliner",
      "content_writer",
      "layout_selector",
      "html_designer",
      "screenshot_renderer",
      "vision_qa",
      "repair",
      "exporter",
      "delivery",
    ],
  },
  edit_deck: {
    name: "edit_deck",
    description: "Targeted cloud edit workflow for existing decks or slides.",
    agents: ["request_classifier", "context", "content_writer", "layout_selector", "html_designer", "vision_qa", "repair", "delivery"],
  },
  research_deck: {
    name: "research_deck",
    description: "Cloud deck workflow that includes visible research.",
    agents: [
      "request_classifier",
      "planner",
      "context",
      "researcher",
      "outliner",
      "content_writer",
      "layout_selector",
      "html_designer",
      "screenshot_renderer",
      "vision_qa",
      "repair",
      "exporter",
      "delivery",
    ],
  },
  export_deck: {
    name: "export_deck",
    description: "Export-only workflow for an existing approved deck artifact.",
    agents: ["context", "exporter", "delivery"],
  },
};
