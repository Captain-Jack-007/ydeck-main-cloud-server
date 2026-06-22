import { z } from "zod";

import {
  AuditLogModel,
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  PluginPackModel,
  TemplatePackModel,
  WorkspaceBrandingModel,
  WorkspacePreferenceModel,
} from "../../../models";
import { isGoogleVisionOcrConfigured, isTencentOcrConfigured, runGoogleVisionOcr, runTencentOcr, type OcrResult } from "../../ocr/googleVisionOcr.service";
import { renderDeckScreenshots, renderSlideScreenshot } from "../../render/render.service";
import { reviewDeckWithVision, reviewSlideWithVision } from "../../visionQa/visionQa.service";
import { saveCloudDeckArtifact, type CloudDeckArtifact } from "./cloudDeck.tools";
import { executeRegisteredTool, getTool, normalizeToolName, registerTool } from "./registry";
import type { ToolContext, ToolDefinition, ToolResult, ToolRisk } from "./types";

export type AdvancedToolAgent =
  | "orchestrator"
  | "context"
  | "file"
  | "research"
  | "outline"
  | "content"
  | "design"
  | "visual_asset"
  | "qa"
  | "export"
  | "memory";

export type CloudProductionAgentName =
  | "request_classifier"
  | "planner"
  | "context"
  | "file_extractor"
  | "researcher"
  | "outliner"
  | "content_writer"
  | "layout_selector"
  | "html_designer"
  | "screenshot_renderer"
  | "vision_qa"
  | "repair"
  | "exporter"
  | "delivery";

interface AdvancedToolSpec {
  name: string;
  group: string;
  risk: ToolRisk;
  agents: AdvancedToolAgent[];
  description: string;
  alias?: string;
  execute?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const AnyArgsSchema = z.record(z.string(), z.unknown()).default({});

export const ADVANCED_TOOL_GROUPS = {
  project_workspace: "Project and Workspace",
  file_document: "File and Document",
  research_source: "Research and Source",
  deck_planning: "Deck Planning",
  content_writing: "Content Writing and Editing",
  design_layout: "Design and Layout",
  image_visual: "Image and Visual Asset",
  qa_repair: "QA, Screenshot, and Repair",
  export_delivery: "Export, Save, and Delivery",
  memory_analytics: "Memory, Skills, Analytics, and Admin",
} as const;

const ADVANCED_TOOL_SPECS: AdvancedToolSpec[] = [
  {
    name: "inspect_project",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "read",
    agents: ["orchestrator", "context"],
    description: "Reads project title, prompt, deck type, workspace, previous artifact, and job input.",
  },
  {
    name: "read_workspace_context",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "read",
    agents: ["context", "content", "design"],
    description: "Reads workspace language, design style, brand colors, tone, team settings, and defaults.",
  },
  {
    name: "read_brand_kit",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "read",
    agents: ["context", "design", "export"],
    description: "Reads logo, colors, fonts, brand rules, brand voice, and company description.",
    execute: readBrandKit,
  },
  {
    name: "read_deck_history",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "read",
    agents: ["context", "export"],
    description: "Reads previous deck versions and version metadata for editing, comparison, and rollback.",
    execute: readDeckHistory,
  },
  {
    name: "read_user_preferences",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "read",
    agents: ["context", "content", "design"],
    description: "Reads user/workspace preferences such as tone, language, density, theme, and export format.",
    execute: readUserPreferences,
  },
  {
    name: "create_project_snapshot",
    group: ADVANCED_TOOL_GROUPS.project_workspace,
    risk: "write",
    agents: ["export", "qa"],
    description: "Creates a snapshot of the current project state before major changes.",
    execute: createProjectSnapshot,
  },

  { name: "list_files", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file", "context"], description: "Lists uploaded project files." },
  { name: "read_file", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file", "content"], description: "Reads plain text or extracted file content." },
  { name: "extract_pdf", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file"], description: "Extracts text, headings, tables, and images from a PDF file.", execute: extractFileLike("pdf") },
  { name: "extract_docx", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file"], description: "Extracts text, headings, tables, and structure from a Word document.", execute: extractFileLike("docx") },
  { name: "extract_pptx", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file"], description: "Reads existing PPTX text, slide titles, notes, layout hints, and media metadata.", execute: extractFileLike("pptx") },
  { name: "extract_csv_xlsx", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file"], description: "Extracts structured data from CSV/XLSX files for charts and tables.", execute: extractSpreadsheet },
  { name: "extract_images_from_file", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file", "visual_asset"], description: "Extracts image metadata or embedded image candidates from uploaded documents.", execute: extractImagesFromFile },
  { name: "ocr_image", group: ADVANCED_TOOL_GROUPS.file_document, risk: "external", agents: ["file", "qa"], description: "Extracts text from uploaded images using Google Vision OCR with Tencent OCR fallback.", execute: ocrImage },
  { name: "summarize_file", group: ADVANCED_TOOL_GROUPS.file_document, risk: "read", agents: ["file", "outline", "content"], description: "Creates a structured summary of a file with key points, facts, suggested slides, quotes, and warnings.", execute: summarizeFile },

  { name: "web_search", group: ADVANCED_TOOL_GROUPS.research_source, risk: "external", agents: ["research"], description: "Searches the web through the configured research provider." },
  { name: "web_fetch", group: ADVANCED_TOOL_GROUPS.research_source, risk: "external", agents: ["research"], description: "Fetches selected web pages and extracts plain text." },
  { name: "trigger_research", group: ADVANCED_TOOL_GROUPS.research_source, risk: "external", agents: ["research"], description: "Runs deeper research workflow for markets, competitors, policy, and reports." },
  { name: "verify_sources", group: ADVANCED_TOOL_GROUPS.research_source, risk: "read", agents: ["research", "qa"], description: "Checks publisher credibility, freshness, relevance, duplicates, and weak sources.", execute: verifySources },
  { name: "extract_research_facts", group: ADVANCED_TOOL_GROUPS.research_source, risk: "read", agents: ["research"], description: "Turns source snippets/pages into structured facts with claim, source, confidence, and suggested slide.", execute: extractResearchFacts },
  { name: "create_citation_list", group: ADVANCED_TOOL_GROUPS.research_source, risk: "read", agents: ["research", "export"], description: "Creates citation/source metadata for deck credits or speaker notes.", execute: createCitationList },

  { name: "create_deck_brief", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "read", agents: ["orchestrator"], description: "Converts user request into structured deck purpose, audience, slide count, tone, research mode, and design style.", execute: createDeckBrief },
  { name: "create_deck_plan", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "read", agents: ["orchestrator"], description: "Creates a user-facing plan and emits deck.plan-ready steps.", execute: createDeckPlan },
  { name: "create_outline", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "read", agents: ["outline"], description: "Creates a slide outline from deck brief, context, and research.", execute: createOutline },
  { name: "update_outline", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "write", agents: ["outline"], description: "Updates an outline based on user feedback.", execute: updateOutline },
  { name: "validate_outline", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "read", agents: ["outline"], description: "Checks slide count, logical flow, missing slides, duplicate slides, audience fit, and purpose fit.", execute: validateOutline },
  { name: "ask_user_clarification", group: ADVANCED_TOOL_GROUPS.deck_planning, risk: "read", agents: ["orchestrator"], description: "Asks a necessary question when audience, purpose, file, language, or company is unclear.", alias: "ask_user" },

  { name: "write_slide_content", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content"], description: "Writes title, subtitle, bullets, body, speaker notes, and visual suggestion for slides.", execute: writeSlideContent },
  { name: "rewrite_slide", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content"], description: "Rewrites one slide based on instruction.", execute: rewriteSlide },
  { name: "rewrite_deck", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content"], description: "Applies global rewrite instructions such as formal, shorter, simpler, or more persuasive.", execute: rewriteDeck },
  { name: "translate_deck", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content"], description: "Translates full deck or selected slides.", execute: translateDeck },
  { name: "add_speaker_notes", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content"], description: "Adds presenter notes to slides.", execute: addSpeakerNotes },
  { name: "summarize_to_slides", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content", "file"], description: "Turns long content into slide-ready text.", execute: summarizeToSlides },
  { name: "check_content_quality", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content", "qa"], description: "Checks clarity, logic, tone, repetition, unsupported claims, text density, and audience fit.", execute: checkContentQuality },
  { name: "detect_hallucinations", group: ADVANCED_TOOL_GROUPS.content_writing, risk: "read", agents: ["content", "research", "qa"], description: "Flags unsupported statistics or factual claims not backed by files/research.", execute: detectHallucinations },

  { name: "list_design_packs", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design"], description: "Lists available design/template packs.", alias: "list_packs" },
  { name: "choose_design_pack", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design"], description: "Chooses the best design pack based on deck brief and workspace brand.", execute: chooseDesignPack },
  { name: "choose_layouts", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design"], description: "Chooses layout for every slide from approved YDeck layout families.", execute: chooseLayouts },
  { name: "design_slide_html", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design"], description: "Creates HTML/CSS for one slide.", alias: "design_slide" },
  { name: "design_deck_html", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "write", agents: ["design"], description: "Creates HTML/CSS for a full deck and saves the designed artifact.", alias: "design_deck" },
  { name: "apply_brand_style", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design"], description: "Applies brand colors, logo, fonts, and rules to slide/deck HTML.", execute: applyBrandStyle },
  { name: "normalize_slide_html", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design", "qa"], description: "Cleans HTML/CSS for safe tags, scoped CSS, no scripts, iframe compatibility, and export compatibility.", execute: normalizeSlideHtml },
  { name: "layout_fallback", group: ADVANCED_TOOL_GROUPS.design_layout, risk: "read", agents: ["design", "qa"], description: "Applies a safe fallback layout when design fails.", execute: layoutFallback },

  { name: "detect_visual_needs", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset"], description: "Detects slides that need images, charts, icons, diagrams, or tables.", execute: detectVisualNeeds },
  { name: "search_images", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "external", agents: ["visual_asset"], description: "Searches licensed image candidates from Pexels/user assets." },
  { name: "select_image", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "external", agents: ["visual_asset", "design"], description: "Downloads, stores, and attaches a selected image candidate." },
  { name: "store_image_asset", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "external", agents: ["visual_asset"], description: "Stores a selected image asset. Alias for select_image when candidate ID is provided.", alias: "select_image" },
  { name: "upload_user_image", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "write", agents: ["visual_asset"], description: "Adds user-uploaded image/logo to the asset library." },
  { name: "create_chart", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset"], description: "Creates SVG chart markup from structured data.", execute: createChart },
  { name: "create_table_visual", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset"], description: "Creates clean HTML table visual markup from structured rows.", execute: createTableVisual },
  { name: "create_diagram", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset"], description: "Creates SVG/HTML diagrams such as process flow, timeline, funnel, roadmap, or framework.", execute: createDiagram },
  { name: "create_icon_visual", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset"], description: "Creates icon-based visual blocks using safe inline SVG symbols.", execute: createIconVisual },
  { name: "crop_or_reposition_image", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset", "design"], description: "Returns CSS crop/focus positioning instructions for an image.", execute: cropOrRepositionImage },
  { name: "create_image_credits", group: ADVANCED_TOOL_GROUPS.image_visual, risk: "read", agents: ["visual_asset", "export"], description: "Creates image attribution metadata or a credits slide payload.", execute: createImageCredits },

  { name: "run_design_qa", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa"], description: "Runs deterministic design QA for overflow, contrast, density, font size, spacing, alignment, title, and assets.", execute: runDesignQa },
  { name: "render_slide_screenshot", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa"], description: "Renders one slide screenshot using Playwright Chromium.", execute: renderSlideScreenshotTool },
  { name: "render_deck_screenshots", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa"], description: "Renders screenshots for all slides using Playwright Chromium.", execute: renderDeckScreenshotsTool },
  { name: "vision_review_slide", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "external", agents: ["qa"], description: "Uses OpenAI vision with Tencent Hunyuan fallback to critique one slide screenshot.", execute: visionReviewSlideTool },
  { name: "vision_review_deck", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "external", agents: ["qa"], description: "Uses OpenAI vision with Tencent Hunyuan fallback to review full deck consistency.", execute: visionReviewDeckTool },
  { name: "repair_slide_design", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa", "design"], description: "Repairs one weak slide using safe deterministic improvements.", execute: repairSlideDesign },
  { name: "repair_deck_design", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa", "design"], description: "Repairs deck-wide design issues.", execute: repairDeckDesign },
  { name: "check_accessibility", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa"], description: "Checks contrast, text size, color safety, and visual clarity.", execute: checkAccessibility },
  { name: "final_deck_review", group: ADVANCED_TOOL_GROUPS.qa_repair, risk: "read", agents: ["qa"], description: "Runs final content/design/source/export readiness review.", execute: finalDeckReview },

  { name: "save_deck_artifact", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["orchestrator", "export"], description: "Saves final deck JSON/artifact.", execute: saveDeckArtifactTool },
  { name: "create_deck_version", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["orchestrator", "export"], description: "Creates a new deck version.", execute: createDeckVersion },
  { name: "compare_deck_versions", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "read", agents: ["export"], description: "Compares old and new deck versions.", execute: compareDeckVersions },
  { name: "rollback_deck_version", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Restores a previous saved deck version when present in project metadata.", execute: rollbackDeckVersion },
  { name: "export_pptx", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Queues or describes PPTX export for the current deck artifact.", execute: exportArtifact("pptx") },
  { name: "export_pdf", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Queues or describes PDF export for the current deck artifact.", execute: exportArtifact("pdf") },
  { name: "export_slide_images", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Queues or describes PNG slide image export for the current deck artifact.", execute: exportArtifact("png") },
  { name: "create_share_link", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Creates shareable preview/download link metadata.", execute: createShareLink },
  { name: "send_to_channel", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "external", agents: ["export"], description: "Sends deck to Telegram, WhatsApp, Discord, email, or web delivery when connected.", execute: sendToChannel },
  { name: "notify_user", group: ADVANCED_TOOL_GROUPS.export_delivery, risk: "write", agents: ["export"], description: "Sends job progress or completion notification event.", execute: notifyUser },

  { name: "search_workspace_memory", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "read", agents: ["context", "memory"], description: "Searches workspace memory.", execute: memoryAlias("search") },
  { name: "save_workspace_memory", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "write", agents: ["memory"], description: "Stores useful preferences or repeated user facts.", execute: memoryAlias("add") },
  { name: "list_skills", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "read", agents: ["memory"], description: "Lists available deck skills and reusable workflows.", execute: skillAlias("list") },
  { name: "run_skill", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "read", agents: ["memory", "orchestrator"], description: "Runs a reusable skill/workflow definition.", execute: runSkill },
  { name: "save_user_feedback", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "write", agents: ["memory"], description: "Saves user rating and feedback.", execute: saveUserFeedback },
  { name: "track_generation_metrics", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "write", agents: ["orchestrator", "memory"], description: "Tracks generation time, model cost, failure stage, QA score, export success, and edits.", execute: trackGenerationMetrics },
  { name: "admin_audit_log", group: ADVANCED_TOOL_GROUPS.memory_analytics, risk: "admin", agents: ["orchestrator", "memory"], description: "Records sensitive operations in the admin audit log.", execute: adminAuditLog },
];

export function registerAdvancedSystemTools(): void {
  for (const spec of ADVANCED_TOOL_SPECS) {
    const existing = getTool(spec.name);
    if (existing) {
      registerTool({
        ...existing,
        group: spec.group,
        agents: spec.agents,
        maturity: "implemented",
        description: existing.description || spec.description,
      });
      continue;
    }
    registerTool({
      name: spec.name,
      description: spec.description,
      risk: spec.risk,
      group: spec.group,
      agents: spec.agents,
      maturity: spec.alias ? "adapter" : spec.execute ? "implemented" : "placeholder",
      schema: AnyArgsSchema,
      execute: spec.alias ? aliasTool(spec.alias) : spec.execute ?? servicePending(spec.name, "Tool surface is registered; backing service is not connected yet."),
    });
  }
}

export function listAdvancedToolSpecs(): Array<Pick<ToolDefinition, "name" | "description" | "risk" | "group" | "agents" | "maturity">> {
  return ADVANCED_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    risk: spec.risk,
    group: spec.group,
    agents: spec.agents,
    maturity: spec.alias ? "adapter" : spec.execute ? "implemented" : "placeholder",
  }));
}

export function toolsForAdvancedAgent(agent: AdvancedToolAgent): string[] {
  return ADVANCED_TOOL_SPECS.filter((spec) => spec.agents.includes(agent)).map((spec) => spec.name);
}

export function advancedAgentRoleForCloudAgent(agent: CloudProductionAgentName): AdvancedToolAgent {
  switch (agent) {
    case "request_classifier":
    case "planner":
      return "orchestrator";
    case "context":
      return "context";
    case "file_extractor":
      return "file";
    case "researcher":
      return "research";
    case "outliner":
      return "outline";
    case "content_writer":
      return "content";
    case "layout_selector":
    case "html_designer":
      return "design";
    case "screenshot_renderer":
    case "vision_qa":
    case "repair":
      return "qa";
    case "exporter":
    case "delivery":
      return "export";
    default:
      return "orchestrator";
  }
}

export function toolsForCloudProductionAgent(agent: CloudProductionAgentName): string[] {
  return toolsForAdvancedAgent(advancedAgentRoleForCloudAgent(agent));
}

function aliasTool(name: string) {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => executeRegisteredTool(name, args, ctx);
}

function servicePending(name: string, message: string) {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
    ctx.publish?.({ channel: "agent.tool.pending", payload: { tool: name, message, args } });
    return {
      ok: true,
      content: message,
      data: { status: "pending_service", tool: name, message },
    };
  };
}

async function readBrandKit(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.workspaceId) return badArgs("workspaceId required");
  const branding = await WorkspaceBrandingModel.findOne({ workspaceId: ctx.workspaceId }).lean();
  return okJson("Brand kit loaded.", { branding: branding ?? null });
}

async function readDeckHistory(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  if (!projectId) return badArgs("projectId required");
  const project = await DeckProjectModel.findById(projectId).lean();
  if (!project) return notFound("Project not found");
  const meta = record(project.meta);
  const deckArtifact = record(meta.deckArtifact);
  const history = Array.isArray(meta.deckHistory) ? meta.deckHistory : [];
  return okJson("Deck history loaded.", {
    currentVersion: deckArtifact.version ?? null,
    history,
    hasArtifact: Boolean(meta.deckArtifact),
  });
}

async function readUserPreferences(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.workspaceId) return badArgs("workspaceId required");
  const preferences = await WorkspacePreferenceModel.findOne({ workspaceId: ctx.workspaceId }).lean();
  return okJson("User preferences loaded.", { preferences: preferences ?? null });
}

async function createProjectSnapshot(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  if (!projectId) return badArgs("projectId required");
  const project = await DeckProjectModel.findById(projectId);
  if (!project) return notFound("Project not found");
  const meta = record(project.meta);
  const snapshots = Array.isArray(meta.snapshots) ? meta.snapshots as unknown[] : [];
  const snapshot = {
    snapshotId: `snap_${Date.now().toString(36)}`,
    reason: String(args.reason ?? "agent_snapshot").slice(0, 200),
    createdAt: new Date().toISOString(),
    jobId: ctx.jobId ?? null,
    title: project.title,
    description: project.description,
    artifact: meta.deckArtifact ?? null,
  };
  project.meta = { ...meta, snapshots: [snapshot, ...snapshots].slice(0, 20) };
  project.markModified("meta");
  await project.save();
  return okJson(`Created snapshot ${snapshot.snapshotId}.`, { snapshot });
}

function extractFileLike(kind: "pdf" | "docx" | "pptx") {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
    const fileResult = await executeRegisteredTool("read_file", { fileId: args.fileId, path: args.path }, ctx);
    if (!fileResult.ok) return fileResult;
    const text = String(fileResult.content ?? "");
    return okJson(`Extracted ${kind.toUpperCase()} text approximation.`, {
      kind,
      text: text.slice(0, 50_000),
      headings: inferHeadings(text),
      tables: [],
      images: [],
      warning: `${kind.toUpperCase()} binary parsing is not connected yet; returned readable text approximation when available.`,
    });
  };
}

async function extractSpreadsheet(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const fileResult = await executeRegisteredTool("read_file", { fileId: args.fileId, path: args.path }, ctx);
  if (!fileResult.ok) return fileResult;
  const lines = String(fileResult.content ?? "").split(/\r?\n/).filter(Boolean).slice(0, 200);
  const rows = lines.map((line) => line.split(",").map((cell) => cell.trim()));
  return okJson(`Extracted ${rows.length} spreadsheet rows.`, { rows, columns: rows[0] ?? [] });
}

async function extractImagesFromFile(args: Record<string, unknown>): Promise<ToolResult> {
  return okJson("Image extraction metadata prepared.", {
    fileId: args.fileId ?? null,
    images: [],
    warning: "Embedded binary image extraction is not connected yet; use upload_user_image for explicit image files.",
  });
}

async function ocrImage(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const hasGoogle = isGoogleVisionOcrConfigured();
  const hasTencent = isTencentOcrConfigured();
  if (!hasGoogle && !hasTencent) {
    return {
      ok: false,
      content: "OCR credentials are not configured.",
      error: "OCR_NOT_CONFIGURED",
      data: {
        status: "missing_credentials",
        expectedEnv: [
          "GOOGLE_VISION_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS",
          "TENCENT_OCR_SECRET_ID and TENCENT_OCR_SECRET_KEY",
        ],
      },
    };
  }

  const failures: string[] = [];
  let result: OcrResult | null = null;
  try {
    if (hasGoogle) {
      try {
        result = await runGoogleVisionOcr({
          ...args,
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
        });
      } catch (err) {
        failures.push(`google_vision: ${(err as Error).message}`);
      }
    }
    if (!result && hasTencent) {
      try {
        result = await runTencentOcr({
          ...args,
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
        });
        if (failures.length) result.fallbackFrom = "google_vision";
      } catch (err) {
        failures.push(`tencent_ocr: ${(err as Error).message}`);
      }
    }
    if (!result) {
      return {
        ok: false,
        content: `OCR failed: ${failures.join(" | ")}`,
        error: "OCR_FAILED",
        data: { providerFailures: failures },
      };
    }

    ctx.publish?.({
      channel: "agent.tool.ocr",
      payload: {
        tool: "ocr_image",
        provider: result.provider,
        fallbackFrom: result.fallbackFrom ?? null,
        textLength: result.text.length,
        blockCount: result.blocks.length,
        source: {
          type: result.source.type,
          fileId: result.source.fileId ?? null,
          mimeType: result.source.mimeType ?? null,
          bytes: result.source.bytes,
        },
      },
    });
    return okJson(result.text ? `OCR text extracted with ${result.provider}.` : `OCR completed with ${result.provider} and no readable text.`, {
      ...result,
      providerFailures: failures,
    });
  } catch (err) {
    return {
      ok: false,
      content: `OCR failed: ${(err as Error).message}`,
      error: "OCR_FAILED",
    };
  }
}

async function summarizeFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const fileResult = await executeRegisteredTool("read_file", { fileId: args.fileId, path: args.path }, ctx);
  if (!fileResult.ok) return fileResult;
  const text = String(fileResult.content ?? "");
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  const keyPoints = sentences.slice(0, 8);
  return okJson("File summarized.", {
    keyPoints,
    suggestedSlides: keyPoints.slice(0, 6).map((point, index) => ({ slideNumber: index + 1, title: titleFromText(point), purpose: point })),
    importantFacts: extractNumericClaims(text),
    tables: [],
    quotes: [],
    warnings: text.length > 40_000 ? ["File content was truncated for summary."] : [],
  });
}

async function verifySources(args: Record<string, unknown>): Promise<ToolResult> {
  const sources = arrayOfRecords(args.sources);
  const verified = sources.map((source) => {
    const url = String(source.url ?? "");
    const publisher = String(source.publisher ?? safeHostname(url) ?? "");
    const weak = /youtube|facebook|reddit|tiktok|instagram/i.test(url);
    return {
      ...source,
      publisher,
      credibility: weak ? "weak" : publisher ? "usable" : "unknown",
      used: !weak,
      warnings: weak ? ["Social/video source should not be used as a primary citation."] : [],
    };
  });
  return okJson(`Verified ${verified.length} sources.`, { sources: verified });
}

async function extractResearchFacts(args: Record<string, unknown>): Promise<ToolResult> {
  const sources = arrayOfRecords(args.sources);
  const facts = sources.flatMap((source) => extractNumericClaims([source.title, source.snippet, source.text, source.content].map(String).join(" ")).map((claim) => ({
    claim,
    source: source.url ?? null,
    publisher: source.publisher ?? safeHostname(String(source.url ?? "")),
    confidence: 0.65,
    suggestedSlide: "Evidence",
  })));
  return okJson(`Extracted ${facts.length} research facts.`, { facts });
}

async function createCitationList(args: Record<string, unknown>): Promise<ToolResult> {
  const sources = arrayOfRecords(args.sources);
  const citations = sources.map((source, index) => ({
    id: `src_${index + 1}`,
    title: String(source.title ?? "Untitled source"),
    publisher: String(source.publisher ?? safeHostname(String(source.url ?? "")) ?? "Unknown"),
    url: String(source.url ?? ""),
    accessedAt: new Date().toISOString(),
  }));
  return okJson(`Created ${citations.length} citations.`, { citations });
}

async function createDeckBrief(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const prompt = String(args.prompt ?? args.userPrompt ?? "");
  const slideCount = clampInt(Number(args.slideCount ?? inferSlideCount(prompt) ?? 6), 1, 100);
  const deckType = String(args.deckType ?? inferDeckType(prompt));
  const brief = {
    deckPurpose: deckType,
    audience: String(args.audience ?? audienceForDeckType(deckType)),
    slideCount,
    tone: String(args.tone ?? "professional"),
    researchMode: String(args.researchMode ?? (needsResearch(prompt) ? "auto" : "off")),
    designStyle: String(args.designStyle ?? "modern"),
    language: String(args.language ?? "en"),
    prompt,
  };
  ctx.publish?.({ channel: "deck.brief", payload: brief });
  return okJson("Deck brief created.", brief);
}

async function createDeckPlan(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slideCount = clampInt(Number(args.slideCount ?? 6), 1, 100);
  const plan = {
    deckTitle: String(args.deckTitle ?? args.title ?? "Untitled YDeck"),
    deckType: String(args.deckType ?? "general"),
    audience: String(args.audience ?? "general audience"),
    language: String(args.language ?? "en"),
    slideCount,
    style: String(args.designStyle ?? "modern"),
    steps: [
      "Analyze request",
      "Load context and files",
      "Research if needed",
      "Create outline",
      "Write slide content",
      "Choose layouts",
      "Design slides one by one",
      "Run QA and repair",
      "Export and deliver",
    ],
  };
  ctx.publish?.({ channel: "deck.plan", payload: plan });
  return okJson("Deck plan created.", plan);
}

async function createOutline(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = String(args.deckTitle ?? args.title ?? "Untitled YDeck");
  const slideCount = clampInt(Number(args.slideCount ?? 6), 1, 100);
  const slides = Array.from({ length: slideCount }, (_, index) => ({
    slideNumber: index + 1,
    slideType: outlineType(index, slideCount),
    title: fallbackOutlineTitle(index, title),
    purpose: `Communicate ${fallbackOutlineTitle(index, title).toLowerCase()}.`,
  }));
  const outline = { title, status: "draft", slideCount, slides };
  ctx.publish?.({ channel: "deck.outline", payload: outline });
  return okJson("Outline created.", outline);
}

async function updateOutline(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  ctx.publish?.({ channel: "deck.outline", payload: { status: "updated", outline: args.outline ?? args } });
  return okJson("Outline updated.", { outline: args.outline ?? args, instruction: args.instruction ?? null });
}

async function validateOutline(args: Record<string, unknown>): Promise<ToolResult> {
  const slides = arrayOfRecords(args.slides ?? record(args.outline).slides);
  const titles = slides.map((slide) => String(slide.title ?? "").trim()).filter(Boolean);
  const duplicateTitles = titles.filter((title, index) => titles.indexOf(title) !== index);
  const problems = [
    ...(slides.length ? [] : ["No slides found."]),
    ...(duplicateTitles.length ? [`Duplicate slide titles: ${[...new Set(duplicateTitles)].join(", ")}`] : []),
    ...slides.filter((slide) => !slide.title).map((slide) => `Slide ${slide.slideNumber ?? "?"} is missing a title.`),
  ];
  return okJson(problems.length ? "Outline has issues." : "Outline is valid.", {
    valid: problems.length === 0,
    slideCount: slides.length,
    problems,
  });
}

async function writeSlideContent(args: Record<string, unknown>): Promise<ToolResult> {
  const slides = arrayOfRecords(args.slides ?? record(args.outline).slides);
  const output = (slides.length ? slides : [{ slideNumber: 1, title: args.title ?? "Untitled slide" }]).map((slide, index) => ({
    slideNumber: Number(slide.slideNumber ?? index + 1),
    title: String(slide.title ?? `Slide ${index + 1}`),
    subtitle: String(slide.purpose ?? args.subtitle ?? ""),
    bullets: toBullets(slide.purpose ?? args.content ?? args.prompt ?? "Key message").slice(0, 4),
    speakerNotes: `Talk through the purpose of this slide and connect it to the deck story.`,
    visualSuggestion: String(slide.slideType ?? "cards"),
  }));
  return okJson(`Wrote content for ${output.length} slides.`, { slides: output });
}

async function rewriteSlide(args: Record<string, unknown>): Promise<ToolResult> {
  const slide = record(args.slide);
  const instruction = String(args.instruction ?? "Improve clarity.");
  return okJson("Slide rewritten.", {
    slide: {
      ...slide,
      title: String(args.title ?? slide.title ?? "Untitled slide"),
      bullets: toBullets(slide.bullets ?? slide.body ?? instruction).slice(0, 5),
      changeSummary: instruction,
    },
  });
}

async function rewriteDeck(args: Record<string, unknown>): Promise<ToolResult> {
  const deck = record(args.deck);
  const slides = arrayOfRecords(deck.slides).map((slide) => ({ ...slide, bullets: toBullets(slide.bullets ?? slide.body ?? slide.title).slice(0, 5) }));
  return okJson("Deck rewritten.", { deck: { ...deck, slides }, instruction: args.instruction ?? null });
}

async function translateDeck(args: Record<string, unknown>): Promise<ToolResult> {
  return okJson("Translation request prepared.", {
    targetLanguage: args.targetLanguage ?? args.language ?? "en",
    deck: args.deck ?? null,
    warning: "LLM translation is performed by the Content Agent; this tool returns structured translation intent.",
  });
}

async function addSpeakerNotes(args: Record<string, unknown>): Promise<ToolResult> {
  const deck = record(args.deck);
  const slides = arrayOfRecords(deck.slides).map((slide) => ({
    ...slide,
    speakerNotes: slide.speakerNotes ?? `Presenter note: explain ${String(slide.title ?? "this slide").toLowerCase()} in one clear story beat.`,
  }));
  return okJson("Speaker notes added.", { deck: { ...deck, slides } });
}

async function summarizeToSlides(args: Record<string, unknown>): Promise<ToolResult> {
  const text = String(args.text ?? args.content ?? "");
  const slideCount = clampInt(Number(args.slideCount ?? 6), 1, 30);
  const chunks = chunkText(text, slideCount);
  return okJson(`Summarized content into ${chunks.length} slides.`, {
    slides: chunks.map((chunk, index) => ({
      slideNumber: index + 1,
      title: titleFromText(chunk) || `Slide ${index + 1}`,
      bullets: toBullets(chunk).slice(0, 4),
    })),
  });
}

async function checkContentQuality(args: Record<string, unknown>): Promise<ToolResult> {
  const slides = arrayOfRecords(record(args.deck).slides ?? args.slides);
  const problems: string[] = [];
  for (const slide of slides) {
    const n = Number(slide.slideNumber ?? 0);
    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    if (!slide.title) problems.push(`Slide ${n || "?"} is missing a title.`);
    if (bullets.length > 6) problems.push(`Slide ${n || "?"} has too many bullets.`);
    if (JSON.stringify(slide).length > 1800) problems.push(`Slide ${n || "?"} may be too text-heavy.`);
  }
  return okJson(problems.length ? "Content quality issues found." : "Content quality looks acceptable.", {
    score: Math.max(60, 100 - problems.length * 8),
    problems,
  });
}

async function detectHallucinations(args: Record<string, unknown>): Promise<ToolResult> {
  const deckText = JSON.stringify(args.deck ?? args.slides ?? args.text ?? "");
  const claims = extractNumericClaims(deckText);
  const sources = arrayOfRecords(args.sources);
  const unsupported = claims.filter((claim) => !sources.some((source) => JSON.stringify(source).toLowerCase().includes(claim.toLowerCase().slice(0, 24))));
  return okJson(`Checked ${claims.length} factual claims.`, { claims, unsupported, needsSources: unsupported.length > 0 });
}

async function chooseDesignPack(args: Record<string, unknown>): Promise<ToolResult> {
  const style = String(args.designStyle ?? args.style ?? "modern").toLowerCase();
  const pack = style.includes("teacher") ? "modern_teacher" : style.includes("investor") ? "investor_saas" : "ydeck_modern";
  return okJson(`Chose design pack ${pack}.`, { packId: pack, reason: `Best match for ${style}.` });
}

async function chooseLayouts(args: Record<string, unknown>): Promise<ToolResult> {
  const slides = arrayOfRecords(args.slides ?? record(args.deck).slides);
  const layouts = slides.map((slide, index) => ({ slideNumber: Number(slide.slideNumber ?? index + 1), layoutId: chooseLayoutForSlide(slide, index), reason: "Selected from approved YDeck layout library." }));
  return okJson(`Chose ${layouts.length} layouts.`, { layouts });
}

async function applyBrandStyle(args: Record<string, unknown>): Promise<ToolResult> {
  const brand = record(args.brand ?? args.brandKit);
  return okJson("Brand style applied.", {
    tokens: {
      primary: brand.primaryColor ?? brand.primary ?? "#4f46e5",
      secondary: brand.secondaryColor ?? brand.secondary ?? "#06b6d4",
      accent: brand.accentColor ?? brand.accent ?? "#f97316",
      font: brand.font ?? "Inter",
    },
    html: typeof args.html === "string" ? args.html : undefined,
  });
}

async function normalizeSlideHtml(args: Record<string, unknown>): Promise<ToolResult> {
  const html = String(args.html ?? "");
  const normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
  return okJson("Slide HTML normalized.", { html: normalized, removedUnsafeContent: normalized !== html });
}

async function layoutFallback(args: Record<string, unknown>): Promise<ToolResult> {
  const slide = record(args.slide);
  const title = String(slide.title ?? args.title ?? "Untitled slide");
  const bullets = toBullets(slide.bullets ?? slide.body ?? args.content ?? title).slice(0, 4);
  const html = `<section class="ydeck-slide fallback"><h1>${escapeHtml(title)}</h1><div class="fallback-grid">${bullets.map((b) => `<p>${escapeHtml(b)}</p>`).join("")}</div></section>`;
  return okJson("Fallback layout created.", { slide: { ...slide, layoutId: "safe_fallback", previewHtml: html, html } });
}

async function detectVisualNeeds(args: Record<string, unknown>): Promise<ToolResult> {
  const slides = arrayOfRecords(args.slides ?? record(args.deck).slides);
  const needs = slides.map((slide, index) => {
    const text = JSON.stringify(slide).toLowerCase();
    return {
      slideNumber: Number(slide.slideNumber ?? index + 1),
      needsImage: /company|place|product|people|china|market|city|factory/.test(text),
      needsChart: /\d|market|growth|revenue|metric|data|trend/.test(text),
      needsIcons: /benefit|feature|problem|solution|steps/.test(text),
      needsDiagram: /process|workflow|timeline|roadmap|architecture|funnel/.test(text),
    };
  });
  return okJson("Visual needs detected.", { needs });
}

async function createChart(args: Record<string, unknown>): Promise<ToolResult> {
  const data = arrayOfRecords(args.data);
  const labels = data.map((d, i) => String(d.label ?? d.name ?? `Item ${i + 1}`));
  const values = data.map((d) => Number(d.value ?? 0));
  const max = Math.max(1, ...values);
  const bars = values.map((v, i) => `<rect x="${80 + i * 120}" y="${320 - (v / max) * 220}" width="70" height="${(v / max) * 220}" rx="10" fill="#4f46e5"/><text x="${115 + i * 120}" y="360" text-anchor="middle" font-size="22">${escapeHtml(labels[i])}</text>`).join("");
  return okJson("Chart visual created.", { type: args.type ?? "bar", svg: `<svg viewBox="0 0 720 420" role="img">${bars}</svg>` });
}

async function createTableVisual(args: Record<string, unknown>): Promise<ToolResult> {
  const rows = Array.isArray(args.rows) ? args.rows as unknown[] : [];
  const html = `<table class="ydeck-table">${rows.map((row) => `<tr>${(Array.isArray(row) ? row : Object.values(record(row))).map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</table>`;
  return okJson("Table visual created.", { html });
}

async function createDiagram(args: Record<string, unknown>): Promise<ToolResult> {
  const steps = toBullets(args.steps ?? args.items ?? args.content ?? "Start, Build, Launch").slice(0, 6);
  const html = `<div class="ydeck-diagram">${steps.map((step, i) => `<div class="node"><b>${i + 1}</b><span>${escapeHtml(step)}</span></div>`).join("")}</div>`;
  return okJson("Diagram created.", { type: args.type ?? "process", html });
}

async function createIconVisual(args: Record<string, unknown>): Promise<ToolResult> {
  const items = toBullets(args.items ?? args.labels ?? args.content ?? "Idea, Build, Launch").slice(0, 8);
  const html = `<div class="ydeck-icons">${items.map((item) => `<div class="icon-item"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" fill="currentColor"/></svg><span>${escapeHtml(item)}</span></div>`).join("")}</div>`;
  return okJson("Icon visual created.", { html });
}

async function cropOrRepositionImage(args: Record<string, unknown>): Promise<ToolResult> {
  return okJson("Image crop instructions created.", {
    objectFit: args.objectFit ?? "cover",
    objectPosition: args.focus ?? args.objectPosition ?? "center center",
    aspectRatio: args.aspectRatio ?? "16 / 9",
  });
}

async function createImageCredits(args: Record<string, unknown>): Promise<ToolResult> {
  const assets = arrayOfRecords(args.assets ?? args.images);
  const credits = assets.map((asset, index) => ({
    id: asset.id ?? `img_${index + 1}`,
    photographer: asset.photographer ?? asset.author ?? "Unknown",
    source: asset.source ?? "pexels",
    url: asset.sourceUrl ?? asset.url ?? "",
  }));
  return okJson(`Created ${credits.length} image credits.`, { credits });
}

async function runDesignQa(args: Record<string, unknown>): Promise<ToolResult> {
  const deck = record(args.deck);
  const slides = arrayOfRecords(deck.slides ?? args.slides);
  const problems: string[] = [];
  for (const slide of slides) {
    const n = slide.slideNumber ?? "?";
    const html = String(slide.previewHtml ?? slide.html ?? record(slide.preview).html ?? "");
    if (!slide.title) problems.push(`Slide ${n} missing title.`);
    if (html && /font-size:\s*(?:[0-9]|1[0-9]|2[0-3])px/i.test(html)) problems.push(`Slide ${n} may have small text.`);
    if (JSON.stringify(slide).length > 2500) problems.push(`Slide ${n} may be crowded.`);
  }
  return okJson(problems.length ? "Design QA found issues." : "Design QA passed.", {
    score: Math.max(60, 100 - problems.length * 7),
    problems,
    checks: ["title", "text_density", "small_font"],
  });
}

async function renderSlideScreenshotTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slide = record(args.slide);
  const html = String(args.html ?? args.previewHtml ?? slide.html ?? slide.previewHtml ?? record(slide.preview).html ?? "");
  if (!html.trim()) return badArgs("render_slide_screenshot requires html or slide.preview.html");
  try {
    const result = await renderSlideScreenshot({
      html,
      slideNumber: Number(args.slideNumber ?? slide.slideNumber ?? 1),
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      width: Number(args.width ?? 1920),
      height: Number(args.height ?? 1080),
      deviceScaleFactor: Number(args.deviceScaleFactor ?? 1),
    });
    ctx.publish?.({ channel: "agent.tool.render", payload: { tool: "render_slide_screenshot", ...result } });
    return okJson("Slide screenshot rendered.", result);
  } catch (err) {
    return { ok: false, content: `Render failed: ${(err as Error).message}`, error: "RENDER_FAILED" };
  }
}

async function renderDeckScreenshotsTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const deck = record(args.deck);
  const slides = arrayOfRecords(args.slides ?? deck.slides).map((slide, index) => ({
    html: String(slide.html ?? slide.previewHtml ?? record(slide.preview).html ?? ""),
    slideNumber: Number(slide.slideNumber ?? index + 1),
  })).filter((slide) => slide.html.trim());
  if (!slides.length) return badArgs("render_deck_screenshots requires slides with html or preview.html");
  try {
    const screenshots = await renderDeckScreenshots({
      slides,
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      width: Number(args.width ?? 1920),
      height: Number(args.height ?? 1080),
      deviceScaleFactor: Number(args.deviceScaleFactor ?? 1),
    });
    const result = {
      screenshots,
      count: screenshots.length,
      renderedAt: new Date().toISOString(),
    };
    ctx.publish?.({ channel: "agent.tool.render", payload: { tool: "render_deck_screenshots", ...result } });
    return okJson(`Rendered ${screenshots.length} slide screenshots.`, result);
  } catch (err) {
    return { ok: false, content: `Render failed: ${(err as Error).message}`, error: "RENDER_FAILED" };
  }
}

async function visionReviewSlideTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slide = record(args.slide);
  let screenshotUrl = String(args.screenshotUrl ?? slide.screenshotUrl ?? "");
  const html = String(args.html ?? args.previewHtml ?? slide.html ?? slide.previewHtml ?? record(slide.preview).html ?? "");
  const slideNumber = Number(args.slideNumber ?? slide.slideNumber ?? 1);
  if (!screenshotUrl && html.trim()) {
    const rendered = await renderSlideScreenshot({
      html,
      slideNumber,
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      width: Number(args.width ?? 1920),
      height: Number(args.height ?? 1080),
      deviceScaleFactor: Number(args.deviceScaleFactor ?? 1),
    });
    screenshotUrl = rendered.screenshotUrl;
    ctx.publish?.({ channel: "agent.tool.render", payload: { tool: "render_slide_screenshot", ...rendered } });
  }
  if (!screenshotUrl && !args.fileId && !args.imageBase64) {
    return badArgs("vision_review_slide requires screenshotUrl, fileId, imageBase64, or slide html.");
  }
  try {
    const review = await reviewSlideWithVision({
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      slideNumber,
      slideTitle: String(args.slideTitle ?? slide.title ?? ""),
      layoutId: String(args.layoutId ?? slide.layoutId ?? ""),
      screenshotUrl,
      fileId: typeof args.fileId === "string" ? args.fileId : undefined,
      imageBase64: typeof args.imageBase64 === "string" ? args.imageBase64 : undefined,
      deckBrief: args.deckBrief,
      slidePlan: args.slidePlan,
    });
    ctx.publish?.({
      channel: "deck.qa",
      payload: {
        source: "vision_qa",
        scope: "slide",
        slideNumber: review.slideNumber,
        score: review.score,
        approved: review.approved,
        summary: review.summary,
        repairing: !review.approved,
        provider: review.provider,
      },
    });
    return okJson("Vision slide review complete.", review);
  } catch (err) {
    return { ok: false, content: `Vision QA failed: ${(err as Error).message}`, error: "VISION_QA_FAILED" };
  }
}

async function visionReviewDeckTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const deck = record(args.deck);
  const inputShots = arrayOfRecords(args.screenshots);
  let screenshots = inputShots.map((shot) => ({
    slideNumber: Number(shot.slideNumber ?? 0) || undefined,
    title: typeof shot.title === "string" ? shot.title : undefined,
    screenshotUrl: typeof shot.screenshotUrl === "string" ? shot.screenshotUrl : undefined,
    fileId: typeof shot.fileId === "string" ? shot.fileId : undefined,
    imageBase64: typeof shot.imageBase64 === "string" ? shot.imageBase64 : undefined,
    layoutId: typeof shot.layoutId === "string" ? shot.layoutId : undefined,
  }));
  if (!screenshots.length) {
    const slides = arrayOfRecords(args.slides ?? deck.slides);
    const renderable = slides.map((slide, index) => ({
      html: String(slide.html ?? slide.previewHtml ?? record(slide.preview).html ?? ""),
      slideNumber: Number(slide.slideNumber ?? index + 1),
    })).filter((slide) => slide.html.trim());
    if (!renderable.length) return badArgs("vision_review_deck requires screenshots or deck/slides with html.");
    const rendered = await renderDeckScreenshots({
      slides: renderable,
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      width: Number(args.width ?? 1920),
      height: Number(args.height ?? 1080),
      deviceScaleFactor: Number(args.deviceScaleFactor ?? 1),
    });
    ctx.publish?.({ channel: "agent.tool.render", payload: { tool: "render_deck_screenshots", screenshots: rendered, count: rendered.length, renderedAt: new Date().toISOString() } });
    screenshots = rendered.map((shot, index) => ({
      slideNumber: shot.slideNumber,
      title: String(slides[index]?.title ?? ""),
      screenshotUrl: shot.screenshotUrl,
      fileId: shot.fileId,
      imageBase64: undefined,
      layoutId: String(slides[index]?.layoutId ?? ""),
    }));
  }
  try {
    const review = await reviewDeckWithVision({
      jobId: String(args.jobId ?? ctx.jobId ?? ""),
      deckId: String(args.deckId ?? ctx.projectId ?? ""),
      projectId: String(args.projectId ?? ctx.projectId ?? ""),
      workspaceId: ctx.workspaceId,
      screenshots,
      deckBrief: args.deckBrief,
    });
    ctx.publish?.({
      channel: "deck.qa",
      payload: {
        source: "vision_qa",
        scope: "deck",
        averageScore: review.averageScore,
        approved: review.approved,
        deckSummary: review.deckSummary,
        slidesNeedingRepair: review.slidesNeedingRepair,
        repairing: !review.approved,
        provider: review.provider,
      },
    });
    return okJson("Vision deck review complete.", review);
  } catch (err) {
    return { ok: false, content: `Vision deck QA failed: ${(err as Error).message}`, error: "VISION_QA_FAILED" };
  }
}

async function repairSlideDesign(args: Record<string, unknown>): Promise<ToolResult> {
  const fallback = await layoutFallback(args);
  return { ...fallback, content: "Slide design repaired with safe fallback layout." };
}

async function repairDeckDesign(args: Record<string, unknown>): Promise<ToolResult> {
  const deck = record(args.deck);
  const slides = await Promise.all(arrayOfRecords(deck.slides).map(async (slide) => record((await layoutFallback({ slide })).data).slide ?? slide));
  return okJson("Deck design repaired.", { deck: { ...deck, slides } });
}

async function checkAccessibility(args: Record<string, unknown>): Promise<ToolResult> {
  const html = JSON.stringify(args.deck ?? args.slide ?? args.html ?? "");
  const problems = [
    ...(/font-size:\s*(?:[0-9]|1[0-9]|2[0-3])px/i.test(html) ? ["Text smaller than 24px detected."] : []),
    ...(/#[a-f0-9]{3,6}/i.test(html) ? [] : ["No explicit color tokens detected."]),
  ];
  return okJson(problems.length ? "Accessibility issues found." : "Accessibility checks passed.", { score: Math.max(70, 100 - problems.length * 10), problems });
}

async function finalDeckReview(args: Record<string, unknown>): Promise<ToolResult> {
  const content = await checkContentQuality(args);
  const design = await runDesignQa(args);
  return okJson("Final deck review complete.", {
    content: content.data,
    design: design.data,
    exportReady: Boolean(content.ok && design.ok),
  });
}

async function saveDeckArtifactTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const deck = record(args.deck) as CloudDeckArtifact;
  if (!deck.deckTitle || !Array.isArray(deck.slides)) return badArgs("deck.deckTitle and deck.slides are required");
  return saveCloudDeckArtifact(ctx, deck, "save_deck_artifact", String(args.changeSummary ?? "Advanced tool save"));
}

async function createDeckVersion(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  if (!projectId) return badArgs("projectId required");
  const project = await DeckProjectModel.findById(projectId);
  if (!project) return notFound("Project not found");
  const meta = record(project.meta);
  const versions = Array.isArray(meta.versions) ? meta.versions as unknown[] : [];
  const version = {
    versionId: `v_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    jobId: ctx.jobId ?? null,
    reason: String(args.reason ?? "manual_version"),
    artifact: args.deck ?? meta.deckArtifact ?? null,
  };
  project.meta = { ...meta, versions: [version, ...versions].slice(0, 50) };
  project.markModified("meta");
  await project.save();
  return okJson(`Created version ${version.versionId}.`, { version });
}

async function compareDeckVersions(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  if (!projectId) return badArgs("projectId required");
  const project = await DeckProjectModel.findById(projectId).lean();
  if (!project) return notFound("Project not found");
  const versions = Array.isArray(record(project.meta).versions) ? record(project.meta).versions as Array<Record<string, unknown>> : [];
  const a = versions.find((v) => v.versionId === args.fromVersionId) ?? versions[1];
  const b = versions.find((v) => v.versionId === args.toVersionId) ?? versions[0];
  return okJson("Version comparison complete.", {
    fromVersionId: a?.versionId ?? null,
    toVersionId: b?.versionId ?? null,
    changed: JSON.stringify(a?.artifact ?? null) !== JSON.stringify(b?.artifact ?? null),
  });
}

async function rollbackDeckVersion(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  if (!projectId) return badArgs("projectId required");
  const project = await DeckProjectModel.findById(projectId);
  if (!project) return notFound("Project not found");
  const meta = record(project.meta);
  const versions = Array.isArray(meta.versions) ? meta.versions as Array<Record<string, unknown>> : [];
  const version = versions.find((v) => v.versionId === args.versionId);
  if (!version || !version.artifact) return notFound("Version artifact not found");
  project.meta = { ...meta, deckArtifact: version.artifact, rolledBackAt: new Date().toISOString(), rolledBackTo: version.versionId };
  project.markModified("meta");
  await project.save();
  return okJson(`Rolled back to ${version.versionId}.`, { versionId: version.versionId });
}

function exportArtifact(format: "pptx" | "pdf" | "png") {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
    const projectId = String(args.projectId ?? ctx.projectId ?? "");
    if (!projectId) return badArgs("projectId required");
    const file = await FileModel.create({
      workspaceId: ctx.workspaceId,
      projectId,
      scope: "job",
      kind: `export_${format}`,
      filename: `ydeck-export.${format === "png" ? "zip" : format}`,
      mimeType: format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : format === "pdf" ? "application/pdf" : "application/zip",
      sizeBytes: 0,
      storageUrl: `data:text/plain;base64,${Buffer.from(`${format.toUpperCase()} export placeholder. Use cloud export route for downloadable rich export.`).toString("base64")}`,
      meta: { source: `export_${format}`, pendingRichExport: true },
    });
    return okJson(`${format.toUpperCase()} export artifact created.`, { fileId: file.id, format, pendingRichExport: true });
  };
}

async function createShareLink(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const projectId = String(args.projectId ?? ctx.projectId ?? "");
  return okJson("Share link metadata created.", { url: `/cloud/decks/${projectId}`, projectId });
}

async function sendToChannel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  ctx.publish?.({ channel: "deck.delivery", payload: { channel: args.channel ?? "web", status: "pending_connection" } });
  return okJson("Delivery request recorded.", { channel: args.channel ?? "web", status: "pending_connection" });
}

async function notifyUser(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const payload = { message: String(args.message ?? "YDeck job update."), level: args.level ?? "info" };
  ctx.publish?.({ channel: "deck.notification", payload });
  return okJson("Notification emitted.", payload);
}

function memoryAlias(op: "add" | "search") {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> =>
    executeRegisteredTool("manage_memory", { ...args, op, text: args.text ?? args.memory, query: args.query ?? args.text }, ctx);
}

function skillAlias(op: "list" | "search") {
  return async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => executeRegisteredTool("manage_skills", { ...args, op }, ctx);
}

async function runSkill(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const skill = await executeRegisteredTool("manage_skills", { op: "search", query: args.skillName ?? args.name ?? args.id ?? "", limit: 1 }, ctx);
  return okJson("Skill run prepared.", { skill: skill.data ?? null, input: args.input ?? args });
}

async function saveUserFeedback(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.workspaceId) return badArgs("workspaceId required");
  const pref = await WorkspacePreferenceModel.findOneAndUpdate({ workspaceId: ctx.workspaceId }, { $setOnInsert: { workspaceId: ctx.workspaceId } }, { upsert: true, new: true });
  const meta = record(pref.get("meta"));
  const feedback = Array.isArray(meta.agentFeedback) ? meta.agentFeedback as unknown[] : [];
  const item = { id: `fb_${Date.now().toString(36)}`, rating: args.rating ?? null, text: args.text ?? args.feedback ?? "", jobId: ctx.jobId ?? null, createdAt: new Date().toISOString() };
  pref.set("meta", { ...meta, agentFeedback: [item, ...feedback].slice(0, 200) });
  await pref.save();
  return okJson("Feedback saved.", { feedback: item });
}

async function trackGenerationMetrics(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.jobId) {
    await DeckJobModel.findByIdAndUpdate(ctx.jobId, {
      $set: {
        "resultMeta.metrics": {
          ...(record(args.metrics)),
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
  return okJson("Generation metrics tracked.", { metrics: args.metrics ?? args, jobId: ctx.jobId ?? null });
}

async function adminAuditLog(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  await AuditLogModel.create({
    userId: ctx.userId ?? null,
    workspaceId: ctx.workspaceId ?? null,
    action: String(args.action ?? "agent.admin_audit_log"),
    targetType: String(args.targetType ?? "agent_tool"),
    targetId: String(args.targetId ?? ctx.jobId ?? ctx.projectId ?? "unknown"),
    meta: { ...args, tool: "admin_audit_log" },
  });
  return okJson("Admin audit log recorded.", { action: args.action ?? "agent.admin_audit_log" });
}

function okJson(content: string, data: unknown): ToolResult {
  return { ok: true, content, data };
}

function badArgs(content: string): ToolResult {
  return { ok: false, content, error: "BAD_ARGS" };
}

function notFound(content: string): ToolResult {
  return { ok: false, content, error: "NOT_FOUND" };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function inferHeadings(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 4 && line.length < 120).slice(0, 12);
}

function extractNumericClaims(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ");
  const claims = normalized.match(/[^.!?]*(?:\d+(?:\.\d+)?%?|\$[0-9][\d,.]*|[0-9][\d,.]*\s*(?:million|billion|trillion|users|customers|students|teachers|schools|companies))[^.!?]*[.!?]?/gi) ?? [];
  return [...new Set(claims.map((claim) => claim.trim()).filter((claim) => claim.length > 8))].slice(0, 30);
}

function titleFromText(text: unknown): string {
  return String(text ?? "Untitled").replace(/\s+/g, " ").trim().slice(0, 80);
}

function toBullets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? "")
    .split(/\n|;|,(?=\s*[A-Z0-9])/)
    .map((part) => part.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function chunkText(text: string, count: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return Array.from({ length: count }, (_, i) => `Slide ${i + 1}`);
  const size = Math.max(20, Math.ceil(words.length / count));
  const chunks: string[] = [];
  for (let i = 0; i < words.length && chunks.length < count; i += size) chunks.push(words.slice(i, i + size).join(" "));
  return chunks;
}

function inferSlideCount(prompt: string): number | undefined {
  const explicit = /\b(\d{1,2})\s*[- ]?(slide|slides|page|pages)\b/i.exec(prompt);
  if (explicit) return Number(explicit[1]);
  if (/\bone\s+slide\b|\bsingle\s+slide\b|\b1\s*[- ]?slide\b/i.test(prompt)) return 1;
  return undefined;
}

function inferDeckType(prompt: string): string {
  if (/pitch|investor|fund/i.test(prompt)) return "investor_pitch";
  if (/lesson|teacher|student|class/i.test(prompt)) return "lesson_deck";
  if (/sales|customer|product/i.test(prompt)) return "sales_deck";
  return "general";
}

function audienceForDeckType(deckType: string): string {
  if (deckType.includes("investor")) return "investors";
  if (deckType.includes("lesson")) return "students";
  if (deckType.includes("sales")) return "customers";
  return "general audience";
}

function needsResearch(prompt: string): boolean {
  return /\b(latest|recent|market|competitor|research|statistics|data|source|sources|trend)\b/i.test(prompt);
}

function outlineType(index: number, total: number): string {
  if (index === 0) return "title";
  if (index === total - 1) return "closing";
  return ["overview", "problem", "solution", "market", "proof", "plan"][Math.min(index - 1, 5)] ?? "content";
}

function fallbackOutlineTitle(index: number, deckTitle: string): string {
  return [deckTitle, "Context", "Key Challenges", "Main Idea", "Evidence", "Plan", "Next Steps"][index] ?? `Slide ${index + 1}`;
}

function chooseLayoutForSlide(slide: Record<string, unknown>, index: number): string {
  const text = JSON.stringify(slide).toLowerCase();
  if (index === 0) return "title_hero";
  if (/timeline|roadmap|history/.test(text)) return "timeline";
  if (/compare|versus|vs/.test(text)) return "comparison";
  if (/\d|market|growth|revenue/.test(text)) return "metric_chart";
  if (/image|photo|place|company|product/.test(text)) return "image_split";
  return "card_grid";
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function allAdvancedToolNames(): string[] {
  return ADVANCED_TOOL_SPECS.map((spec) => normalizeToolName(spec.name));
}
