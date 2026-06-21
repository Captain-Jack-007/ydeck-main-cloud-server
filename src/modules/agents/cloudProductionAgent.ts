import {
  AuditLogModel,
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  InstalledPackModel,
  PluginPackModel,
  TemplatePackModel,
  WorkspaceBrandingModel,
  WorkspacePreferenceModel,
  type DeckJobDoc,
} from "../../models";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { jobBus } from "../decks/jobs.events";
import { searchImages, selectImage, type ImageAsset } from "../assets/imageAsset.service";
import {
  normalizeResearchMode,
  runLiveResearch,
  shouldResearch,
  type ResearchArtifact,
} from "../research/researchAgent.service";
import { effectiveCloudConfig, getCloudLlmProvider, type CloudLlmProvider } from "./cloudLlm";
import {
  cloudDesignSummary,
  designCloudDeckArtifact,
  saveCloudDeckArtifact,
  type CloudDeckArtifact,
  type CloudDeckSlide,
} from "./tools/cloudDeck.tools";
import type {
  CloudAgentName,
  CloudEventChannel,
  CloudProductionStatus,
} from "./cloudWorkflow.contract";
import {
  contentArtifactSchema,
  deckBriefSchema,
  exportArtifactSchema,
  layoutArtifactSchema,
  outlineArtifactSchema,
  planArtifactSchema,
  qaArtifactSchema,
} from "./cloudWorkflow.contract";
import { emitCloudEvent, selectCloudWorkflow } from "./cloudOrchestrator";

type DeckBrief = typeof deckBriefSchema._output;
type PlanArtifact = typeof planArtifactSchema._output;
type OutlineArtifact = typeof outlineArtifactSchema._output;
type ContentArtifact = typeof contentArtifactSchema._output;
type LayoutArtifact = typeof layoutArtifactSchema._output;
type QaArtifact = typeof qaArtifactSchema._output;
type ExportArtifact = typeof exportArtifactSchema._output;

interface ProjectSnapshot {
  id: string;
  title: string;
  description?: string | null;
  templateId?: string | null;
  meta: Record<string, unknown>;
}

interface RunContext {
  job: DeckJobDoc;
  project: ProjectSnapshot;
  input: Record<string, unknown>;
  provider: CloudLlmProvider;
  artifacts: Record<string, unknown>;
}

interface ContextArtifact {
  project: ProjectSnapshot;
  preferences: unknown;
  branding: unknown;
  installedPacks: unknown[];
  templatePacks: unknown[];
  pluginPacks: unknown[];
  previousDeckVersion: unknown;
}

interface FileExtractionArtifact {
  fileId?: string;
  files: Array<{ id: string; filename: string; mimeType?: string | null; sizeBytes?: number | null }>;
  summary: string;
  keyFacts: string[];
  suggestedSlides: string[];
  importantSections: string[];
}

interface DesignArtifact {
  deck: CloudDeckArtifact;
  report: ReturnType<typeof designCloudDeckArtifact>["report"];
}

interface ImageAssetArtifact {
  assets: ImageAsset[];
  skipped: Array<{ slideNumber: number; reason: string }>;
}

export async function runCloudProductionDeckJob(job: DeckJobDoc): Promise<void> {
  const projectDoc = await DeckProjectModel.findById(job.projectId).lean();
  if (!projectDoc) throw new Error("Project not found for deck job.");

  const cloudConfig = await effectiveCloudConfig();
  const provider = await getCloudLlmProvider(cloudConfig);
  const project: ProjectSnapshot = {
    id: String(projectDoc._id),
    title: projectDoc.title,
    description: projectDoc.description ?? null,
    templateId: projectDoc.templateId ?? null,
    meta: isRecord(projectDoc.meta) ? projectDoc.meta : {},
  };
  const ctx: RunContext = {
    job,
    project,
    input: isRecord(job.inputParams) ? job.inputParams : {},
    provider,
    artifacts: {},
  };

  await setProductionState(job, "planning", 8);
  const brief = await classifierAgent(ctx);
  ctx.artifacts.deckBrief = brief;
  const workflow = selectCloudWorkflow({
    intent: brief.intent === "edit_deck" ? "edit_deck" : brief.intent,
    hasFiles: brief.hasFiles,
    needsResearch: brief.needsResearch,
  });
  ctx.artifacts.workflow = workflow;

  const plan = await plannerAgent(ctx, brief);
  await saveStageArtifacts(ctx, { deckBrief: brief, plan, workflow });

  await setProductionState(job, "context_loading", 15);
  const context = await contextAgent(ctx);
  ctx.artifacts.context = context;
  emitCloudEvent(job, "deck.context", summarizeContext(context));
  await saveStageArtifacts(ctx, { context });

  let files: FileExtractionArtifact | null = null;
  if (brief.hasFiles) {
    await setProductionState(job, "file_processing", 22);
    files = await fileExtractionAgent(ctx);
    ctx.artifacts.files = files;
    emitCloudEvent(job, "deck.file", files);
    await saveStageArtifacts(ctx, { files });
  }

  let research: ResearchArtifact | null = null;
  if (shouldResearch({
    researchMode: ctx.input.researchMode,
    classifierNeedsResearch: brief.needsResearch,
    prompt: String(ctx.input.prompt ?? ctx.input.userPrompt ?? project.description ?? project.title),
  })) {
    await setProductionState(job, "researching", 28);
    research = await researchAgent(ctx, brief, files);
    ctx.artifacts.research = research;
    emitCloudEvent(job, "deck.research", researchEventPayload(research));
    await saveStageArtifacts(ctx, { research });
  }

  await setProductionState(job, "outlining", 34);
  const outline = await outlineAgent(ctx, brief, context, files, research);
  ctx.artifacts.outline = outline;
  emitCloudEvent(job, "deck.outline", { ...outline, status: "approved_by_cloud_orchestrator" });
  await saveStageArtifacts(ctx, { outline });

  await setProductionState(job, "content_writing", 46);
  const content = await contentAgent(ctx, brief, outline, context, files, research);
  ctx.artifacts.content = content;
  emitCloudEvent(job, "deck.content", { stage: "content_writing", ...content });
  await saveStageArtifacts(ctx, { content });

  await setProductionState(job, "layouting", 58);
  const layout = await layoutAgent(ctx, content);
  ctx.artifacts.layout = layout;
  emitCloudEvent(job, "deck.content", { stage: "layouting", ...layout });
  await saveStageArtifacts(ctx, { layout });

  const imageAssets = await imageAssetAgent(ctx, content);
  ctx.artifacts.imageAssets = imageAssets;
  if (imageAssets.assets.length || imageAssets.skipped.length) {
    emitCloudEvent(job, "deck.asset", imageAssets);
    await saveStageArtifacts(ctx, { imageAssets });
  }

  await setProductionState(job, "designing", 68);
  const design = await htmlDesignerAgent(ctx, brief, content, layout, imageAssets);
  ctx.artifacts.design = { deck: design };
  await saveStageArtifacts(ctx, { design: { deck: stripHeavyHtml(design) } });

  await setProductionState(job, "rendering", 78);
  emitSlidePreviews(job, design);

  await setProductionState(job, "qa_checking", 84);
  const qa = await visionQaAgent(ctx, design);
  ctx.artifacts.qa = qa;
  emitCloudEvent(job, "deck.qa", qa);
  await saveStageArtifacts(ctx, { qa });

  let finalDesign = design;
  if (qa.averageScore < 85 || qa.issues.some((issue) => issue.severity === "error")) {
    await setProductionState(job, "repairing", 88);
    finalDesign = await repairAgent(ctx, design, qa);
    ctx.artifacts.repair = { repaired: true, deck: stripHeavyHtml(finalDesign) };
    emitCloudEvent(job, "deck.repair", {
      repaired: true,
      reason: "QA score below target or blocking issue detected.",
      slideCount: finalDesign.slides.length,
    });
    emitSlidePreviews(job, finalDesign);
    await saveStageArtifacts(ctx, { repair: ctx.artifacts.repair });
  }

  const designed = designCloudDeckArtifact(finalDesign, { targetScore: 85, maxAttempts: 3, forceDesign: false });
  const saveResult = await saveCloudDeckArtifact(
    {
      projectId: String(job.projectId),
      jobId: job.id,
      publish: ({ channel, payload }) => {
        jobBus.emitJob({
          jobId: job.id,
          status: job.status,
          progress: job.progress,
          channel,
          payload,
          at: new Date().toISOString(),
        });
      },
    },
    designed.deck,
    "cloud_production_orchestrator",
    cloudDesignSummary(designed.report),
  );
  ctx.artifacts.finalDesign = { report: designed.report, saveResult };

  await setProductionState(job, "exporting", 93);
  const exported = await exportAgent(ctx, designed.deck);
  ctx.artifacts.export = exported;
  emitCloudEvent(job, "deck.export", exported);
  await saveStageArtifacts(ctx, { export: exported, finalDesign: { report: designed.report } });

  await setProductionState(job, "delivering", 97);
  emitCloudEvent(job, "deck.done", {
    delivery: "web_dashboard",
    deckTitle: designed.deck.deckTitle,
    slideCount: designed.deck.slides.length,
  });

  const fresh = await DeckJobModel.findById(job.id).lean();
  const resultMeta = isRecord(fresh?.resultMeta) ? fresh.resultMeta : {};
  await DeckJobModel.findByIdAndUpdate(job.id, {
    $set: {
      status: "done",
      progress: 100,
      finishedAt: new Date(),
      resultMeta: {
        ...resultMeta,
        cloudMode: {
          provider: provider.name,
          model: provider.model,
          mode: "cloud",
          architecture: "cloud_production_multi_agent",
        },
        productionFlow: {
          workflow: workflow.name,
          agents: workflow.agents,
          artifacts: ctx.artifacts,
        },
      },
    },
  });
  job.status = "done";
  job.progress = 100;
  jobBus.emitJob({
    jobId: job.id,
    status: "done",
    progress: 100,
    channel: "run.summary",
    payload: {
      provider: provider.name,
      model: provider.model,
      workflow: workflow.name,
      agents: workflow.agents,
      export: exported,
    },
    at: new Date().toISOString(),
  });
}

async function classifierAgent(ctx: RunContext): Promise<DeckBrief> {
  const prompt = jsonPrompt(
    "Request Classifier Agent",
    {
      project: ctx.project,
      input: ctx.input,
      jobType: ctx.job.type,
    },
    `Return JSON with intent, deckType, audience, slideCount, language, needsResearch, hasFiles, requiresOutlineApproval.
Use intent create_deck for generation and edit_deck for refinement.
Do not treat "a slide about X" as exactly one slide. Only use slideCount 1 when the user explicitly says "one slide", "single slide", or "1 slide". For broad topic prompts without a count, choose a useful mini-deck count such as 5-7.`,
  );
  const fallback = buildFallbackBrief(ctx);
  const brief = await callJsonAgent(ctx, "request_classifier", prompt, deckBriefSchema, fallback, { temperature: 0.1, maxTokens: 700 });
  return normalizeDeckBrief(ctx, brief);
}

async function plannerAgent(ctx: RunContext, brief: DeckBrief): Promise<PlanArtifact> {
  const refinementPlan = designRefinementPlan(ctx);
  if (refinementPlan) {
    const plan: PlanArtifact = {
      type: "deck.plan",
      source: "planner_agent",
      summary: refinementPlan.summary,
      steps: refinementPlan.plannedChanges.map((label, index) => ({
        label,
        status: index === 0 ? "running" : "pending",
      })),
    };
    emitCloudEvent(ctx.job, "deck.plan", {
      ...plan,
      intent: "design_refinement",
      instruction: refinementPlan.instruction,
      plannedChanges: refinementPlan.plannedChanges,
      preserveContent: refinementPlan.preserveContent,
    });
    return plan;
  }
  const steps = [
    "Analyze request",
    brief.hasFiles ? "Read uploaded files" : "Load project context",
    brief.needsResearch ? "Research supporting facts" : "Skip external research",
    "Create outline",
    "Write slide content",
    "Choose layouts",
    "Design HTML slides",
    "Render previews",
    "Run design QA",
    "Repair weak slides",
    "Prepare export metadata",
    "Deliver final deck",
  ];
  const fallback: PlanArtifact = {
    type: "deck.plan",
    source: "planner_agent",
    summary: `Creating a ${brief.slideCount}-slide ${brief.deckType} deck for ${brief.audience}.`,
    steps: steps.map((label, index) => ({ label, status: index === 0 ? "running" : "pending" })),
  };
  const prompt = jsonPrompt(
    "Planner Agent",
    { brief, project: ctx.project },
    "Return JSON with type deck.plan, source planner_agent, summary, and steps array. Each step has label and status.",
  );
  const plan = await callJsonAgent(ctx, "planner", prompt, planArtifactSchema, fallback, { temperature: 0.2, maxTokens: 1000 });
  emitCloudEvent(ctx.job, "deck.plan", plan);
  return plan;
}

async function contextAgent(ctx: RunContext): Promise<ContextArtifact> {
  const [preferences, branding, installedPacks, templatePacks, pluginPacks] = await Promise.all([
    WorkspacePreferenceModel.findOne({ workspaceId: ctx.job.workspaceId }).lean(),
    WorkspaceBrandingModel.findOne({ workspaceId: ctx.job.workspaceId }).lean(),
    InstalledPackModel.find({ workspaceId: ctx.job.workspaceId, enabled: true }).limit(50).lean(),
    TemplatePackModel.find().select("slug name description version manifest").limit(50).lean(),
    PluginPackModel.find().select("slug name description version manifest").limit(50).lean(),
  ]);
  const previousDeck = isRecord(ctx.project.meta.deckArtifact) ? ctx.project.meta.deckArtifact : null;
  return {
    project: ctx.project,
    preferences: preferences ?? null,
    branding: branding ?? null,
    installedPacks: installedPacks ?? [],
    templatePacks: templatePacks ?? [],
    pluginPacks: pluginPacks ?? [],
    previousDeckVersion: isRecord(previousDeck?.version) ? previousDeck.version : null,
  };
}

async function fileExtractionAgent(ctx: RunContext): Promise<FileExtractionArtifact> {
  const fileId = typeof ctx.input.fileId === "string" ? ctx.input.fileId : undefined;
  const query: Record<string, unknown> = { workspaceId: ctx.job.workspaceId };
  if (fileId) query._id = fileId;
  else query.$or = [{ projectId: ctx.job.projectId }, { projectId: null }];
  const files = await FileModel.find(query).sort({ createdAt: -1 }).limit(fileId ? 1 : 5).lean();
  const fileSummaries = files.map((file) => ({
    id: String(file._id),
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    text: readInlineText(file.storageUrl),
  }));
  const joined = fileSummaries.map((file) => `# ${file.filename}\n${file.text}`).join("\n\n").slice(0, 14_000);
  const fallback: FileExtractionArtifact = {
    fileId,
    files: fileSummaries.map(({ id, filename, mimeType, sizeBytes }) => ({ id, filename, mimeType, sizeBytes })),
    summary: joined ? compactText(joined, 800) : "No readable inline file text was available.",
    keyFacts: extractFacts(joined).slice(0, 8),
    suggestedSlides: [],
    importantSections: [],
  };
  if (!joined) return fallback;
  const schema = fileExtractionSchema();
  return callJsonAgent(
    ctx,
    "file_extractor",
    jsonPrompt("File Extraction Agent", { files: fileSummaries }, "Summarize uploaded files into JSON: summary, keyFacts, suggestedSlides, importantSections."),
    schema,
    fallback,
    { temperature: 0.2, maxTokens: 1600 },
  );
}

async function researchAgent(
  ctx: RunContext,
  brief: DeckBrief,
  files: FileExtractionArtifact | null,
): Promise<ResearchArtifact> {
  const mode = normalizeResearchMode(ctx.input.researchMode);
  if (mode === "off" || mode === "file_only") {
    return {
      researchId: `rsch_skipped_${ctx.job.id.slice(-6)}`,
      jobId: ctx.job.id,
      status: "skipped",
      queryPlan: [],
      summary: `Live web research skipped because researchMode is ${mode}.`,
      facts: [],
      sources: [],
      warnings: [],
    };
  }
  return runLiveResearch({
    jobId: ctx.job.id,
    prompt: String(ctx.input.prompt ?? ctx.input.userPrompt ?? ctx.project.description ?? ctx.project.title),
    deckType: brief.deckType,
    audience: brief.audience,
    slideCount: brief.slideCount,
    fileSummary: files?.summary ?? null,
    maxQueries: 3,
    maxSourcesPerQuery: 4,
  });
}

async function outlineAgent(
  ctx: RunContext,
  brief: DeckBrief,
  context: ContextArtifact,
  files: FileExtractionArtifact | null,
  research: ResearchArtifact | null,
): Promise<OutlineArtifact> {
  const fallback = buildFallbackOutline(ctx, brief);
  const prompt = jsonPrompt(
    "Outline Agent",
    { brief, project: ctx.project, context: summarizeContext(context), files, research },
    "Return JSON with deckTitle, requiresApproval, and slides. Each slide needs slideNumber, slideType, title, purpose.",
  );
  return callJsonAgent(ctx, "outliner", prompt, outlineArtifactSchema, fallback, { temperature: 0.35, maxTokens: 1800 });
}

async function contentAgent(
  ctx: RunContext,
  brief: DeckBrief,
  outline: OutlineArtifact,
  context: ContextArtifact,
  files: FileExtractionArtifact | null,
  research: ResearchArtifact | null,
): Promise<ContentArtifact> {
  const fallback: ContentArtifact = {
    slides: outline.slides.map((slide) => ({
      slideNumber: slide.slideNumber,
      title: slide.title,
      subtitle: slide.purpose,
      bullets: fallbackBulletsForType(slide.slideType, ctx),
      speakerNotes: slide.purpose ?? `Explain ${slide.title}.`,
      visualSuggestion: visualSuggestionForType(slide.slideType),
    })),
  };
  const refinementPlan = designRefinementPlan(ctx);
  const prompt = jsonPrompt(
    "Content Agent",
    { brief, outline, context: summarizeContext(context), files, research, refinementPlan },
    "Return JSON with slides. Each slide has slideNumber, title, optional subtitle, bullets, speakerNotes, visualSuggestion. Do not include HTML. If this is a design refinement, preserve the existing story/content unless the user explicitly asks for copy changes. If you include numbers, statistics, market size, competitor claims, recent facts, policy facts, or financial/business facts, they must come from the ResearchArtifact or uploaded files. If no source exists, remove the claim or mark it as an assumption.",
  );
  return callJsonAgent(ctx, "content_writer", prompt, contentArtifactSchema, fallback, { temperature: 0.45, maxTokens: 3000 });
}

async function layoutAgent(ctx: RunContext, content: ContentArtifact): Promise<LayoutArtifact> {
  const refinementPlan = designRefinementPlan(ctx);
  const fallback: LayoutArtifact = {
    layouts: content.slides.map((slide, index) => ({
      slideNumber: slide.slideNumber,
      layoutId: refinementPlan ? alternateLayoutId(selectLayoutId({ title: slide.title, bullets: slide.bullets }, index), index) : selectLayoutId({ title: slide.title, bullets: slide.bullets }, index),
      reason: refinementPlan ? "Selected alternate layout for design refinement." : "Selected from the controlled YDeck layout library.",
    })),
  };
  const prompt = jsonPrompt(
    "Layout Agent",
    {
      availableLayouts: [
        "title_hero",
        "problem_cards",
        "solution_split",
        "comparison_split",
        "metric_focus",
        "timeline_process",
        "card_grid",
        "quote_statement",
        "closing_cta",
      ],
      content,
      refinementPlan,
    },
    "Return JSON with layouts array. Each item has slideNumber, layoutId, reason. Use only available layouts. If refinementPlan exists, choose visibly different layouts from the previous/default direction while preserving the slide meaning.",
  );
  return callJsonAgent(ctx, "layout_selector", prompt, layoutArtifactSchema, fallback, { temperature: 0.15, maxTokens: 1400 });
}

async function htmlDesignerAgent(
  ctx: RunContext,
  brief: DeckBrief,
  content: ContentArtifact,
  layout: LayoutArtifact,
  imageAssets: ImageAssetArtifact,
): Promise<CloudDeckArtifact> {
  const layoutBySlide = new Map(layout.layouts.map((item) => [item.slideNumber, item.layoutId]));
  const baseDeck = {
    deckTitle: String(ctx.input.title ?? ctx.project.title),
    deckType: brief.deckType,
    designStyle: String(ctx.input.designStyle ?? "modern"),
    language: brief.language,
    summary: `Generated by YDeck cloud production flow for ${brief.audience}.`,
  };
  const plannedSlides: CloudDeckSlide[] = content.slides.map((slide, index) => ({
    slideNumber: slide.slideNumber,
    slideType: layoutBySlide.get(slide.slideNumber) ?? "content",
    title: slide.title,
    subtitle: slide.subtitle,
    bullets: slide.bullets,
    speakerNotes: slide.speakerNotes,
    layoutId: layoutBySlide.get(slide.slideNumber) ?? selectLayoutId(slide, index),
    visual: imageAssetForSlide(imageAssets, slide.slideNumber)
      ? {
          imageAsset: imageAssetForSlide(imageAssets, slide.slideNumber),
        }
      : undefined,
  }));

  const designedSlides: CloudDeckSlide[] = [];
  for (const plannedSlide of plannedSlides) {
    const slide = await designSingleSlideWithLlm(ctx, brief, baseDeck, plannedSlide, plannedSlides, imageAssets);
    const normalized = designCloudDeckArtifact(
      { ...baseDeck, slides: [slide] },
      { targetScore: 85, maxAttempts: 2, forceDesign: false, slideCount: plannedSlides.length },
    ).deck.slides[0] ?? slide;
    designedSlides.push(normalized);
    emitSlidePreviews(ctx.job, { ...baseDeck, slides: [normalized] });
    await saveStageArtifacts(ctx, {
      designProgress: {
        designedSlides: designedSlides.length,
        slideCount: plannedSlides.length,
        latestSlideNumber: normalized.slideNumber,
        latestSlideTitle: normalized.title,
      },
    });
  }

  return designCloudDeckArtifact(
    {
      ...baseDeck,
      slides: designedSlides,
    },
    { targetScore: 85, maxAttempts: 2, forceDesign: false },
  ).deck;
}

async function designSingleSlideWithLlm(
  ctx: RunContext,
  brief: DeckBrief,
  deck: Omit<CloudDeckArtifact, "slides">,
  slide: CloudDeckSlide,
  allSlides: CloudDeckSlide[],
  imageAssets: ImageAssetArtifact,
): Promise<CloudDeckSlide> {
  const fallback = designCloudDeckArtifact(
    { ...deck, slides: [slide] },
    { targetScore: 85, maxAttempts: 2, forceDesign: true, slideCount: allSlides.length },
  ).deck.slides[0] ?? slide;
  const prompt = jsonPrompt(
    `HTML Designer Agent - Slide ${slide.slideNumber}`,
    {
      brief,
      deck: {
        deckTitle: deck.deckTitle,
        deckType: deck.deckType,
        designStyle: deck.designStyle,
        language: deck.language,
        slideCount: allSlides.length,
      },
      currentSlide: slide,
      surroundingSlides: allSlides.map((item) => ({
        slideNumber: item.slideNumber,
        title: item.title,
        layoutId: item.layoutId,
      })),
      availableImageAsset: imageAssetForSlide(imageAssets, slide.slideNumber ?? 0) ?? null,
      rules: htmlDesignRules(),
    },
    "Return JSON for exactly one slide, not a full deck. Include slideNumber, slideType, title, subtitle, bullets, speakerNotes, layoutId, visual, and html. The html must be a complete self-contained <section class=\"ydeck-slide\"> at 1920x1080. Design this slide professionally according to its layout; use inline SVG icons/charts/timelines where useful; use only the provided stored image asset if present.",
  );
  return callJsonAgent(ctx, "html_designer", prompt, slideForAgentSchema(fallback), fallback, {
    temperature: 0.5,
    maxTokens: Math.min(env.llmMaxTokens, 5000),
  });
}

async function imageAssetAgent(ctx: RunContext, content: ContentArtifact): Promise<ImageAssetArtifact> {
  const assets: ImageAsset[] = [];
  const skipped: ImageAssetArtifact["skipped"] = [];
  const needs = content.slides
    .map((slide) => ({
      slideNumber: slide.slideNumber,
      query: imageQueryForSlide(slide),
    }))
    .filter((item) => Boolean(item.query))
    .slice(0, 4);

  for (const need of needs) {
    try {
      const candidates = await searchImages({
        workspaceId: String(ctx.job.workspaceId),
        projectId: String(ctx.job.projectId),
        deckId: String(ctx.job.projectId),
        query: need.query,
        orientation: "landscape",
        style: String(ctx.input.designStyle ?? "modern professional"),
        count: 4,
        sources: ["pexels"],
      });
      emitCloudEvent(ctx.job, "deck.asset", {
        stage: "image_candidates",
        type: "image_candidates",
        slideNumber: need.slideNumber,
        query: need.query,
        layout: "grid_3x4",
        carousel: true,
        candidates,
      });
      const candidate = candidates[0];
      if (!candidate) {
        skipped.push({ slideNumber: need.slideNumber, reason: "No Pexels candidates found." });
        continue;
      }
      const asset = await selectImage({
        workspaceId: String(ctx.job.workspaceId),
        projectId: String(ctx.job.projectId),
        deckId: String(ctx.job.projectId),
        assetCandidateId: candidate.assetCandidateId,
        slideNumber: need.slideNumber,
        reason: "Selected by cloud image asset agent for slide visual intent.",
      });
      assets.push(asset);
      emitCloudEvent(ctx.job, "deck.asset", {
        stage: "image_selected",
        type: "image",
        slideNumber: need.slideNumber,
        query: need.query,
        imageAsset: asset,
      });
    } catch (err) {
      skipped.push({ slideNumber: need.slideNumber, reason: (err as Error).message });
    }
  }

  return { assets, skipped };
}

async function visionQaAgent(ctx: RunContext, deck: CloudDeckArtifact): Promise<QaArtifact> {
  const deterministic = deterministicQa(deck);
  const prompt = jsonPrompt(
    "Vision QA Agent",
    {
      note: "Browser screenshot service is not attached in this server process yet. Review the HTML and deterministic QA signals as a visual QA proxy.",
      deck: stripHeavyHtml(deck),
      deterministic,
    },
    "Return JSON with averageScore, acceptedSlides, repairedSlides, issues. Issues need slideNumber, severity, problem, repairInstruction.",
  );
  return callJsonAgent(ctx, "vision_qa", prompt, qaArtifactSchema, deterministic, { temperature: 0.15, maxTokens: 1800 });
}

async function repairAgent(ctx: RunContext, deck: CloudDeckArtifact, qa: QaArtifact): Promise<CloudDeckArtifact> {
  const repaired = designCloudDeckArtifact(compactDeckForRepair(deck, qa), {
    targetScore: 88,
    maxAttempts: 3,
    forceDesign: true,
  }).deck;
  const schema = deckArtifactForAgentSchema();
  const prompt = jsonPrompt(
    "Repair Agent",
    { qa, deck: stripHeavyHtml(repaired), rules: htmlDesignRules() },
    "Return repaired JSON deck artifact. Preserve slide count and improve slides listed in QA. Include safe 1920x1080 HTML sections.",
  );
  return callJsonAgent(ctx, "repair", prompt, schema, repaired, {
    temperature: 0.25,
    maxTokens: Math.min(env.llmMaxTokens, 8000),
  });
}

async function exportAgent(_ctx: RunContext, deck: CloudDeckArtifact): Promise<ExportArtifact> {
  return exportArtifactSchema.parse({
    formats: ["html"],
    files: [
      {
        format: "html",
        sizeBytes: Buffer.byteLength(JSON.stringify(stripHeavyHtml(deck)), "utf8"),
      },
    ],
  });
}

async function callJsonAgent<T>(
  ctx: RunContext,
  agent: CloudAgentName,
  prompt: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } },
  fallback: T,
  options: { temperature: number; maxTokens: number },
): Promise<T> {
  logAgentFlow(ctx.job.id, `${agent}.send`, { promptChars: prompt.length, prompt });
  await auditAgent(ctx, agent, "started", { promptChars: prompt.length });
  try {
    const text = await ctx.provider.generate(prompt, options);
    logAgentFlow(ctx.job.id, `${agent}.receive`, { chars: text.length, text });
    const parsedJson = extractJson(text);
    const parsed = schema.safeParse(parsedJson);
    if (parsed.success) {
      await auditAgent(ctx, agent, "completed", { responseChars: text.length });
      return parsed.data;
    }
    logger.warn({ agent, jobId: ctx.job.id, error: parsed.error }, "cloud_production_agent.invalid_json");
    await auditAgent(ctx, agent, "errored", { reason: "invalid_json", detail: String(parsed.error) });
  } catch (err) {
    logger.warn({ err, agent, jobId: ctx.job.id }, "cloud_production_agent.failed");
    await auditAgent(ctx, agent, "errored", { reason: "provider_error", detail: (err as Error).message });
  }
  logAgentFlow(ctx.job.id, `${agent}.fallback`, fallback);
  return fallback;
}

async function setProductionState(
  job: DeckJobDoc,
  status: CloudProductionStatus,
  progress: number,
): Promise<void> {
  const dbStatus = dbStatusForProduction(status);
  const existing = await DeckJobModel.findById(job.id).select("resultMeta").lean();
  const resultMeta = isRecord(existing?.resultMeta) ? existing.resultMeta : {};
  await DeckJobModel.findByIdAndUpdate(job.id, {
    $set: {
      status: dbStatus,
      progress,
      startedAt: job.startedAt ?? new Date(),
      resultMeta: {
        ...resultMeta,
        productionStage: status,
      },
    },
  });
  job.status = dbStatus;
  job.progress = progress;
  job.startedAt = job.startedAt ?? new Date();
  jobBus.emitJob({
    jobId: job.id,
    status: dbStatus,
    progress,
    channel: "deck.status",
    payload: { productionStage: status },
    at: new Date().toISOString(),
  });
}

function dbStatusForProduction(status: CloudProductionStatus): "queued" | "parsing" | "llm" | "rendering" | "exporting" | "done" | "error" | "canceled" {
  if (status === "queued") return "queued";
  if (status === "file_processing" || status === "context_loading") return "parsing";
  if (status === "rendering" || status === "qa_checking" || status === "repairing") return "rendering";
  if (status === "exporting" || status === "delivering") return "exporting";
  if (status === "done") return "done";
  if (status === "error") return "error";
  if (status === "canceled") return "canceled";
  return "llm";
}

async function saveStageArtifacts(ctx: RunContext, patch: Record<string, unknown>): Promise<void> {
  ctx.artifacts = { ...ctx.artifacts, ...patch };
  const existing = await DeckJobModel.findById(ctx.job.id).select("resultMeta").lean();
  const resultMeta = isRecord(existing?.resultMeta) ? existing.resultMeta : {};
  await DeckJobModel.findByIdAndUpdate(ctx.job.id, {
    $set: {
      resultMeta: {
        ...resultMeta,
        productionFlow: {
          architecture: "cloud_production_multi_agent",
          artifacts: sanitizeArtifacts(ctx.artifacts),
        },
      },
    },
  });
}

function emitSlidePreviews(job: DeckJobDoc, deck: CloudDeckArtifact): void {
  for (const slide of deck.slides) {
    jobBus.emitJob({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      channel: "slide.preview",
      payload: {
        slideNumber: slide.slideNumber,
        slideTitle: slide.title,
        layoutId: slide.layoutId ?? "html_designed",
        designId: slide.preview?.designId ?? `ydeck.cloud:${deck.designStyle}:${slide.layoutId ?? "html_designed"}`,
        source: "cloud_production_html_designer",
        status: "rendered",
        html: slide.preview?.html ?? slide.previewHtml ?? slide.html,
      },
      at: new Date().toISOString(),
    });
  }
}

function buildFallbackBrief(ctx: RunContext): DeckBrief {
  const prompt = String(ctx.input.prompt ?? ctx.input.userPrompt ?? ctx.project.description ?? ctx.project.title);
  const deckType = String(ctx.input.deckType ?? "general");
  const slideCount = clampInt(Number(ctx.input.slideCount ?? ctx.input.slides ?? 6), 1, 100);
  return deckBriefSchema.parse({
    intent: ctx.job.type === "refine" ? "edit_deck" : "create_deck",
    deckType,
    audience: audienceForDeckType(deckType),
    slideCount,
    language: String(ctx.input.language ?? "en"),
    needsResearch: shouldResearch({
      researchMode: ctx.input.researchMode,
      classifierNeedsResearch: /\b(research|market|competitor|latest|recent|sources|statistics|data)\b/i.test(prompt),
      prompt,
    }),
    hasFiles: typeof ctx.input.fileId === "string" && ctx.input.fileId.length > 0,
    requiresOutlineApproval: ctx.input.generationMode === "outline_first",
  });
}

function buildFallbackOutline(ctx: RunContext, brief: DeckBrief): OutlineArtifact {
  const title = String(ctx.input.title ?? ctx.project.title);
  const types = ["title", "problem", "solution", "market", "process", "proof", "plan", "closing"];
  return outlineArtifactSchema.parse({
    deckTitle: title,
    requiresApproval: brief.requiresOutlineApproval,
    slides: Array.from({ length: brief.slideCount }, (_, index) => ({
      slideNumber: index + 1,
      slideType: types[index] ?? "content",
      title: fallbackTitle(index, title),
      purpose: fallbackPurpose(types[index] ?? "content"),
    })),
  });
}

function normalizeDeckBrief(ctx: RunContext, brief: DeckBrief): DeckBrief {
  const prompt = String(ctx.input.prompt ?? ctx.input.userPrompt ?? ctx.project.description ?? ctx.project.title);
  const hasExplicitCount = /\b(\d{1,2}|one|single)\s*[- ]?(slide|slides|page|pages)\b/i.test(prompt);
  const routeProvidedCount = ctx.input.slideCount !== undefined || ctx.input.slides !== undefined;
  if (!routeProvidedCount && !hasExplicitCount && brief.slideCount <= 1) {
    return {
      ...brief,
      slideCount: 6,
    };
  }
  return brief;
}

function fallbackTitle(index: number, deckTitle: string): string {
  const titles = [
    deckTitle,
    "Why This Matters",
    "The Opportunity",
    "The Solution",
    "How It Works",
    "Proof And Quality",
    "Plan Forward",
    "Next Step",
  ];
  return titles[index] ?? `Key Point ${index + 1}`;
}

function fallbackPurpose(type: string): string {
  if (type === "title") return "Introduce the topic and positioning.";
  if (type === "problem") return "Explain the core pain or context.";
  if (type === "solution") return "Show the proposed answer.";
  if (type === "market") return "Frame the opportunity or audience need.";
  if (type === "process") return "Explain the workflow.";
  if (type === "proof") return "Show evidence and quality signals.";
  if (type === "closing") return "End with next action.";
  return "Develop one important supporting point.";
}

function fallbackBulletsForType(type: string, ctx: RunContext): string[] {
  const prompt = String(ctx.input.prompt ?? ctx.project.description ?? ctx.project.title);
  if (type.includes("problem")) return ["Current decks take too long to prepare", "Design quality is inconsistent", "Teams need fast editable previews"];
  if (type.includes("solution")) return ["Cloud agents plan the story", "HTML slides provide precise visual control", "QA and repair improve the result before delivery"];
  if (type.includes("process")) return ["Plan", "Write", "Design", "Review", "Repair", "Deliver"];
  if (type.includes("proof")) return ["Readable typography", "Controlled layouts", "Preview-ready artifacts"];
  return [compactText(prompt, 120), "Structured into a clear presentation story", "Ready for review and refinement"];
}

function visualSuggestionForType(type: string): string {
  if (type.includes("problem")) return "Three-card pain point grid";
  if (type.includes("solution")) return "Split solution diagram";
  if (type.includes("process")) return "Horizontal timeline";
  if (type.includes("proof")) return "Metric cards";
  if (type.includes("closing")) return "Bold closing CTA";
  return "Card-based editorial layout";
}

function imageQueryForSlide(slide: ContentArtifact["slides"][number]): string {
  const visual = `${slide.visualSuggestion ?? ""} ${slide.title}`.toLowerCase();
  const text = `${slide.title} ${slide.subtitle ?? ""} ${(slide.bullets ?? []).join(" ")}`;
  if (/\b(photo|image|teacher|classroom|student|office|team|customer|market|product|lifestyle|startup)\b/.test(visual)) {
    return compactText(text, 140);
  }
  if (/\btitle|problem|solution|market|customer\b/.test(visual)) {
    return compactText(text, 140);
  }
  return "";
}

function imageAssetForSlide(imageAssets: ImageAssetArtifact, slideNumber: number): ImageAsset | undefined {
  return imageAssets.assets.find((asset) => asset.slideNumber === slideNumber);
}

function selectLayoutId(slide: { title: string; bullets?: string[] }, index: number): string {
  const text = `${slide.title} ${(slide.bullets ?? []).join(" ")}`.toLowerCase();
  if (index === 0) return "title_hero";
  if (/\b(problem|pain|challenge)\b/.test(text)) return "problem_cards";
  if (/\b(solution|approach)\b/.test(text)) return "solution_split";
  if (/\bcompare|versus|before|after\b/.test(text)) return "comparison_split";
  if (/\bmetric|proof|quality|growth|revenue|score\b/.test(text)) return "metric_focus";
  if (/\bprocess|workflow|timeline|roadmap|steps\b/.test(text)) return "timeline_process";
  if (/\bnext|close|cta|contact\b/.test(text)) return "closing_cta";
  return "card_grid";
}

function alternateLayoutId(current: string, index: number): string {
  const alternates = ["image_split", "metric_focus", "timeline_process", "comparison_split", "problem_cards", "card_grid", "closing_cta"];
  const fallback = alternates[index % alternates.length];
  if (current === "title_hero") return index === 0 ? "image_split" : fallback;
  if (current === "card_grid") return "image_split";
  if (current === "metric_focus") return "comparison_split";
  if (current === "timeline_process") return "card_grid";
  if (current === "comparison_split") return "metric_focus";
  return fallback === current ? "image_split" : fallback;
}

function designRefinementPlan(ctx: RunContext): {
  instruction: string;
  summary: string;
  plannedChanges: string[];
  preserveContent: boolean;
} | null {
  const input = ctx.input;
  const messageIntent = isRecord(input.messageIntent) ? input.messageIntent : null;
  const instruction = String(input.editInstruction ?? input.prompt ?? input.userPrompt ?? "");
  const isDesign =
    messageIntent?.refinementKind === "design" ||
    /\b(different design|new design|try another design|try a different|redesign|change the look|visual style|make it modern|more modern|more visual|new style|different style|fresh design|better design)\b/i.test(instruction);
  if (ctx.job.type !== "refine" || !isDesign) return null;
  return {
    instruction,
    summary: "Trying a different visual direction while preserving the deck story.",
    preserveContent: !/\b(rewrite|change text|new content|different story|change copy)\b/i.test(instruction),
    plannedChanges: [
      "Understand the requested design change",
      "Keep the existing story and key claims unless text changes are requested",
      "Choose alternate layouts for each slide",
      "Refresh visual hierarchy, spacing, typography, and color rhythm",
      "Use icons, charts, timelines, and stored images where they improve clarity",
      "Regenerate slide previews one by one",
      "Run design QA and save a new version",
    ],
  };
}

function deterministicQa(deck: CloudDeckArtifact): QaArtifact {
  const issues: QaArtifact["issues"] = [];
  let scoreSum = 0;
  for (const slide of deck.slides) {
    let score = 100;
    const html = `${slide.html ?? ""} ${slide.previewHtml ?? ""}`;
    const textLength = [slide.title, slide.subtitle, slide.body, ...(slide.bullets ?? [])].filter(Boolean).join(" ").length;
    if (!/<section\b/i.test(slide.html ?? "")) {
      score -= 30;
      issues.push({ slideNumber: slide.slideNumber ?? 1, severity: "error", problem: "Missing slide section HTML.", repairInstruction: "Regenerate slide HTML." });
    }
    if (!/width:\s*1920px/i.test(html) || !/height:\s*1080px/i.test(html)) {
      score -= 15;
      issues.push({ slideNumber: slide.slideNumber ?? 1, severity: "warning", problem: "Slide canvas is not explicitly 1920x1080.", repairInstruction: "Use fixed export canvas dimensions." });
    }
    if (/<script|<iframe|https?:\/\//i.test(html)) {
      score -= 25;
      issues.push({ slideNumber: slide.slideNumber ?? 1, severity: "error", problem: "Unsafe or remote HTML detected.", repairInstruction: "Remove scripts, iframes, and remote URLs." });
    }
    if (textLength > 980) {
      score -= 12;
      issues.push({ slideNumber: slide.slideNumber ?? 1, severity: "warning", problem: "Slide is text-heavy.", repairInstruction: "Reduce text and use fewer cards." });
    }
    scoreSum += Math.max(0, score);
  }
  const averageScore = Math.round(scoreSum / Math.max(1, deck.slides.length));
  return qaArtifactSchema.parse({
    averageScore,
    acceptedSlides: Math.max(0, deck.slides.length - new Set(issues.map((issue) => issue.slideNumber)).size),
    repairedSlides: 0,
    issues,
  });
}

function compactDeckForRepair(deck: CloudDeckArtifact, qa: QaArtifact): CloudDeckArtifact {
  const issueSlides = new Set(qa.issues.map((issue) => issue.slideNumber));
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (!issueSlides.has(slide.slideNumber ?? 0)) return slide;
      return {
        ...slide,
        title: compactText(slide.title, 76),
        subtitle: slide.subtitle ? compactText(slide.subtitle, 130) : slide.subtitle,
        body: slide.body ? compactText(slide.body, 220) : slide.body,
        bullets: (slide.bullets ?? []).slice(0, 4).map((bullet) => compactText(bullet, 118)),
        html: undefined,
        previewHtml: undefined,
        preview: undefined,
      };
    }),
  };
}

function htmlDesignRules(): string[] {
  return [
    "Use a fixed 1920px by 1080px slide canvas.",
    "Return a single self-contained section per slide.",
    "Never use scripts, iframes, external URLs, remote fonts, or unsafe attributes.",
    "Use readable type: titles 44-92px, body at least 28px.",
    "Use one approved layout per slide and keep text concise.",
    "Design visually with spacing, hierarchy, cards, charts, timelines, or diagrams when helpful.",
    "Do not repeat the same title/subtitle/cards template across slides.",
    "Use inline SVG icons when a slide has concepts, benefits, risks, or steps.",
    "Use HTML/SVG charts for metric, market, growth, comparison, or trend slides.",
    "Use timeline/process visuals for sequence and roadmap slides.",
    "Use stored image assets from imageAssets when available; never use direct Pexels or remote URLs.",
  ];
}

function summarizeContext(context: ContextArtifact) {
  return {
    project: context.project,
    preferences: context.preferences,
    branding: context.branding,
    installedPackCount: context.installedPacks.length,
    templatePackCount: context.templatePacks.length,
    pluginPackCount: context.pluginPacks.length,
    previousDeckVersion: context.previousDeckVersion,
  };
}

function stripHeavyHtml(deck: CloudDeckArtifact): Record<string, unknown> {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      html: summarizeHtml(slide.html),
      previewHtml: summarizeHtml(slide.previewHtml),
      preview: slide.preview ? { ...slide.preview, html: summarizeHtml(slide.preview.html) } : undefined,
    })),
  };
}

function sanitizeArtifacts(artifacts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(artifacts)) {
    if (key === "design" && isRecord(value) && isRecord(value.deck)) out[key] = { ...value, deck: stripHeavyHtml(value.deck as CloudDeckArtifact) };
    else out[key] = value;
  }
  return out;
}

function summarizeHtml(value?: string): string | undefined {
  if (!value) return undefined;
  return `[html chars=${value.length}] ${value.replace(/\s+/g, " ").slice(0, 220)}`;
}

function readInlineText(storageUrl?: string | null): string {
  if (!storageUrl?.startsWith("data:")) return "";
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(storageUrl);
  if (!match) return "";
  try {
    const buf = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
    return buf.toString("utf8").slice(0, 80_000);
  } catch {
    return "";
  }
}

function extractFacts(text: string): string[] {
  return text
    .split(/[\n.]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 24)
    .slice(0, 10);
}

function fileExtractionSchema() {
  return {
    safeParse(value: unknown): { success: true; data: FileExtractionArtifact } | { success: false; error: unknown } {
      if (!isRecord(value)) return { success: false as const, error: "not object" };
      return {
        success: true as const,
        data: {
          files: [],
          summary: String(value.summary ?? ""),
          keyFacts: toStringArray(value.keyFacts),
          suggestedSlides: toStringArray(value.suggestedSlides),
          importantSections: toStringArray(value.importantSections),
        },
      };
    },
  };
}

function researchEventPayload(research: ResearchArtifact): Record<string, unknown> {
  return {
    researchId: research.researchId,
    status: research.status,
    summary: research.summary,
    sourceCount: research.sources.filter((source) => source.used).length || research.sources.length,
    factsCount: research.facts.length,
    queryPlan: research.queryPlan,
    sources: research.sources.map((source) => ({
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      used: source.used,
    })),
    warnings: research.warnings,
  };
}

function deckArtifactForAgentSchema() {
  return {
    safeParse(value: unknown) {
      if (!isRecord(value) || !Array.isArray(value.slides)) return { success: false as const, error: "invalid deck" };
      const slides = value.slides
        .filter(isRecord)
        .map((slide, index): CloudDeckSlide => ({
          slideNumber: Number(slide.slideNumber ?? index + 1),
          slideType: typeof slide.slideType === "string" ? slide.slideType : undefined,
          title: String(slide.title ?? `Slide ${index + 1}`).slice(0, 240),
          subtitle: typeof slide.subtitle === "string" ? slide.subtitle.slice(0, 500) : undefined,
          bullets: toStringArray(slide.bullets).slice(0, 8),
          body: typeof slide.body === "string" ? slide.body.slice(0, 2000) : undefined,
          speakerNotes: typeof slide.speakerNotes === "string" ? slide.speakerNotes.slice(0, 2000) : undefined,
          layoutId: typeof slide.layoutId === "string" ? slide.layoutId.slice(0, 120) : undefined,
          visual: isRecord(slide.visual) ? slide.visual : undefined,
          html: typeof slide.html === "string" ? slide.html.slice(0, 30_000) : undefined,
          previewHtml: typeof slide.previewHtml === "string" ? slide.previewHtml.slice(0, 40_000) : undefined,
        }));
      if (!slides.length) return { success: false as const, error: "no slides" };
      return {
        success: true as const,
        data: {
          deckTitle: String(value.deckTitle ?? "Untitled YDeck").slice(0, 255),
          deckType: String(value.deckType ?? "general").slice(0, 80),
          designStyle: String(value.designStyle ?? "modern").slice(0, 120),
          language: String(value.language ?? "en").slice(0, 20),
          summary: typeof value.summary === "string" ? value.summary.slice(0, 2000) : undefined,
          slides,
        },
      };
    },
  };
}

function slideForAgentSchema(fallback: CloudDeckSlide) {
  return {
    safeParse(value: unknown): { success: true; data: CloudDeckSlide } | { success: false; error: unknown } {
      if (!isRecord(value)) return { success: false, error: "invalid slide" };
      const slide: CloudDeckSlide = {
        slideNumber: Number(value.slideNumber ?? fallback.slideNumber ?? 1),
        slideType: typeof value.slideType === "string" ? value.slideType.slice(0, 80) : fallback.slideType,
        title: String(value.title ?? fallback.title ?? "Untitled slide").slice(0, 240),
        subtitle: typeof value.subtitle === "string" ? value.subtitle.slice(0, 500) : fallback.subtitle,
        bullets: Array.isArray(value.bullets) ? value.bullets.map(String).slice(0, 8) : fallback.bullets,
        body: typeof value.body === "string" ? value.body.slice(0, 2000) : fallback.body,
        speakerNotes: typeof value.speakerNotes === "string" ? value.speakerNotes.slice(0, 2000) : fallback.speakerNotes,
        layoutId: typeof value.layoutId === "string" ? value.layoutId.slice(0, 120) : fallback.layoutId,
        visual: isRecord(value.visual) ? { ...(isRecord(fallback.visual) ? fallback.visual : {}), ...value.visual } : fallback.visual,
        html: typeof value.html === "string" ? value.html.slice(0, 30_000) : fallback.html,
        previewHtml: typeof value.previewHtml === "string" ? value.previewHtml.slice(0, 40_000) : fallback.previewHtml,
        preview: isRecord(value.preview) ? (value.preview as CloudDeckSlide["preview"]) : fallback.preview,
      };
      if (!slide.html && !slide.previewHtml) return { success: false, error: "slide missing html" };
      return { success: true, data: slide };
    },
  };
}

function jsonPrompt(agent: string, input: unknown, instruction: string): string {
  return [
    `You are the YDeck Cloud ${agent}.`,
    "Return only valid JSON. Do not wrap in markdown. Do not include commentary.",
    instruction,
    "",
    "Input:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  const raw = fenced ?? trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("No JSON object found in agent response.");
  }
}

async function auditAgent(ctx: RunContext, agent: CloudAgentName, phase: string, meta: Record<string, unknown>): Promise<void> {
  await AuditLogModel.create({
    userId: null,
    workspaceId: ctx.job.workspaceId,
    action: `cloud.agent.${phase}`,
    targetType: "deck_job",
    targetId: ctx.job.id,
    meta: { agent, ...meta },
  }).catch((err) => logger.warn({ err, agent }, "cloud.agent.audit_failed"));
}

function logAgentFlow(jobId: string, label: string, data: unknown): void {
  if (!env.agentFlowLogOutput) return;
  // eslint-disable-next-line no-console
  console.log(`[ydeck-production:${jobId.slice(-6)}] ${label}`, JSON.stringify(redactAndTruncate(data), null, 2));
}

function redactAndTruncate(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}... [truncated]` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactAndTruncate(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|authorization|password|token|secret/i.test(key)) out[key] = "[redacted]";
    else out[key] = depth > 4 ? "[nested]" : redactAndTruncate(item, depth + 1);
  }
  return out;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function audienceForDeckType(deckType: string): string {
  const type = deckType.toLowerCase();
  if (type.includes("investor")) return "investors";
  if (type.includes("education") || type.includes("lesson")) return "teachers and learners";
  if (type.includes("sales")) return "customers";
  if (type.includes("government")) return "public sector stakeholders";
  return "presentation audience";
}

function compactText(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1).trim()}...`;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
