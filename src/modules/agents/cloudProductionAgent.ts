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
} from '../../models';
import { env } from '../../config/env';
import { randomToken, sha256Hex } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { jobBus } from '../decks/jobs.events';
import {
  searchImages,
  selectImage,
  type ImageAsset,
} from '../assets/imageAsset.service';
import { renderDeckScreenshots } from '../render/render.service';
import { renderDeckArtifactToPptx } from '../render/htmlPptx';
import {
  selectDesignSystems,
  type DesignSystemContext,
} from '../designSystems/designSystemCatalog.service';
import {
  selectDesignTemplates,
  type DesignTemplateContext,
} from '../designTemplates/designTemplateCatalog.service';
import {
  normalizeResearchMode,
  runLiveResearch,
  shouldResearch,
  type ResearchArtifact,
} from '../research/researchAgent.service';
import {
  effectiveCloudConfig,
  getCloudLlmProvider,
  type CloudLlmProvider,
} from './cloudLlm';
import {
  cloudDesignSummary,
  designCloudDeckArtifact,
  finalizeLlmDeck,
  saveCloudDeckArtifact,
  wrapLlmDesignedSlide,
  type CloudDeckArtifact,
  type CloudDeckSlide,
} from './tools/cloudDeck.tools';
import { reviewDeckWithVision } from '../visionQa/visionQa.service';
import type {
  CloudAgentName,
  CloudEventChannel,
  CloudProductionStatus,
} from './cloudWorkflow.contract';
import {
  contentSlideSchema,
  deckBriefSchema,
  exportArtifactSchema,
  layoutDecisionSchema,
  layoutArtifactSchema,
  outlineArtifactSchema,
  planArtifactSchema,
  qaArtifactSchema,
} from './cloudWorkflow.contract';
import { emitCloudEvent, selectCloudWorkflow } from './cloudOrchestrator';

type DeckBrief = typeof deckBriefSchema._output;
type PlanArtifact = typeof planArtifactSchema._output;
type OutlineArtifact = typeof outlineArtifactSchema._output;
type ContentSlide = typeof contentSlideSchema._output;
type ContentArtifact = { slides: ContentSlide[] };
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
  currentStage?: CloudProductionStatus;
  toolUsage: ToolUsageTracker;
}

interface ToolUsageRecord {
  stage: string;
  agent?: CloudAgentName | string;
  name: string;
  kind: 'llm' | 'db' | 'external' | 'deterministic' | 'storage' | 'export';
  ok: boolean;
  at: string;
}

interface ToolUsageTracker {
  records: ToolUsageRecord[];
}

const activeRunContexts = new Map<string, RunContext>();

interface ContextArtifact {
  project: ProjectSnapshot;
  preferences: unknown;
  branding: unknown;
  installedPacks: unknown[];
  templatePacks: unknown[];
  designTemplates: DesignTemplateContext[];
  pluginPacks: unknown[];
  designSystems: DesignSystemContext[];
  previousDeckVersion: unknown;
}

interface FileExtractionArtifact {
  fileId?: string;
  files: Array<{
    id: string;
    filename: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;
  summary: string;
  keyFacts: string[];
  suggestedSlides: string[];
  importantSections: string[];
}

interface DesignArtifact {
  deck: CloudDeckArtifact;
  report: ReturnType<typeof designCloudDeckArtifact>['report'];
}

interface ImageAssetArtifact {
  assets: ImageAsset[];
  skipped: Array<{ slideNumber: number; reason: string }>;
}

interface TemplateLayoutOption {
  id: string;
  name?: string | null;
  role?: string | null;
  description?: string | null;
}

interface TemplateFlowPlan {
  templateId: string;
  templateName?: string | null;
  scenario?: string | null;
  flowId?: string | null;
  flowName?: string | null;
  reason: string;
  allowedLayoutIds: string[];
  allowedLayouts: TemplateLayoutOption[];
  allLayouts: TemplateLayoutOption[];
}

interface SkillQualityGate {
  skill: string;
  status: 'active' | 'available' | 'deferred';
  purpose: string;
  appliesTo: string[];
  frontendMessage: string;
}

interface SkillQualityPlan {
  source: 'skills_quality_router';
  summary: string;
  gates: SkillQualityGate[];
  promptDirectives: string[];
  qaDirectives: string[];
  exportDirectives: string[];
}

export async function runCloudProductionDeckJob(
  job: DeckJobDoc
): Promise<void> {
  const projectDoc = await DeckProjectModel.findById(job.projectId).lean();
  if (!projectDoc) throw new Error('Project not found for deck job.');

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
    toolUsage: { records: [] },
  };
  activeRunContexts.set(job.id, ctx);

  await setProductionState(job, 'planning', 8);
  const brief = await classifierAgent(ctx);
  ctx.artifacts.deckBrief = brief;
  const workflow = selectCloudWorkflow({
    intent: brief.intent === 'edit_deck' ? 'edit_deck' : brief.intent,
    hasFiles: brief.hasFiles,
    needsResearch: brief.needsResearch,
  });
  ctx.artifacts.workflow = workflow;

  const plan = await plannerAgent(ctx, brief);
  await saveStageArtifacts(ctx, { deckBrief: brief, plan, workflow });

  await setProductionState(job, 'context_loading', 15);
  const context = await contextAgent(ctx);
  ctx.artifacts.context = context;
  emitProductionEvent(ctx, 'deck.context', summarizeContext(context));
  await saveStageArtifacts(ctx, { context });

  const skillQualityPlan = buildSkillQualityPlan(ctx, brief, context);
  ctx.artifacts.skillQualityPlan = skillQualityPlan;
  for (const gate of skillQualityPlan.gates) {
    recordToolUsage(
      ctx,
      `skill_gate:${gate.skill}`,
      gate.skill === 'pptx-html-fidelity-audit' ? 'export' : 'deterministic',
      'context'
    );
  }
  emitProductionEvent(ctx, 'deck.skill', skillQualityPlan);
  await saveStageArtifacts(ctx, { skillQualityPlan });

  let files: FileExtractionArtifact | null = null;
  if (brief.hasFiles) {
    await setProductionState(job, 'file_processing', 22);
    files = await fileExtractionAgent(ctx);
    ctx.artifacts.files = files;
    emitProductionEvent(ctx, 'deck.file', files);
    await saveStageArtifacts(ctx, { files });
  }

  let research: ResearchArtifact | null = null;
  if (
    shouldResearch({
      researchMode: ctx.input.researchMode,
      classifierNeedsResearch: brief.needsResearch,
      prompt: String(
        ctx.input.prompt ??
          ctx.input.userPrompt ??
          project.description ??
          project.title
      ),
    })
  ) {
    await setProductionState(job, 'researching', 28);
    research = await researchAgent(ctx, brief, files);
    ctx.artifacts.research = research;
    emitProductionEvent(ctx, 'deck.research', researchEventPayload(research));
    await saveStageArtifacts(ctx, { research });
  }

  await setProductionState(job, 'outlining', 34);
  const outline = await outlineAgent(ctx, brief, context, files, research);
  ctx.artifacts.outline = outline;
  emitProductionEvent(ctx, 'deck.outline', {
    ...outline,
    status: 'approved_by_cloud_orchestrator',
  });
  await saveStageArtifacts(ctx, { outline });

  await setProductionState(job, 'content_writing', 46);
  const content = await contentAgent(
    ctx,
    brief,
    outline,
    context,
    files,
    research
  );
  ctx.artifacts.content = content;
  emitProductionEvent(ctx, 'deck.content', {
    stage: 'content_writing',
    ...content,
  });
  await saveStageArtifacts(ctx, { content });

  await setProductionState(job, 'layouting', 58);
  const layout = await layoutAgent(ctx, content);
  ctx.artifacts.layout = layout;
  emitProductionEvent(ctx, 'deck.content', { stage: 'layouting', ...layout });
  await saveStageArtifacts(ctx, { layout });

  const imageAssets = await imageAssetAgent(ctx, content);
  ctx.artifacts.imageAssets = imageAssets;
  if (imageAssets.assets.length || imageAssets.skipped.length) {
    emitProductionEvent(ctx, 'deck.asset', imageAssets);
    await saveStageArtifacts(ctx, { imageAssets });
  }

  await setProductionState(job, 'designing', 68);
  const design = await htmlDesignerAgent(
    ctx,
    brief,
    content,
    layout,
    imageAssets
  );
  ctx.artifacts.design = { deck: design };
  await saveStageArtifacts(ctx, { design: { deck: stripHeavyHtml(design) } });

  await setProductionState(job, 'rendering', 78);
  emitSlidePreviews(ctx, design);

  await setProductionState(job, 'qa_checking', 84);
  const qa = await visionQaAgent(ctx, design);
  ctx.artifacts.qa = qa;
  emitProductionEvent(ctx, 'deck.qa', qa);
  await saveStageArtifacts(ctx, { qa });

  let finalDesign = design;
  if (
    qa.averageScore < 85 ||
    qa.issues.some((issue) => issue.severity === 'error')
  ) {
    await setProductionState(job, 'repairing', 88);
    finalDesign = await repairAgent(ctx, design, qa);
    ctx.artifacts.repair = {
      repaired: true,
      deck: stripHeavyHtml(finalDesign),
    };
    emitProductionEvent(ctx, 'deck.repair', {
      repaired: true,
      reason: 'QA score below target or blocking issue detected.',
      slideCount: finalDesign.slides.length,
    });
    emitSlidePreviews(ctx, finalDesign);
    await saveStageArtifacts(ctx, { repair: ctx.artifacts.repair });
  }

  const designedDeck = finalizeLlmDeck(finalDesign);
  const designed = {
    deck: designedDeck,
    report: designedDeck.slides.map((slide, index) => ({
      slideNumber: slide.slideNumber ?? index + 1,
      title: slide.title,
      layoutId: slide.layoutId ?? 'html_designed',
      attempts: 1,
      score: 100,
      accepted: true,
      problems: [],
      fixes: [],
    })),
  };
  recordToolUsage(ctx, 'save_deck_artifact', 'storage', 'exporter');
  recordToolUsage(ctx, 'create_deck_version', 'storage', 'exporter');
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
    'cloud_production_orchestrator',
    cloudDesignSummary(designed.report)
  );
  ctx.artifacts.finalDesign = { report: designed.report, saveResult };

  await setProductionState(job, 'exporting', 93);
  const exported = await exportAgent(ctx, designed.deck);
  ctx.artifacts.export = exported;
  emitProductionEvent(ctx, 'deck.export', exported);
  await saveStageArtifacts(ctx, {
    export: exported,
    finalDesign: { report: designed.report },
  });

  await setProductionState(job, 'delivering', 97);
  recordToolUsage(ctx, 'notify_user', 'deterministic', 'delivery');
  emitProductionEvent(ctx, 'deck.done', {
    delivery: 'web_dashboard',
    deckTitle: designed.deck.deckTitle,
    slideCount: designed.deck.slides.length,
  });

  const fresh = await DeckJobModel.findById(job.id).lean();
  const resultMeta = isRecord(fresh?.resultMeta) ? fresh.resultMeta : {};
  await DeckJobModel.findByIdAndUpdate(job.id, {
    $set: {
      status: 'done',
      progress: 100,
      finishedAt: new Date(),
      resultMeta: {
        ...resultMeta,
        cloudMode: {
          provider: provider.name,
          model: provider.model,
          mode: 'cloud',
          architecture: 'cloud_production_multi_agent',
        },
        productionFlow: {
          workflow: workflow.name,
          agents: workflow.agents,
          artifacts: ctx.artifacts,
          toolUsage: toolUsageSummary(ctx),
        },
      },
    },
  });
  job.status = 'done';
  job.progress = 100;
  jobBus.emitJob({
    jobId: job.id,
    status: 'done',
    progress: 100,
    channel: 'run.summary',
    payload: {
      provider: provider.name,
      model: provider.model,
      workflow: workflow.name,
      agents: workflow.agents,
      export: exported,
      toolUsage: toolUsageSummary(ctx),
    },
    at: new Date().toISOString(),
  });
  activeRunContexts.delete(job.id);
}

async function classifierAgent(ctx: RunContext): Promise<DeckBrief> {
  const prompt = jsonPrompt(
    'Request Classifier Agent',
    {
      project: ctx.project,
      input: ctx.input,
      jobType: ctx.job.type,
    },
    `Return JSON with intent, deckType, audience, slideCount, language, needsResearch, hasFiles, requiresOutlineApproval.
Use intent create_deck for generation and edit_deck for refinement.
Do not treat "a slide about X" as exactly one slide. Only use slideCount 1 when the user explicitly says "one slide", "single slide", or "1 slide". For broad topic prompts without a count, choose a useful mini-deck count such as 5-7.
If the user asks for history, culture, education, geography, biography, science, or other non-business topics, do not classify it as market, investor, competitor, or business research unless the user explicitly asks for market/business analysis.
Language must match the user's request text. English prompts like "I need a presentation about Chinese history" must use language "en", not "fr".`
  );
  const brief = await callJsonAgent(
    ctx,
    'request_classifier',
    prompt,
    deckBriefSchema,
    { temperature: 0.1, maxTokens: 700 }
  );
  return normalizeDeckBrief(ctx, brief);
}

async function plannerAgent(
  ctx: RunContext,
  brief: DeckBrief
): Promise<PlanArtifact> {
  const refinementPlan = designRefinementPlan(ctx);
  if (refinementPlan) {
    const plan: PlanArtifact = {
      type: 'deck.plan',
      source: 'planner_agent',
      summary: refinementPlan.summary,
      steps: refinementPlan.plannedChanges.map((label, index) => ({
        label,
        status: index === 0 ? 'running' : 'pending',
      })),
    };
    emitProductionEvent(ctx, 'deck.plan', {
      ...plan,
      intent: 'design_refinement',
      instruction: refinementPlan.instruction,
      plannedChanges: refinementPlan.plannedChanges,
      preserveContent: refinementPlan.preserveContent,
    });
    return plan;
  }
  const steps = [
    'Analyze request',
    brief.hasFiles ? 'Read uploaded files' : 'Load project context',
    brief.needsResearch
      ? 'Research supporting facts'
      : 'Skip external research',
    'Create outline',
    'Write slide content',
    'Choose layouts',
    'Design HTML slides',
    'Render previews',
    'Run design QA',
    'Repair weak slides',
    'Prepare export metadata',
    'Deliver final deck',
  ];
  const prompt = jsonPrompt(
    'Planner Agent',
    { brief, project: ctx.project, plannedSteps: steps },
    'Return JSON with type deck.plan, source planner_agent, summary, and steps array. Each step has label and status.'
  );
  const plan = await callJsonAgent(ctx, 'planner', prompt, planArtifactSchema, {
    temperature: 0.2,
    maxTokens: 1000,
  });
  emitProductionEvent(ctx, 'deck.plan', plan);
  return plan;
}

async function contextAgent(ctx: RunContext): Promise<ContextArtifact> {
  recordToolUsage(ctx, 'read_workspace_context', 'db', 'context');
  recordToolUsage(ctx, 'read_brand_kit', 'db', 'context');
  recordToolUsage(ctx, 'list_design_packs', 'db', 'context');
  recordToolUsage(ctx, 'read_design_templates', 'deterministic', 'context');
  recordToolUsage(ctx, 'read_design_systems', 'deterministic', 'context');
  recordToolUsage(ctx, 'read_deck_history', 'db', 'context');
  const [preferences, branding, installedPacks, templatePacks, pluginPacks] =
    await Promise.all([
      WorkspacePreferenceModel.findOne({
        workspaceId: ctx.job.workspaceId,
      }).lean(),
      WorkspaceBrandingModel.findOne({
        workspaceId: ctx.job.workspaceId,
      }).lean(),
      InstalledPackModel.find({
        workspaceId: ctx.job.workspaceId,
        enabled: true,
      })
        .limit(50)
        .lean(),
      TemplatePackModel.find()
        .select('slug name description version manifest')
        .limit(50)
        .lean(),
      PluginPackModel.find()
        .select('slug name description version manifest')
        .limit(50)
        .lean(),
    ]);
  const designSystems = await selectDesignSystems({
    designStyle: ctx.input.designStyle,
    deckType: ctx.input.deckType,
    templateId: ctx.project.templateId,
    branding,
    preferences,
  });
  const designTemplates = await selectDesignTemplates({
    templateId: ctx.input.templateId ?? ctx.project.templateId,
    deckType: ctx.input.deckType,
    designStyle: ctx.input.designStyle,
    prompt:
      ctx.input.prompt ?? ctx.input.userPrompt ?? ctx.project.description,
  });
  const previousDeck = isRecord(ctx.project.meta.deckArtifact)
    ? ctx.project.meta.deckArtifact
    : null;
  return {
    project: ctx.project,
    preferences: preferences ?? null,
    branding: branding ?? null,
    installedPacks: installedPacks ?? [],
    templatePacks: templatePacks ?? [],
    designTemplates,
    pluginPacks: pluginPacks ?? [],
    designSystems,
    previousDeckVersion: isRecord(previousDeck?.version)
      ? previousDeck.version
      : null,
  };
}

async function fileExtractionAgent(
  ctx: RunContext
): Promise<FileExtractionArtifact> {
  recordToolUsage(ctx, 'list_files', 'db', 'file_extractor');
  const fileId =
    typeof ctx.input.fileId === 'string' ? ctx.input.fileId : undefined;
  const query: Record<string, unknown> = { workspaceId: ctx.job.workspaceId };
  if (fileId) query._id = fileId;
  else query.$or = [{ projectId: ctx.job.projectId }, { projectId: null }];
  const files = await FileModel.find(query)
    .sort({ createdAt: -1 })
    .limit(fileId ? 1 : 5)
    .lean();
  const fileSummaries = files.map((file) => ({
    id: String(file._id),
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    text: readInlineText(file.storageUrl),
  }));
  const joined = fileSummaries
    .map((file) => `# ${file.filename}\n${file.text}`)
    .join('\n\n')
    .slice(0, 14_000);
  recordToolUsage(ctx, 'read_file', 'storage', 'file_extractor');
  if (!joined) {
    return {
      fileId,
      files: fileSummaries.map(({ id, filename, mimeType, sizeBytes }) => ({
        id,
        filename,
        mimeType,
        sizeBytes,
      })),
      summary: 'No readable inline file text was available.',
      keyFacts: [],
      suggestedSlides: [],
      importantSections: [],
    };
  }
  recordToolUsage(ctx, 'summarize_file', 'llm', 'file_extractor');
  const schema = fileExtractionSchema();
  return callJsonAgent(
    ctx,
    'file_extractor',
    jsonPrompt(
      'File Extraction Agent',
      { files: fileSummaries },
      'Summarize uploaded files into JSON: summary, keyFacts, suggestedSlides, importantSections.'
    ),
    schema,
    { temperature: 0.2, maxTokens: 1600 }
  );
}

async function researchAgent(
  ctx: RunContext,
  brief: DeckBrief,
  files: FileExtractionArtifact | null
): Promise<ResearchArtifact> {
  const mode = normalizeResearchMode(ctx.input.researchMode);
  if (mode === 'off' || mode === 'file_only') {
    return {
      researchId: `rsch_skipped_${ctx.job.id.slice(-6)}`,
      jobId: ctx.job.id,
      status: 'skipped',
      queryPlan: [],
      summary: `Live web research skipped because researchMode is ${mode}.`,
      facts: [],
      sources: [],
      warnings: [],
    };
  }
  recordToolUsage(ctx, 'trigger_research', 'external', 'researcher');
  recordToolUsage(ctx, 'web_search', 'external', 'researcher');
  recordToolUsage(ctx, 'web_fetch', 'external', 'researcher');
  recordToolUsage(ctx, 'verify_sources', 'deterministic', 'researcher');
  recordToolUsage(ctx, 'extract_research_facts', 'deterministic', 'researcher');
  return runLiveResearch({
    jobId: ctx.job.id,
    prompt: String(
      ctx.input.prompt ??
        ctx.input.userPrompt ??
        ctx.project.description ??
        ctx.project.title
    ),
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
  research: ResearchArtifact | null
): Promise<OutlineArtifact> {
  const prompt = jsonPrompt(
    'Outline Agent',
    {
      brief,
      project: ctx.project,
      context: summarizeContext(context),
      files,
      research,
      skillQualityPlan: skillQualityPlanForPrompt(ctx),
    },
    'Return JSON with deckTitle, requiresApproval, and slides. Each slide needs slideNumber, slideType, title, purpose. Follow the skillQualityPlan: choose evidence-backed structure for research-heavy decks, preserve template/design-system constraints, and plan slides that can be checked by template conformance QA.'
  );
  return callJsonAgent(ctx, 'outliner', prompt, outlineArtifactSchema, {
    temperature: 0.35,
    maxTokens: 1800,
  });
}

async function contentAgent(
  ctx: RunContext,
  brief: DeckBrief,
  outline: OutlineArtifact,
  context: ContextArtifact,
  files: FileExtractionArtifact | null,
  research: ResearchArtifact | null
): Promise<ContentArtifact> {
  const refinementPlan = designRefinementPlan(ctx);
  const slides: ContentArtifact['slides'] = [];
  for (const outlineSlide of outline.slides) {
    const prompt = jsonPrompt(
      `Content Agent - Slide ${outlineSlide.slideNumber}`,
      {
        brief,
        deck: {
          deckTitle: outline.deckTitle,
          slideCount: outline.slides.length,
        },
        currentOutlineSlide: outlineSlide,
        surroundingOutline: outline.slides.map((slide) => ({
          slideNumber: slide.slideNumber,
          slideType: slide.slideType,
          title: slide.title,
          purpose: slide.purpose,
        })),
        previousSlides: slides.map((slide) => ({
          slideNumber: slide.slideNumber,
          title: slide.title,
          bullets: slide.bullets,
        })),
        context: summarizeContext(context),
        files,
        research,
        refinementPlan,
        skillQualityPlan: skillQualityPlanForPrompt(ctx),
      },
      `Return JSON for exactly slide ${outlineSlide.slideNumber}, not the full deck. Include slideNumber, title, optional subtitle, bullets, speakerNotes, and visualSuggestion. Do not include HTML. If this is a design refinement, preserve the existing story/content unless the user explicitly asks for copy changes. Follow the skillQualityPlan. If research-decision-room is active, make evidence, confidence, tradeoffs, or experiments visible where appropriate. If you include numbers, statistics, market size, competitor claims, recent facts, policy facts, or financial/business facts, they must come from the ResearchArtifact or uploaded files. If no source exists, remove the claim or mark it as an assumption.`
    );
    const slide = await callJsonAgent(
      ctx,
      'content_writer',
      prompt,
      contentSlideSchema,
      {
        temperature: 0.45,
        maxTokens: 1200,
      }
    );
    slides.push(slide);
    emitProductionEvent(ctx, 'deck.content', {
      stage: 'content_writing',
      action: 'slide_completed',
      slideNumber: slide.slideNumber,
      slideTitle: slide.title,
      writtenSlides: slides.length,
      slideCount: outline.slides.length,
    });
  }
  return { slides };
}

async function layoutAgent(
  ctx: RunContext,
  content: ContentArtifact
): Promise<LayoutArtifact> {
  const refinementPlan = designRefinementPlan(ctx);
  const templateFlow = selectTemplateFlowPlan(ctx, content);
  if (templateFlow) {
    ctx.artifacts.templateFlowPlan = templateFlow;
    emitProductionEvent(ctx, 'deck.content', {
      stage: 'layouting',
      action: 'template_flow_selected',
      templateId: templateFlow.templateId,
      templateName: templateFlow.templateName,
      scenario: templateFlow.scenario,
      flowId: templateFlow.flowId,
      flowName: templateFlow.flowName,
      allowedLayoutIds: templateFlow.allowedLayoutIds,
      reason: templateFlow.reason,
    });
  }
  const layouts: LayoutArtifact['layouts'] = [];
  for (const [index, slide] of content.slides.entries()) {
    const layoutCandidates = templateFlow
      ? layoutCandidatesForSlide(templateFlow, slide, index, content.slides.length)
      : [];
    const prompt = jsonPrompt(
      `Layout Agent - Slide ${slide.slideNumber}`,
      {
        currentSlide: slide,
        surroundingSlides: content.slides.map((item) => ({
          slideNumber: item.slideNumber,
          title: item.title,
          visualSuggestion: item.visualSuggestion,
        })),
        previousLayouts: layouts,
        refinementPlan,
        selectedTemplateFlow: templateFlow
          ? templateFlowForPrompt(templateFlow)
          : null,
        allowedLayoutCandidates: layoutCandidates,
        skillQualityPlan: skillQualityPlanForPrompt(ctx),
      },
      templateFlow
        ? 'Return JSON for exactly one slide, not the full deck. Include slideNumber, layoutId, and reason. Choose layoutId from allowedLayoutCandidates only. Use the selectedTemplateFlow as the deck recipe; do not invent generic layout ids and do not force all 25 template layouts into the deck. Prefer layouts that satisfy active skill quality gates: evidence/matrix layouts for research-decision-room, template contract layouts for reference-design-contract, and export-safe layouts for pptx-html-fidelity-audit.'
        : 'Return JSON for exactly one slide, not the full deck. Include slideNumber, layoutId, and reason. Choose a short descriptive layoutId that fits the slide (examples: title_hero, problem_cards, metric_focus, timeline_process, comparison_split, card_grid, quote_statement, closing_cta). The layoutId is only a semantic hint; the html_designer will compose the slide freely. Prefer layouts that satisfy active skill quality gates.'
    );
    const rawLayout = await callJsonAgent(
      ctx,
      'layout_selector',
      prompt,
      layoutDecisionSchema,
      {
        temperature: 0.15,
        maxTokens: 500,
      }
    );
    const layout = normalizeTemplateLayoutDecision(
      rawLayout,
      layoutCandidates,
      templateFlow
    );
    layouts.push(layout);
    emitProductionEvent(ctx, 'deck.content', {
      stage: 'layouting',
      action: 'slide_layout_selected',
      slideNumber: layout.slideNumber,
      layoutId: layout.layoutId,
      laidOutSlides: layouts.length,
      slideCount: content.slides.length,
    });
  }
  return layoutArtifactSchema.parse({ layouts });
}

async function htmlDesignerAgent(
  ctx: RunContext,
  brief: DeckBrief,
  content: ContentArtifact,
  layout: LayoutArtifact,
  imageAssets: ImageAssetArtifact
): Promise<CloudDeckArtifact> {
  recordToolUsage(ctx, 'design_deck_html', 'llm', 'html_designer');
  const layoutBySlide = new Map(
    layout.layouts.map((item) => [item.slideNumber, item.layoutId])
  );
  const baseDeck = {
    deckTitle: String(ctx.input.title ?? ctx.project.title),
    deckType: brief.deckType,
    designStyle: String(ctx.input.designStyle ?? 'modern'),
    language: brief.language,
    summary: `Generated by YDeck cloud production flow for ${brief.audience}.`,
  };
  const plannedSlides: CloudDeckSlide[] = content.slides.map((slide) => ({
    slideNumber: slide.slideNumber,
    slideType: layoutBySlide.get(slide.slideNumber) ?? 'content',
    title: slide.title,
    subtitle: slide.subtitle,
    bullets: slide.bullets,
    speakerNotes: slide.speakerNotes,
    layoutId: layoutBySlide.get(slide.slideNumber),
    visual: imageAssetForSlide(imageAssets, slide.slideNumber)
      ? {
          imageAsset: imageAssetForSlide(imageAssets, slide.slideNumber),
        }
      : undefined,
  }));

  const designedSlides: CloudDeckSlide[] = [];
  for (let index = 0; index < plannedSlides.length; index += 1) {
    const plannedSlide = plannedSlides[index];
    const designed = await designSingleSlideWithLlm(
      ctx,
      brief,
      baseDeck,
      plannedSlide,
      plannedSlides,
      imageAssets
    );
    const normalized = wrapLlmDesignedSlide(
      { ...baseDeck, slides: designedSlides.concat(designed) },
      designed,
      index
    );
    designedSlides.push(normalized);
    emitSlidePreviews(ctx, { ...baseDeck, slides: [normalized] });
    await saveStageArtifacts(ctx, {
      designProgress: {
        designedSlides: designedSlides.length,
        slideCount: plannedSlides.length,
        latestSlideNumber: normalized.slideNumber,
        latestSlideTitle: normalized.title,
      },
    });
  }

  return { ...baseDeck, slides: designedSlides };
}

async function designSingleSlideWithLlm(
  ctx: RunContext,
  brief: DeckBrief,
  deck: Omit<CloudDeckArtifact, 'slides'>,
  slide: CloudDeckSlide,
  allSlides: CloudDeckSlide[],
  imageAssets: ImageAssetArtifact
): Promise<CloudDeckSlide> {
  const slideNumber = slide.slideNumber ?? 1;
  const asset = imageAssetForSlide(imageAssets, slideNumber);
  const imageToken = asset ? `{{YDECK_IMAGE_SLIDE_${slideNumber}}}` : null;
  const imageHint = asset
    ? {
        id: asset.id,
        slideNumber: asset.slideNumber ?? slideNumber,
        width: asset.width,
        height: asset.height,
        orientation: asset.orientation,
        dominantColor: asset.dominantColor,
        attributionText: asset.attributionText,
        altText: asset.query,
        srcToken: imageToken,
      }
    : null;
  const promptSlide = stripImageAssetForPrompt(slide);
  const prompt = jsonPrompt(
    `HTML Designer Agent - Slide ${slideNumber}`,
    {
      brief,
      deck: {
        deckTitle: deck.deckTitle,
        deckType: deck.deckType,
        designStyle: deck.designStyle,
        language: deck.language,
        slideCount: allSlides.length,
      },
      currentSlide: promptSlide,
      surroundingSlides: allSlides.map((item) => ({
        slideNumber: item.slideNumber,
        title: item.title,
        layoutId: item.layoutId,
      })),
      availableImageAsset: imageHint,
      selectedTemplateFlow: templateFlowPlanForPrompt(ctx),
      selectedLayout: templateLayoutForPrompt(ctx, slide.layoutId),
      designTemplates: designTemplatesForPrompt(ctx),
      designSystems: designSystemsForPrompt(ctx),
      skillQualityPlan: skillQualityPlanForPrompt(ctx),
      rules: htmlDesignRules(),
    },
    `Return JSON for exactly one slide, not a full deck. Include slideNumber, slideType, title, subtitle, bullets, speakerNotes, layoutId, visual, and html. The html field is REQUIRED and must be a single complete self-contained <section class="ydeck-slide" style="width:1920px;height:1080px;position:relative;overflow:hidden;..."> element. Design this slide as a unique, fully laid-out 1920x1080 composition: use inline CSS for typography, color, spacing, grid/flex layout, cards, charts, timelines, diagrams, and inline SVG icons as the slide content needs. Vary the composition meaningfully across slides so no two slides look the same. ${
      imageToken
        ? `If you reference the provided image asset in an <img> tag, set src exactly to "${imageToken}" (this placeholder will be replaced server-side with the real URL); never inline base64 or external URLs.`
        : 'Do not include any <img> tags; no image asset is available for this slide.'
    } ${
      templateLayoutForPrompt(ctx, slide.layoutId)
        ? 'Follow selectedLayout exactly as the composition role for this slide; keep the same layoutId in the returned JSON.'
        : ''
    } Never use scripts, iframes, remote URLs, or remote fonts.`
  );
  const designed = await callJsonAgent(
    ctx,
    'html_designer',
    prompt,
    slideForAgentSchema(slide),
    {
      temperature: 0.5,
      maxTokens: Math.min(env.llmMaxTokens, 5000),
    }
  );
  return substituteImageTokens(designed, asset, imageToken);
}

function stripImageAssetForPrompt(slide: CloudDeckSlide): CloudDeckSlide {
  if (!slide.visual || !isRecord(slide.visual)) return slide;
  const { imageAsset: _omit, ...restVisual } = slide.visual as Record<
    string,
    unknown
  >;
  return {
    ...slide,
    visual:
      Object.keys(restVisual).length > 0
        ? (restVisual as CloudDeckSlide['visual'])
        : undefined,
  };
}

function substituteImageTokens(
  slide: CloudDeckSlide,
  asset: ImageAsset | undefined,
  token: string | null
): CloudDeckSlide {
  if (!asset) return slide;
  const publicUrl = imageAssetPublicUrl(asset);
  const replace = (value?: string): string | undefined => {
    if (typeof value !== 'string') return value;
    let out = value;
    if (token && out.includes(token)) out = out.split(token).join(publicUrl);
    if (asset.storedUrl && out.includes(asset.storedUrl))
      out = out.split(asset.storedUrl).join(publicUrl);
    return out;
  };
  return {
    ...slide,
    html: replace(slide.html),
    previewHtml: replace(slide.previewHtml),
    preview: slide.preview
      ? { ...slide.preview, html: replace(slide.preview.html) ?? '' }
      : slide.preview,
    visual: {
      ...(isRecord(slide.visual) ? slide.visual : {}),
      imageAsset: leanImageAsset(asset, publicUrl),
    },
  };
}

function imageAssetPublicUrl(asset: ImageAsset): string {
  const path = `/v1/assets/images/${asset.id}`;
  return env.publicBaseUrl ? `${env.publicBaseUrl}${path}` : path;
}

function leanImageAsset(asset: ImageAsset, publicUrl: string): ImageAsset {
  return {
    ...asset,
    storedUrl: publicUrl,
    thumbnailUrl:
      asset.thumbnailUrl && /^https?:\/\//i.test(asset.thumbnailUrl)
        ? asset.thumbnailUrl
        : publicUrl,
  };
}

async function imageAssetAgent(
  ctx: RunContext,
  content: ContentArtifact
): Promise<ImageAssetArtifact> {
  recordToolUsage(ctx, 'detect_visual_needs', 'deterministic', 'visual_asset');
  const assets: ImageAsset[] = [];
  const skipped: ImageAssetArtifact['skipped'] = [];
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
        orientation: 'landscape',
        style: String(ctx.input.designStyle ?? 'modern professional'),
        count: 4,
        sources: ['pexels'],
      });
      recordToolUsage(ctx, 'search_images', 'external', 'visual_asset');
      emitProductionEvent(ctx, 'deck.asset', {
        stage: 'image_candidates',
        type: 'image_candidates',
        slideNumber: need.slideNumber,
        query: need.query,
        layout: 'grid_3x4',
        carousel: true,
        candidates,
      });
      const candidate = candidates[0];
      if (!candidate) {
        skipped.push({
          slideNumber: need.slideNumber,
          reason: 'No Pexels candidates found.',
        });
        continue;
      }
      const asset = await selectImage({
        workspaceId: String(ctx.job.workspaceId),
        projectId: String(ctx.job.projectId),
        deckId: String(ctx.job.projectId),
        assetCandidateId: candidate.assetCandidateId,
        slideNumber: need.slideNumber,
        reason: 'Selected by cloud image asset agent for slide visual intent.',
      });
      recordToolUsage(ctx, 'select_image', 'external', 'visual_asset');
      assets.push(asset);
      emitProductionEvent(ctx, 'deck.asset', {
        stage: 'image_selected',
        type: 'image',
        slideNumber: need.slideNumber,
        query: need.query,
        imageAsset: asset,
      });
    } catch (err) {
      skipped.push({
        slideNumber: need.slideNumber,
        reason: (err as Error).message,
      });
    }
  }

  return { assets, skipped };
}

async function visionQaAgent(
  ctx: RunContext,
  deck: CloudDeckArtifact
): Promise<QaArtifact> {
  recordToolUsage(ctx, 'run_design_qa', 'deterministic', 'vision_qa');
  const deterministic = deterministicQa(ctx, deck);
  try {
    recordToolUsage(
      ctx,
      'render_deck_screenshots',
      'external',
      'screenshot_renderer'
    );
    const screenshots = await renderDeckScreenshots({
      jobId: ctx.job.id,
      deckId: ctx.project.id,
      projectId: ctx.project.id,
      workspaceId: String(ctx.job.workspaceId),
      slides: deck.slides
        .map((slide) => ({
          slideNumber: slide.slideNumber,
          html: slide.html ?? slide.preview?.html ?? '',
        }))
        .filter((slide) => slide.html.trim()),
    });
    emitProductionEvent(ctx, 'deck.qa', {
      source: 'render_service',
      stage: 'screenshot_renderer',
      screenshots,
      count: screenshots.length,
    });

    recordToolUsage(ctx, 'vision_review_deck', 'external', 'vision_qa');
    const vision = await reviewDeckWithVision({
      jobId: ctx.job.id,
      deckId: ctx.project.id,
      projectId: ctx.project.id,
      workspaceId: String(ctx.job.workspaceId),
      deckBrief: ctx.artifacts.deckBrief ?? null,
      screenshots: screenshots.map((shot) => {
        const slide = deck.slides.find(
          (item) => item.slideNumber === shot.slideNumber
        );
        return {
          slideNumber: shot.slideNumber,
          title: slide?.title,
          screenshotUrl: shot.screenshotUrl,
          fileId: shot.fileId,
          layoutId: slide?.layoutId,
        };
      }),
    });
    emitProductionEvent(ctx, 'deck.qa', {
      source: 'vision_qa',
      provider: vision.provider,
      averageScore: vision.averageScore,
      approved: vision.approved,
      deckSummary: vision.deckSummary,
      slidesNeedingRepair: vision.slidesNeedingRepair,
      repairing: !vision.approved,
    });

    return mergeQaArtifacts(deterministic, {
      averageScore: Math.round(vision.averageScore * 10),
      acceptedSlides: deck.slides.length - vision.slidesNeedingRepair.length,
      repairedSlides: vision.slidesNeedingRepair.length,
      issues: [
        ...vision.deckProblems.map((problem) => ({
          slideNumber: 1,
          severity:
            problem.severity === 'high'
              ? ('warning' as const)
              : ('info' as const),
          problem: problem.description,
          repairInstruction:
            vision.deckRepairInstructions.join(' ') || problem.description,
        })),
        ...vision.slideReviews.flatMap((review) =>
          review.problems.map((problem) => ({
            slideNumber: review.slideNumber,
            severity:
              problem.severity === 'high'
                ? ('warning' as const)
                : ('info' as const),
            problem: problem.description,
            repairInstruction:
              review.repairInstructions.join(' ') || problem.description,
          }))
        ),
      ],
    });
  } catch (err) {
    recordToolUsage(ctx, 'vision_review_deck', 'external', 'vision_qa', false);
    logger.warn(
      { err, jobId: ctx.job.id },
      'cloud_production.vision_qa_skipped'
    );
  }

  // Vision QA is best-effort. When the screenshot/vision pipeline is
  // unavailable, fall back to deterministic HTML-only QA instead of asking
  // another LLM to invent a review. This keeps the job moving without
  // substituting hallucinated QA data.
  return deterministic;
}

async function repairAgent(
  ctx: RunContext,
  deck: CloudDeckArtifact,
  qa: QaArtifact
): Promise<CloudDeckArtifact> {
  recordToolUsage(ctx, 'repair_deck_design', 'llm', 'repair');
  const assetBySlide = new Map<number, ImageAsset>();
  for (const slide of deck.slides) {
    const asset = (slide.visual as { imageAsset?: ImageAsset } | undefined)
      ?.imageAsset;
    if (asset && typeof slide.slideNumber === 'number') {
      assetBySlide.set(slide.slideNumber, asset);
    }
  }
  const tokenFor = (slideNumber: number) =>
    assetBySlide.has(slideNumber)
      ? `{{YDECK_IMAGE_SLIDE_${slideNumber}}}`
      : null;
  const issuesBySlide = issuesGroupedBySlide(qa);
  if (!issuesBySlide.size) return deck;

  const totalSlides = issuesBySlide.size;
  emitProductionEvent(ctx, 'deck.repair', {
    action: 'started',
    message: `Repairing ${totalSlides} slide${totalSlides === 1 ? '' : 's'} after QA.`,
    totalSlides,
    repairedSlides: 0,
    slides: Array.from(issuesBySlide, ([slideNumber, issues]) => ({
      slideNumber,
      issueCount: issues.length,
      issues,
    })),
  });

  const repairedBySlide = new Map<number, CloudDeckSlide>();
  let repairIndex = 0;
  for (const [slideNumber, issues] of issuesBySlide) {
    const originalSlide = deck.slides.find(
      (slide, index) => (slide.slideNumber ?? index + 1) === slideNumber
    );
    if (!originalSlide) continue;

    repairIndex += 1;
    const asset = assetBySlide.get(slideNumber);
    const imageToken = tokenFor(slideNumber);
    emitProductionEvent(ctx, 'deck.repair', {
      action: 'slide_started',
      message: `Repairing slide ${slideNumber}.`,
      slideNumber,
      slideTitle: originalSlide.title,
      repairIndex,
      totalSlides,
      repairedSlides: repairedBySlide.size,
      issues,
    });

    const prompt = jsonPrompt(
      `Repair Agent - Slide ${slideNumber}`,
      {
        deck: {
          deckTitle: deck.deckTitle,
          deckType: deck.deckType,
          designStyle: deck.designStyle,
          language: deck.language,
          slideCount: deck.slides.length,
        },
        slide: compactSlideForRepair(originalSlide, imageToken),
        issues,
        surroundingSlides: deck.slides.map((slide, index) => ({
          slideNumber: slide.slideNumber ?? index + 1,
          title: slide.title,
          layoutId: slide.layoutId,
        })),
        selectedTemplateFlow: templateFlowPlanForPrompt(ctx),
        selectedLayout: templateLayoutForPrompt(ctx, originalSlide.layoutId),
        designTemplates: designTemplatesForPrompt(ctx),
        designSystems: designSystemsForPrompt(ctx),
        skillQualityPlan: skillQualityPlanForPrompt(ctx),
        rules: htmlDesignRules(),
      },
      `Return JSON for exactly slide ${slideNumber}, not a full deck. Include slideNumber, slideType, title, subtitle, bullets, speakerNotes, layoutId, visual, and html. The html field is REQUIRED and must be a complete self-contained <section class="ydeck-slide"> at 1920x1080. Repair only the listed issues while preserving the slide's story and role in the deck. ${
        imageToken
          ? `If you reference the provided image asset in an <img> tag, set src exactly to "${imageToken}" (this placeholder will be replaced server-side with the real URL); never inline base64 or external URLs.`
          : 'Do not include any <img> tags; no image asset is available for this slide.'
      } ${
        templateLayoutForPrompt(ctx, originalSlide.layoutId)
          ? 'Preserve the selectedLayout role and keep the same layoutId unless the listed issue explicitly says the layout id is invalid.'
          : ''
      } Never use scripts, iframes, remote URLs, or remote fonts.`
    );
    const repaired = await callJsonAgent(
      ctx,
      'repair',
      prompt,
      slideForAgentSchema(originalSlide),
      {
        temperature: 0.25,
        maxTokens: Math.min(env.llmMaxTokens, 5000),
      }
    );
    repairedBySlide.set(
      slideNumber,
      substituteImageTokens(repaired, asset, imageToken)
    );
    emitProductionEvent(ctx, 'deck.repair', {
      action: 'slide_completed',
      message: `Repaired slide ${slideNumber}.`,
      slideNumber,
      slideTitle: repaired.title,
      repairIndex,
      totalSlides,
      repairedSlides: repairedBySlide.size,
    });
  }

  const merged = finalizeLlmDeck({
    ...deck,
    slides: deck.slides.map((slide, index) => {
      const slideNumber = slide.slideNumber ?? index + 1;
      return repairedBySlide.get(slideNumber) ?? slide;
    }),
  });
  const deterministicAfterRepair = deterministicQa(ctx, merged);
  if (
    deterministicAfterRepair.issues.some(
      (issue) =>
        issue.severity === 'error' && repairedBySlide.has(issue.slideNumber)
    )
  ) {
    throw new Error(
      `repair left blocking issues: ${deterministicAfterRepair.issues
        .filter(
          (issue) =>
            issue.severity === 'error' && repairedBySlide.has(issue.slideNumber)
        )
        .map((issue) => `slide ${issue.slideNumber}: ${issue.problem}`)
        .join('; ')}`
    );
  }
  emitProductionEvent(ctx, 'deck.repair', {
    action: 'completed',
    message: `Repair completed for ${repairedBySlide.size} slide${
      repairedBySlide.size === 1 ? '' : 's'
    }.`,
    totalSlides,
    repairedSlides: repairedBySlide.size,
    slideNumbers: Array.from(repairedBySlide.keys()),
  });
  return merged;
}

async function exportAgent(
  ctx: RunContext,
  deck: CloudDeckArtifact
): Promise<ExportArtifact> {
  const skillPlan = skillQualityPlanForPrompt(ctx);
  const files: ExportArtifact['files'] = [
    {
      format: 'html',
      sizeBytes: Buffer.byteLength(JSON.stringify(stripHeavyHtml(deck)), 'utf8'),
    },
  ];
  const formats: ExportArtifact['formats'] = ['html'];
  recordToolUsage(ctx, 'export_pptx', 'export', 'exporter');
  try {
    const pptxBuffer = await renderDeckArtifactToPptx(deck);
    const base64 = pptxBuffer.toString('base64');
    const file = await FileModel.create({
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      scope: 'job',
      kind: 'deck_export',
      filename: `${safeFileName(deck.deckTitle)}-${randomToken(4)}.pptx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: pptxBuffer.byteLength,
      storageUrl: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`,
      checksum: sha256Hex(base64),
      meta: {
        source: 'cloud_production_exporter',
        format: 'pptx',
        exporter: 'html_measurement_pptxgenjs',
        skillQualityGates: skillPlan?.exportDirectives ?? [],
      },
    });
    formats.unshift('pptx');
    files.unshift({
      format: 'pptx',
      fileId: file.id,
      sizeBytes: pptxBuffer.byteLength,
    });
  } catch (err) {
    recordToolUsage(ctx, 'export_pptx', 'export', 'exporter', false);
    logger.warn({ err, jobId: ctx.job.id }, 'cloud_production.pptx_export_failed');
    emitProductionEvent(ctx, 'deck.export', {
      stage: 'exporting',
      format: 'pptx',
      status: 'skipped',
      reason: (err as Error).message,
    });
  }
  recordToolUsage(ctx, 'export_pdf', 'export', 'exporter');
  return exportArtifactSchema.parse({
    formats,
    files,
    skillQualityGates: skillPlan?.exportDirectives ?? [],
  });
}

async function callJsonAgent<T>(
  ctx: RunContext,
  agent: CloudAgentName,
  prompt: string,
  schema: {
    safeParse: (
      value: unknown
    ) => { success: true; data: T } | { success: false; error: unknown };
  },
  options: { temperature: number; maxTokens: number }
): Promise<T> {
  const conceptualTool = agentToolName(agent);
  if (conceptualTool) recordToolUsage(ctx, conceptualTool, 'llm', agent);
  logAgentFlow(ctx.job.id, `${agent}.send`, {
    promptChars: prompt.length,
    prompt,
  });
  await auditAgent(ctx, agent, 'started', { promptChars: prompt.length });
  // Up to two attempts: if the model returns non-JSON or JSON that fails the
  // schema, re-prompt once with the exact error so it can self-correct. Many
  // agent prompts don't enumerate every allowed value (e.g. a step status), so
  // a single strict failure should not kill the whole job.
  const maxAttempts = 2;
  let activePrompt = prompt;
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let text: string;
    try {
      text = await ctx.provider.generate(activePrompt, options);
    } catch (err) {
      logger.warn(
        { err, agent, jobId: ctx.job.id },
        'cloud_production_agent.failed'
      );
      await auditAgent(ctx, agent, 'errored', {
        reason: 'provider_error',
        detail: (err as Error).message,
      });
      // A provider/transport error won't be fixed by re-prompting.
      throw new Error(`${agent} LLM call failed: ${(err as Error).message}`);
    }
    logAgentFlow(ctx.job.id, `${agent}.receive`, {
      chars: text.length,
      text,
      attempt,
    });
    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) {
        await auditAgent(ctx, agent, 'completed', {
          responseChars: text.length,
          attempts: attempt,
        });
        return parsed.data;
      }
      lastError = `JSON failed schema validation: ${String(parsed.error)}`;
    } catch (err) {
      lastError = `response was not valid JSON: ${(err as Error).message}`;
    }
    logger.warn(
      { agent, jobId: ctx.job.id, attempt, detail: lastError },
      'cloud_production_agent.invalid_json'
    );
    if (attempt < maxAttempts) {
      activePrompt = `${prompt}\n\nYour previous response was rejected:\n${lastError}\n\nReturn ONLY corrected JSON that matches the required structure and uses exactly the allowed field values. No markdown, no comments, no extra text.`;
      logAgentFlow(ctx.job.id, `${agent}.retry`, { detail: lastError });
    }
  }
  await auditAgent(ctx, agent, 'errored', {
    reason: 'invalid_json',
    detail: lastError,
  });
  throw new Error(
    `${agent} returned invalid JSON after ${maxAttempts} attempts: ${lastError}`
  );
}

function agentToolName(agent: CloudAgentName): string | null {
  switch (agent) {
    case 'request_classifier':
      return 'create_deck_brief';
    case 'planner':
      return 'create_deck_plan';
    case 'file_extractor':
      return 'summarize_file';
    case 'outliner':
      return 'create_outline';
    case 'content_writer':
      return 'write_slide_content';
    case 'layout_selector':
      return 'choose_layouts';
    case 'html_designer':
      return 'design_slide_html';
    case 'vision_qa':
      return 'vision_review_deck';
    case 'repair':
      return 'repair_deck_design';
    default:
      return null;
  }
}

async function setProductionState(
  job: DeckJobDoc,
  status: CloudProductionStatus,
  progress: number
): Promise<void> {
  const dbStatus = dbStatusForProduction(status);
  const existing = await DeckJobModel.findById(job.id)
    .select('resultMeta')
    .lean();
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
  const ctx = activeRunContexts.get(job.id);
  if (ctx) ctx.currentStage = status;
  jobBus.emitJob({
    jobId: job.id,
    status: dbStatus,
    progress,
    channel: 'deck.status',
    payload: {
      productionStage: status,
      ...(ctx ? { toolUsage: toolUsageForStage(ctx, status) } : {}),
    },
    at: new Date().toISOString(),
  });
}

function dbStatusForProduction(
  status: CloudProductionStatus
):
  | 'queued'
  | 'parsing'
  | 'llm'
  | 'rendering'
  | 'exporting'
  | 'done'
  | 'error'
  | 'canceled' {
  if (status === 'queued') return 'queued';
  if (status === 'file_processing' || status === 'context_loading')
    return 'parsing';
  if (
    status === 'rendering' ||
    status === 'qa_checking' ||
    status === 'repairing'
  )
    return 'rendering';
  if (status === 'exporting' || status === 'delivering') return 'exporting';
  if (status === 'done') return 'done';
  if (status === 'error') return 'error';
  if (status === 'canceled') return 'canceled';
  return 'llm';
}

async function saveStageArtifacts(
  ctx: RunContext,
  patch: Record<string, unknown>
): Promise<void> {
  ctx.artifacts = { ...ctx.artifacts, ...patch };
  const existing = await DeckJobModel.findById(ctx.job.id)
    .select('resultMeta')
    .lean();
  const resultMeta = isRecord(existing?.resultMeta) ? existing.resultMeta : {};
  await DeckJobModel.findByIdAndUpdate(ctx.job.id, {
    $set: {
      resultMeta: {
        ...resultMeta,
        productionFlow: {
          architecture: 'cloud_production_multi_agent',
          artifacts: sanitizeArtifacts(ctx.artifacts),
          toolUsage: toolUsageSummary(ctx),
        },
      },
    },
  });
}

function emitProductionEvent(
  ctx: RunContext,
  channel: CloudEventChannel,
  payload: unknown
): void {
  emitCloudEvent(ctx.job, channel, withToolUsage(ctx, payload));
}

function withToolUsage(ctx: RunContext, payload: unknown): unknown {
  const usage = toolUsageForStage(ctx, ctx.currentStage);
  if (isRecord(payload)) {
    return {
      ...payload,
      toolUsage: usage,
    };
  }
  return {
    data: payload,
    toolUsage: usage,
  };
}

function recordToolUsage(
  ctx: RunContext,
  name: string,
  kind: ToolUsageRecord['kind'],
  agent?: ToolUsageRecord['agent'],
  ok = true
): void {
  ctx.toolUsage.records.push({
    stage: ctx.currentStage ?? 'unknown',
    agent,
    name,
    kind,
    ok,
    at: new Date().toISOString(),
  });
}

function toolUsageForStage(ctx: RunContext, stage = ctx.currentStage) {
  const records = ctx.toolUsage.records.filter(
    (record) => !stage || record.stage === stage
  );
  const names = [...new Set(records.map((record) => record.name))];
  return {
    stage: stage ?? null,
    toolsUsed: records.length,
    uniqueToolsUsed: names.length,
    toolNames: names,
  };
}

function toolUsageSummary(ctx: RunContext) {
  const byStage: Record<string, ReturnType<typeof toolUsageForStage>> = {};
  for (const stage of [
    ...new Set(ctx.toolUsage.records.map((record) => record.stage)),
  ]) {
    byStage[stage] = toolUsageForStage(ctx, stage as CloudProductionStatus);
  }
  const names = [
    ...new Set(ctx.toolUsage.records.map((record) => record.name)),
  ];
  return {
    totalToolsUsed: ctx.toolUsage.records.length,
    uniqueToolsUsed: names.length,
    toolNames: names,
    byStage,
  };
}

function emitSlidePreviews(
  jobOrCtx: DeckJobDoc | RunContext,
  deck: CloudDeckArtifact
): void {
  const job = 'job' in jobOrCtx ? jobOrCtx.job : jobOrCtx;
  const ctx =
    'toolUsage' in jobOrCtx ? jobOrCtx : activeRunContexts.get(job.id);
  for (const slide of deck.slides) {
    jobBus.emitJob({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      channel: 'slide.preview',
      payload: {
        slideNumber: slide.slideNumber,
        slideTitle: slide.title,
        layoutId: slide.layoutId ?? 'html_designed',
        designId:
          slide.preview?.designId ??
          `ydeck.cloud:${deck.designStyle}:${
            slide.layoutId ?? 'html_designed'
          }`,
        source: 'cloud_production_html_designer',
        status: 'rendered',
        html: slide.preview?.html ?? slide.previewHtml ?? slide.html,
        ...(ctx ? { toolUsage: toolUsageForStage(ctx, ctx.currentStage) } : {}),
      },
      at: new Date().toISOString(),
    });
  }
}

function buildFallbackBrief(ctx: RunContext): DeckBrief {
  const prompt = String(
    ctx.input.prompt ??
      ctx.input.userPrompt ??
      ctx.project.description ??
      ctx.project.title
  );
  const deckType = String(ctx.input.deckType ?? 'general');
  const slideCount = clampInt(
    Number(ctx.input.slideCount ?? ctx.input.slides ?? 6),
    1,
    100
  );
  return deckBriefSchema.parse({
    intent: ctx.job.type === 'refine' ? 'edit_deck' : 'create_deck',
    deckType,
    audience: audienceForDeckType(deckType),
    slideCount,
    language: String(ctx.input.language ?? 'en'),
    needsResearch: shouldResearch({
      researchMode: ctx.input.researchMode,
      classifierNeedsResearch:
        /\b(research|market|competitor|latest|recent|sources|statistics|data)\b/i.test(
          prompt
        ),
      prompt,
    }),
    hasFiles:
      typeof ctx.input.fileId === 'string' && ctx.input.fileId.length > 0,
    requiresOutlineApproval: ctx.input.generationMode === 'outline_first',
  });
}

function normalizeDeckBrief(ctx: RunContext, brief: DeckBrief): DeckBrief {
  const prompt = String(
    ctx.input.prompt ??
      ctx.input.userPrompt ??
      ctx.project.description ??
      ctx.project.title
  );
  const hasExplicitCount =
    /\b(\d{1,2}|one|single)\s*[- ]?(slide|slides|page|pages)\b/i.test(prompt);
  const routeProvidedCount =
    ctx.input.slideCount !== undefined || ctx.input.slides !== undefined;
  const corrected: DeckBrief = {
    ...brief,
    language: normalizeBriefLanguage(ctx, prompt, brief.language),
    deckType: normalizeBriefDeckType(prompt, brief.deckType),
    audience: normalizeBriefAudience(prompt, brief.deckType, brief.audience),
    needsResearch: normalizeBriefNeedsResearch(
      ctx,
      prompt,
      brief.needsResearch
    ),
  };
  if (!routeProvidedCount && !hasExplicitCount && brief.slideCount <= 1) {
    return {
      ...corrected,
      slideCount: 6,
    };
  }
  return corrected;
}

function normalizeBriefLanguage(
  ctx: RunContext,
  prompt: string,
  language: string
): string {
  if (typeof ctx.input.language === 'string' && ctx.input.language.trim())
    return String(ctx.input.language).slice(0, 20);
  if (/[\u4e00-\u9fff]/.test(prompt)) return 'zh';
  if (/[\u0400-\u04ff]/.test(prompt)) return 'ru';
  if (/[\u0600-\u06ff]/.test(prompt)) return 'ar';
  if (/[^\u0000-\u007f]/.test(prompt)) return language || 'en';
  return 'en';
}

function normalizeBriefDeckType(prompt: string, deckType: string): string {
  if (isHistoryEducationPrompt(prompt) && !isBusinessPrompt(prompt)) {
    return /\b(lesson|class|student|teacher|school)\b/i.test(prompt)
      ? 'lesson_deck'
      : 'educational_history';
  }
  return deckType;
}

function normalizeBriefAudience(
  prompt: string,
  deckType: string,
  audience: string
): string {
  if (isHistoryEducationPrompt(prompt) && !isBusinessPrompt(prompt)) {
    if (/\b(student|students|class|school)\b/i.test(prompt)) return 'students';
    return 'general audience';
  }
  return audience || audienceForDeckType(deckType);
}

function normalizeBriefNeedsResearch(
  ctx: RunContext,
  prompt: string,
  needsResearch: boolean
): boolean {
  const mode = normalizeResearchMode(ctx.input.researchMode);
  if (mode === 'required') return true;
  if (mode === 'off' || mode === 'file_only') return false;
  if (
    isHistoryEducationPrompt(prompt) &&
    !/\b(research|sources?|latest|recent|statistics|data|timeline|facts?)\b/i.test(
      prompt
    )
  )
    return false;
  return needsResearch;
}

function isHistoryEducationPrompt(prompt: string): boolean {
  return /\b(history|historical|dynasty|dynasties|ancient|civilization|empire|revolution|culture|cultural|lesson|education|teacher|student|class|school|chinese history)\b/i.test(
    prompt
  );
}

function isBusinessPrompt(prompt: string): boolean {
  return /\b(market|competitor|competitors|company|companies|business|investor|industry|CAGR|forecast|revenue|sales|startup|pitch)\b/i.test(
    prompt
  );
}

function imageQueryForSlide(slide: ContentArtifact['slides'][number]): string {
  const visual = `${slide.visualSuggestion ?? ''} ${slide.title}`.toLowerCase();
  const text = `${slide.title} ${slide.subtitle ?? ''} ${(
    slide.bullets ?? []
  ).join(' ')}`;
  if (
    /\b(photo|image|teacher|classroom|student|office|team|customer|market|product|lifestyle|startup)\b/.test(
      visual
    )
  ) {
    return compactText(text, 140);
  }
  if (/\btitle|problem|solution|market|customer\b/.test(visual)) {
    return compactText(text, 140);
  }
  return '';
}

function imageAssetForSlide(
  imageAssets: ImageAssetArtifact,
  slideNumber: number
): ImageAsset | undefined {
  return imageAssets.assets.find((asset) => asset.slideNumber === slideNumber);
}

function designRefinementPlan(ctx: RunContext): {
  instruction: string;
  summary: string;
  plannedChanges: string[];
  preserveContent: boolean;
} | null {
  const input = ctx.input;
  const messageIntent = isRecord(input.messageIntent)
    ? input.messageIntent
    : null;
  const instruction = String(
    input.editInstruction ?? input.prompt ?? input.userPrompt ?? ''
  );
  const isDesign =
    messageIntent?.refinementKind === 'design' ||
    /\b(different design|new design|try another design|try a different|redesign|change the look|visual style|make it modern|more modern|more visual|new style|different style|fresh design|better design)\b/i.test(
      instruction
    );
  if (ctx.job.type !== 'refine' || !isDesign) return null;
  return {
    instruction,
    summary:
      'Trying a different visual direction while preserving the deck story.',
    preserveContent:
      !/\b(rewrite|change text|new content|different story|change copy)\b/i.test(
        instruction
      ),
    plannedChanges: [
      'Understand the requested design change',
      'Keep the existing story and key claims unless text changes are requested',
      'Choose alternate layouts for each slide',
      'Refresh visual hierarchy, spacing, typography, and color rhythm',
      'Use icons, charts, timelines, and stored images where they improve clarity',
      'Regenerate slide previews one by one',
      'Run design QA and save a new version',
    ],
  };
}

function buildSkillQualityPlan(
  ctx: RunContext,
  brief: DeckBrief,
  context: ContextArtifact
): SkillQualityPlan {
  const prompt = String(
    ctx.input.prompt ??
      ctx.input.userPrompt ??
      ctx.project.description ??
      ctx.project.title
  );
  const gates: SkillQualityGate[] = [];
  const hasDesignContractInputs =
    context.designTemplates.length > 0 ||
    context.designSystems.length > 0 ||
    Boolean(ctx.input.designStyle) ||
    Boolean(ctx.input.templateId ?? ctx.project.templateId);
  const isResearchDecisionDeck =
    brief.needsResearch ||
    /\b(research|interview|survey|support ticket|usability|evidence|decision|opportunity|experiment|confidence|matrix|findings)\b/i.test(
      prompt
    ) ||
    /\b(research|market|policy|strategy|decision)\b/i.test(brief.deckType);
  const refinementPlan = designRefinementPlan(ctx);

  if (hasDesignContractInputs) {
    gates.push({
      skill: 'reference-design-contract',
      status: 'active',
      purpose:
        'Keep template.json, selected layouts, design-system tokens, palette, typography, spacing, and anti-patterns explicit throughout generation.',
      appliesTo: ['outlining', 'layouting', 'designing', 'qa_checking'],
      frontendMessage:
        'Applying the selected template and design-system contract.',
    });
  }
  gates.push({
    skill: 'slides',
    status: 'active',
    purpose:
      'Translate generic slide-deck workflow into YDeck-native per-slide generation, speaker notes, semantic layout selection, and slide pacing.',
    appliesTo: ['outlining', 'content_writing', 'layouting', 'designing'],
    frontendMessage:
      'Generating the deck one slide at a time with controlled slide structure.',
  });
  gates.push({
    skill: 'pptx',
    status: 'active',
    purpose:
      'Translate generic PowerPoint editing rules into export-safe, editable PPTX constraints: fixed canvas, native text, tables, shapes, notes, and measured geometry.',
    appliesTo: ['designing', 'qa_checking', 'exporting'],
    frontendMessage:
      'Keeping the slides ready for editable PowerPoint export.',
  });
  gates.push({
    skill: 'pptx-generator',
    status: 'active',
    purpose:
      'Translate production PptxGenJS discipline into a deterministic HTML-measured export path instead of asking the LLM to hand-author a whole PPTX.',
    appliesTo: ['layouting', 'designing', 'exporting'],
    frontendMessage:
      'Using YDeck’s measured HTML-to-PPTX export pipeline.',
  });
  if (isResearchDecisionDeck) {
    gates.push({
      skill: 'research-decision-room',
      status: 'active',
      purpose:
        'Keep factual claims evidence-backed and make confidence, limitations, tradeoffs, decisions, or experiments visible when the deck needs them.',
      appliesTo: ['researching', 'outlining', 'content_writing', 'qa_checking'],
      frontendMessage:
        'Checking that research claims stay tied to evidence and decisions.',
    });
  }
  if (refinementPlan) {
    gates.push({
      skill: 'redesign-skill',
      status: 'active',
      purpose:
        'Improve the visual direction without breaking existing story, data, or deck behavior.',
      appliesTo: ['planning', 'layouting', 'designing', 'qa_checking'],
      frontendMessage:
        'Refreshing the visual direction while preserving the deck story.',
    });
  }
  gates.push({
    skill: 'pptx-html-fidelity-audit',
    status: 'active',
    purpose:
      'Generate fixed-canvas, export-safe HTML that can be measured into PPTX without overflow, remote resources, or lost typography.',
    appliesTo: ['designing', 'qa_checking', 'repairing', 'exporting'],
    frontendMessage:
      'Preparing slides for HTML-to-PPTX fidelity checks.',
  });

  return {
    source: 'skills_quality_router',
    summary:
      gates.length > 1
        ? `Using ${gates.length} skill quality gates to guide slide generation and export readiness.`
        : 'Using export-safe slide quality gates.',
    gates,
    promptDirectives: [
      'Generate one slide at a time; never ask the LLM to rewrite the whole deck when only one slide is being produced or repaired.',
      'Use semantic slide structure: title, subtitle, bullets/body, speakerNotes, layoutId, visual role, and export-compatible HTML.',
      'Use template.json as the structured source of truth; SKILL.md and references describe design behavior.',
      'Select a recommended flow and a subset of layouts that fit the deck type; do not force every layout option into one deck.',
      'Keep slides static, self-contained, 1920x1080, and free of scripts, iframes, remote URLs, remote fonts, and external CSS.',
      'Use modern charts, bars, timelines, matrices, diagrams, and SVG icons only where they clarify the slide purpose.',
      'Prefer native-exportable structures for content that users may edit later: real text boxes, tables for tabular data, simple geometric shapes, and speaker notes.',
    ],
    qaDirectives: [
      'Compare generated slides against allowed layout ids, palette, typography, spacing, density, chart/icon rules, and image rules.',
      'Treat unsafe HTML, remote resources, missing fixed canvas, and unknown template layout ids as repairable QA issues.',
      'Repair only failed slides and preserve the rest of the deck.',
    ],
    exportDirectives: [
      'Run PPTX export after HTML QA has no blocking errors.',
      'Use the HTML slide as the layout authority for PPTX measurement.',
      'Export to editable PPTX with native text, tables, shapes, speaker notes, and rasterized inline SVG graphics when needed.',
      'Before shipping PPTX, verify no content crosses the 1920x1080 canvas or footer/content rails.',
    ],
  };
}

function skillQualityPlanForPrompt(
  ctx: RunContext
): SkillQualityPlan | null {
  const plan = ctx.artifacts.skillQualityPlan;
  return isSkillQualityPlan(plan) ? plan : null;
}

function hasSkillGate(ctx: RunContext, skill: string): boolean {
  const plan = skillQualityPlanForPrompt(ctx);
  return Boolean(
    plan?.gates.some(
      (gate) => gate.skill === skill && gate.status === 'active'
    )
  );
}

function isSkillQualityPlan(value: unknown): value is SkillQualityPlan {
  return (
    isRecord(value) &&
    value.source === 'skills_quality_router' &&
    Array.isArray(value.gates) &&
    Array.isArray(value.promptDirectives) &&
    Array.isArray(value.qaDirectives) &&
    Array.isArray(value.exportDirectives)
  );
}

function mergeQaArtifacts(
  deterministic: QaArtifact,
  vision: QaArtifact
): QaArtifact {
  const issues = [...deterministic.issues, ...vision.issues].map((issue) => ({
    ...issue,
    slideNumber: Math.max(1, Math.round(Number(issue.slideNumber) || 1)),
  }));
  return qaArtifactSchema.parse({
    averageScore: Math.min(deterministic.averageScore, vision.averageScore),
    acceptedSlides: Math.min(
      deterministic.acceptedSlides,
      vision.acceptedSlides
    ),
    repairedSlides: Math.max(
      deterministic.repairedSlides,
      vision.repairedSlides
    ),
    issues,
  });
}

function deterministicQa(ctx: RunContext, deck: CloudDeckArtifact): QaArtifact {
  const issues: QaArtifact['issues'] = [];
  const templatePlan = ctx.artifacts.templateFlowPlan;
  const allowedLayoutIds = isTemplateFlowPlan(templatePlan)
    ? new Set(templatePlan.allowedLayoutIds)
    : null;
  let scoreSum = 0;
  for (const slide of deck.slides) {
    let score = 100;
    const html = `${slide.html ?? ''} ${slide.previewHtml ?? ''}`;
    const slideNumber = slide.slideNumber ?? 1;
    const textLength = [
      slide.title,
      slide.subtitle,
      slide.body,
      ...(slide.bullets ?? []),
    ]
      .filter(Boolean)
      .join(' ').length;
    if (!/<section\b/i.test(slide.html ?? '')) {
      score -= 30;
      issues.push({
        slideNumber,
        severity: 'error',
        problem: 'Missing slide section HTML.',
        repairInstruction: 'Regenerate slide HTML.',
      });
    }
    if (!/width:\s*1920px/i.test(html) || !/height:\s*1080px/i.test(html)) {
      score -= 15;
      issues.push({
        slideNumber,
        severity: 'warning',
        problem: 'Slide canvas is not explicitly 1920x1080.',
        repairInstruction: 'Use fixed export canvas dimensions.',
      });
    }
    const htmlWithoutAllowedAssets = stripAllowedAssetUrls(html);
    if (/<script|<iframe|javascript:|https?:\/\//i.test(htmlWithoutAllowedAssets)) {
      score -= 25;
      issues.push({
        slideNumber,
        severity: 'error',
        problem: 'Unsafe or remote HTML detected.',
        repairInstruction: 'Remove scripts, iframes, and remote URLs.',
      });
    }
    if (textLength > 980) {
      score -= 12;
      issues.push({
        slideNumber,
        severity: 'warning',
        problem: 'Slide is text-heavy.',
        repairInstruction: 'Reduce text and use fewer cards.',
      });
    }
    if (allowedLayoutIds && slide.layoutId && !allowedLayoutIds.has(slide.layoutId)) {
      score -= 18;
      issues.push({
        slideNumber,
        severity: 'warning',
        problem: `Slide layout "${slide.layoutId}" is outside the selected template flow.`,
        repairInstruction:
          'Use one of the selected template flow layout ids and keep the slide composition aligned to that layout role.',
      });
    }
    if (hasSkillGate(ctx, 'reference-design-contract') && isTemplateFlowPlan(templatePlan)) {
      const expectedLayout = slide.layoutId
        ? templatePlan.allLayouts.find((layout) => layout.id === slide.layoutId)
        : null;
      if (!expectedLayout) {
        score -= 10;
        issues.push({
          slideNumber,
          severity: 'warning',
          problem: 'Slide does not identify a known template layout.',
          repairInstruction:
            'Assign a valid template layoutId and make the HTML composition visibly match that layout contract.',
        });
      }
    }
    scoreSum += Math.max(0, score);
  }
  const averageScore = Math.round(scoreSum / Math.max(1, deck.slides.length));
  return qaArtifactSchema.parse({
    averageScore,
    acceptedSlides: Math.max(
      0,
      deck.slides.length -
        new Set(issues.map((issue) => issue.slideNumber)).size
    ),
    repairedSlides: 0,
    issues,
  });
}

function stripAllowedAssetUrls(html: string): string {
  let clean = html.replace(
    /data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi,
    ''
  );
  clean = clean.replace(
    /https?:\/\/[^"')\s]+\/v1\/assets\/images\/[a-f0-9]{24}\b/gi,
    ''
  );
  clean = clean.replace(/\/v1\/assets\/images\/[a-f0-9]{24}\b/gi, '');
  if (env.publicBaseUrl) {
    const escaped = escapeRegExp(env.publicBaseUrl.replace(/\/+$/, ''));
    clean = clean.replace(
      new RegExp(`${escaped}/v1/assets/images/[a-f0-9]{24}\\b`, 'gi'),
      ''
    );
  }
  return clean;
}

function issuesGroupedBySlide(qa: QaArtifact): Map<number, QaArtifact['issues']> {
  const groups = new Map<number, QaArtifact['issues']>();
  for (const issue of qa.issues) {
    const slideNumber = Math.max(1, Math.round(Number(issue.slideNumber) || 1));
    groups.set(slideNumber, [...(groups.get(slideNumber) ?? []), issue]);
  }
  return groups;
}

function compactSlideForRepair(
  slide: CloudDeckSlide,
  srcToken: string | null
): CloudDeckSlide {
  return {
    ...slide,
    title: compactText(slide.title, 96),
    subtitle: slide.subtitle ? compactText(slide.subtitle, 160) : slide.subtitle,
    body: slide.body ? compactText(slide.body, 260) : slide.body,
    bullets: (slide.bullets ?? [])
      .slice(0, 5)
      .map((bullet) => compactText(bullet, 130)),
    visual: slimVisualForPrompt(slide.visual, srcToken),
    html: summarizeHtml(slide.html),
    previewHtml: undefined,
    preview: undefined,
  };
}

function slimVisualForPrompt(
  visual: CloudDeckSlide['visual'],
  srcToken: string | null
): CloudDeckSlide['visual'] {
  if (!isRecord(visual)) return visual;
  const { imageAsset, ...rest } = visual as Record<string, unknown>;
  if (!isRecord(imageAsset)) return visual;
  const slimAsset: Record<string, unknown> = {
    id: imageAsset.id,
    slideNumber: imageAsset.slideNumber,
    width: imageAsset.width,
    height: imageAsset.height,
    orientation: imageAsset.orientation,
    dominantColor: imageAsset.dominantColor,
    attributionText: imageAsset.attributionText,
    altText: imageAsset.query,
  };
  if (srcToken) slimAsset.srcToken = srcToken;
  return { ...rest, imageAsset: slimAsset } as CloudDeckSlide['visual'];
}

function selectTemplateFlowPlan(
  ctx: RunContext,
  content: ContentArtifact
): TemplateFlowPlan | null {
  const context = ctx.artifacts.context;
  if (!isRecord(context) || !Array.isArray(context.designTemplates)) return null;
  const template = context.designTemplates.find(isRecord);
  if (!template || !isRecord(template.templateJson)) return null;

  const layouts = templateLayouts(template.templateJson);
  if (!layouts.length) return null;

  const flows = templateFlows(template.templateJson, layouts);
  const queryText = [
    ctx.input.deckType,
    ctx.input.designStyle,
    ctx.input.prompt,
    ctx.input.userPrompt,
    ctx.project.title,
    ctx.project.description,
    ...content.slides.flatMap((slide) => [
      slide.title,
      slide.subtitle,
      slide.visualSuggestion,
      ...slide.bullets,
    ]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const terms = new Set(
    queryText
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
  );
  const slideCount = content.slides.length;
  const selectedFlow = flows.length
    ? [...flows].sort((a, b) => {
        const scoreDiff =
          scoreTemplateFlow(b, terms, queryText, slideCount) -
          scoreTemplateFlow(a, terms, queryText, slideCount);
        if (scoreDiff) return scoreDiff;
        return a.name.localeCompare(b.name);
      })[0]
    : null;
  const allowedLayoutIds =
    selectedFlow?.layoutIds.filter((id) => layouts.some((layout) => layout.id === id)) ??
    layouts.map((layout) => layout.id);
  const allowedLayouts = allowedLayoutIds
    .map((id) => layouts.find((layout) => layout.id === id))
    .filter((layout): layout is TemplateLayoutOption => Boolean(layout));

  return {
    templateId: String(template.id ?? ''),
    templateName: stringValue(template.name),
    scenario: stringValue(template.scenario),
    flowId: selectedFlow?.id ?? null,
    flowName: selectedFlow?.name ?? null,
    reason: selectedFlow
      ? `Selected ${selectedFlow.name} because it best matches the deck type, prompt, and requested slide count.`
      : 'No recommended flow found; using the template layout vocabulary.',
    allowedLayoutIds,
    allowedLayouts: allowedLayouts.length ? allowedLayouts : layouts,
    allLayouts: layouts,
  };
}

function scoreTemplateFlow(
  flow: { id: string; name: string; description?: string | null; layoutIds: string[] },
  terms: Set<string>,
  queryText: string,
  slideCount: number
): number {
  const flowText = [flow.id, flow.name, flow.description, ...flow.layoutIds]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const term of terms) if (flowText.includes(term)) score += 1;
  if (queryText.includes(flow.id.replace(/_/g, ' '))) score += 5;
  if (slideCount <= 9 && /short|concise|compact/.test(flowText)) score += 4;
  if (slideCount >= 14 && /deep|dive|expanded|research|detailed/.test(flowText))
    score += 3;
  if (slideCount > 9 && slideCount < 14 && /standard|balanced|normal/.test(flowText))
    score += 2;
  return score;
}

function layoutCandidatesForSlide(
  plan: TemplateFlowPlan,
  slide: ContentSlide,
  index: number,
  slideCount: number
): TemplateLayoutOption[] {
  const layouts = plan.allowedLayouts.length ? plan.allowedLayouts : plan.allLayouts;
  const selected: TemplateLayoutOption[] = [];
  const addMatching = (patterns: RegExp[]) => {
    for (const layout of layouts) {
      const text = [layout.id, layout.name, layout.role, layout.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (patterns.some((pattern) => pattern.test(text))) selected.push(layout);
    }
  };
  const slideText = [
    slide.title,
    slide.subtitle,
    slide.visualSuggestion,
    ...slide.bullets,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (index === 0) addMatching([/title|opening|thesis|welcome|chapter/]);
  if (index === slideCount - 1)
    addMatching([/closing|decision|next|thank|contact|homework|preview|action/]);
  if (/metric|kpi|revenue|cost|budget|financial|forecast|valuation|roi|gdp|population|score|trend|performance/.test(slideText)) {
    addMatching([/metric|kpi|dashboard|financial|forecast|valuation|roi|budget|gdp|population|score|trend|performance|snapshot/]);
  }
  if (/risk|challenge|threat|mitigation|safeguard|issue|blocker/.test(slideText)) {
    addMatching([/risk|challenge|safeguard|issue|mitigation|control/]);
  }
  if (/timeline|roadmap|phase|milestone|history|schedule|agenda/.test(slideText)) {
    addMatching([/timeline|roadmap|milestone|history|schedule|agenda|program/]);
  }
  if (/compare|comparison|versus|option|swot|competitive/.test(slideText)) {
    addMatching([/comparison|compare|option|swot|competitive|matrix/]);
  }
  if (/exercise|quiz|question|answer|homework|student|teacher|lesson|vocabulary|reading|game|team/.test(slideText)) {
    addMatching([/exercise|quiz|question|answer|homework|student|teacher|lesson|vocabulary|reading|game|team|practice|role/]);
  }
  if (/map|country|regional|city|location|geography|market entry/.test(slideText)) {
    addMatching([/map|country|regional|city|location|geography|entry/]);
  }
  if (/team|founder|company|profile|service|client|partner/.test(slideText)) {
    addMatching([/team|founder|company|profile|service|client|partner/]);
  }

  const flowPosition = layouts[index % layouts.length];
  if (flowPosition) selected.push(flowPosition);
  return uniqueLayouts(selected).slice(0, 7);
}

function normalizeTemplateLayoutDecision(
  decision: LayoutArtifact['layouts'][number],
  candidates: TemplateLayoutOption[],
  plan: TemplateFlowPlan | null
): LayoutArtifact['layouts'][number] {
  if (!plan || !candidates.length) return decision;
  if (candidates.some((candidate) => candidate.id === decision.layoutId)) {
    return decision;
  }
  const fallback =
    candidates[0] ??
    plan.allowedLayouts[0] ??
    plan.allLayouts[0];
  if (!fallback) return decision;
  return {
    ...decision,
    layoutId: fallback.id,
    reason: [
      decision.reason,
      `Normalized to ${fallback.id} because template flow ${plan.flowId ?? 'selected'} only allows known template layout ids.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function templateFlowPlanForPrompt(ctx: RunContext): Record<string, unknown> | null {
  const plan = ctx.artifacts.templateFlowPlan;
  return isTemplateFlowPlan(plan) ? templateFlowForPrompt(plan) : null;
}

function templateFlowForPrompt(plan: TemplateFlowPlan): Record<string, unknown> {
  return {
    templateId: plan.templateId,
    templateName: plan.templateName,
    scenario: plan.scenario,
    flowId: plan.flowId,
    flowName: plan.flowName,
    reason: plan.reason,
    allowedLayoutIds: plan.allowedLayoutIds,
  };
}

function templateLayoutForPrompt(
  ctx: RunContext,
  layoutId: unknown
): TemplateLayoutOption | null {
  if (typeof layoutId !== 'string') return null;
  const plan = ctx.artifacts.templateFlowPlan;
  if (!isTemplateFlowPlan(plan)) return null;
  return (
    plan.allLayouts.find((layout) => layout.id === layoutId) ??
    plan.allowedLayouts.find((layout) => layout.id === layoutId) ??
    null
  );
}

function templateLayouts(templateJson: Record<string, unknown>): TemplateLayoutOption[] {
  if (!Array.isArray(templateJson.layouts)) return [];
  return templateJson.layouts
    .filter(isRecord)
    .map((layout) => ({
      id: String(layout.id ?? ''),
      name: stringValue(layout.name),
      role: stringValue(layout.role),
      description: stringValue(layout.description),
    }))
    .filter((layout) => layout.id);
}

function templateFlows(
  templateJson: Record<string, unknown>,
  layouts: TemplateLayoutOption[]
): Array<{ id: string; name: string; description?: string | null; layoutIds: string[] }> {
  const knownIds = new Set(layouts.map((layout) => layout.id));
  if (!Array.isArray(templateJson.recommendedFlows)) return [];
  return templateJson.recommendedFlows
    .filter(isRecord)
    .map((flow) => ({
      id: String(flow.id ?? ''),
      name: String(flow.name ?? flow.id ?? ''),
      description: stringValue(flow.description),
      layoutIds: Array.isArray(flow.layoutIds)
        ? flow.layoutIds
            .filter((id): id is string => typeof id === 'string' && knownIds.has(id))
        : [],
    }))
    .filter((flow) => flow.id && flow.name && flow.layoutIds.length);
}

function uniqueLayouts(layouts: TemplateLayoutOption[]): TemplateLayoutOption[] {
  const seen = new Set<string>();
  const unique: TemplateLayoutOption[] = [];
  for (const layout of layouts) {
    if (seen.has(layout.id)) continue;
    seen.add(layout.id);
    unique.push(layout);
  }
  return unique;
}

function isTemplateFlowPlan(value: unknown): value is TemplateFlowPlan {
  return (
    isRecord(value) &&
    typeof value.templateId === 'string' &&
    Array.isArray(value.allowedLayoutIds) &&
    Array.isArray(value.allowedLayouts) &&
    Array.isArray(value.allLayouts)
  );
}

function htmlDesignRules(): string[] {
  return [
    'Each slide is a single self-contained <section class="ydeck-slide"> element sized to a 1920px by 1080px canvas using inline style="width:1920px;height:1080px;position:relative;overflow:hidden;...".',
    'All CSS must be inline (style attributes or a <style scoped> tag inside the section). Never use scripts, iframes, external URLs, remote fonts, link tags, or unsafe attributes.',
    'Typography must be readable: titles 44-92px, body at least 28px, line-height 1.2-1.5, generous letter-spacing on display text.',
    'Compose each slide as a unique editorial layout. Vary the composition meaningfully from one slide to the next: change the grid, the color blocks, the type scale, the visual element, and the focal point. Never repeat the same title-over-bullets template twice in a row.',
    'Use real visual structure that fits the slide intent: hero blocks, multi-column grids, asymmetric splits, card stacks, stat callouts, quote frames, timelines, process flows, comparison tables, or diagrams.',
    'Add modern inline SVG icons, charts, sparklines, gauges, or schematic diagrams whenever the slide deals with metrics, steps, concepts, comparisons, or proof points. Prefer create_icon_visual for icon groups and create_chart for structured data; embed the returned static SVG/HTML inline. Avoid generic stars, emoji icons, crude hand-drawn icons, and browser-side icon/chart scripts.',
    'Use stored image assets from the provided imageAssets only when present; never reference Pexels, Unsplash, or any remote URL directly.',
    'Keep text content concise and faithful to the planned title, subtitle, bullets, and speakerNotes. Do not invent new facts, numbers, or quotes.',
    'Pick a coherent color palette per deck (background, surface, accent, text) and reuse it across slides while still varying the layout. Honor the requested designStyle when given.',
    'Use server-safe local font stacks only: sans = "Avenir Next", "Helvetica Neue", Arial, sans-serif; display = "Avenir Next", "Helvetica Neue", Arial, sans-serif; editorial serif = "New York", "Bodoni 72", Georgia, serif; body serif = Charter, Georgia, "Times New Roman", serif; mono = Menlo, "SF NS Mono", "Courier New", monospace; condensed = "Avenir Next Condensed", "DIN Condensed", "Arial Narrow", sans-serif; CJK = "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", sans-serif. Do not use unavailable remote-font names like Inter, JetBrains Mono, Playfair Display, Space Grotesk, IBM Plex Mono, or Archivo unless they are only followed by the server-safe stack.',
    'When designTemplates are provided, follow their DESIGN.md art-direction and per-layout coordinate contracts as the primary visual recipe, then use SKILL/checklist/layout guidance for behavior and QA. If selectedTemplateFlow is present, use only its allowed layout vocabulary and never force every layout option into the deck.',
    'When designSystems are provided, follow their DESIGN.md rules and token values as the primary visual constraints. Use workspace branding colors only where they do not conflict with the selected design system.',
  ];
}

function designTemplatesForPrompt(ctx: RunContext): Record<string, unknown>[] {
  const context = ctx.artifacts.context;
  if (!isRecord(context) || !Array.isArray(context.designTemplates)) return [];
  return context.designTemplates
    .filter(isRecord)
    .slice(0, 2)
    .map((template) => ({
      id: template.id,
      name: template.name,
      scenario: template.scenario,
      description: template.description,
      skillExcerpt: compactText(String(template.skillExcerpt ?? ''), 2600),
      designExcerpt: compactText(String(template.designExcerpt ?? ''), 3200),
      checklistExcerpt: compactText(
        String(template.checklistExcerpt ?? ''),
        1400
      ),
      layoutsExcerpt: compactText(String(template.layoutsExcerpt ?? ''), 1800),
      templateJson: compactTemplateJsonForPrompt(template.templateJson),
    }));
}

function compactTemplateJsonForPrompt(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return {
    slug: value.slug,
    name: value.name,
    scenario: value.scenario,
    layoutCount: value.layoutCount,
    recommendedFlows: value.recommendedFlows,
    layouts: value.layouts,
    palette: value.palette,
    typography: value.typography,
    charting: value.charting,
    icons: value.icons,
    capabilities: value.capabilities,
  };
}

function designSystemsForPrompt(ctx: RunContext): Record<string, unknown>[] {
  const context = ctx.artifacts.context;
  if (!isRecord(context) || !Array.isArray(context.designSystems)) return [];
  return context.designSystems
    .filter(isRecord)
    .slice(0, 3)
    .map((system) => ({
      id: system.id,
      name: system.name,
      category: system.category,
      description: system.description,
      designExcerpt: compactText(String(system.designExcerpt ?? ''), 2400),
      tokensExcerpt: compactText(String(system.tokensExcerpt ?? ''), 1400),
    }));
}

function summarizeContext(context: ContextArtifact) {
  return {
    project: context.project,
    preferences: context.preferences,
    branding: context.branding,
    installedPackCount: context.installedPacks.length,
    templatePackCount: context.templatePacks.length,
    designTemplates: context.designTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      scenario: template.scenario,
      description: template.description,
      layoutCount: template.layoutCount,
      recommendedFlows: Array.isArray(template.recommendedFlows)
        ? template.recommendedFlows
            .filter(isRecord)
            .map((flow) => ({
              id: flow.id,
              name: flow.name,
              layoutCount: Array.isArray(flow.layoutIds)
                ? flow.layoutIds.length
                : 0,
            }))
        : [],
    })),
    pluginPackCount: context.pluginPacks.length,
    designSystems: context.designSystems.map((system) => ({
      id: system.id,
      name: system.name,
      category: system.category,
      description: system.description,
    })),
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
      preview: slide.preview
        ? { ...slide.preview, html: summarizeHtml(slide.preview.html) }
        : undefined,
      visual: slimVisualForPrompt(slide.visual, null),
    })),
  };
}

function sanitizeArtifacts(
  artifacts: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(artifacts)) {
    if (key === 'design' && isRecord(value) && isRecord(value.deck))
      out[key] = {
        ...value,
        deck: stripHeavyHtml(value.deck as CloudDeckArtifact),
      };
    else out[key] = value;
  }
  return out;
}

function summarizeHtml(value?: string): string | undefined {
  if (!value) return undefined;
  return `[html chars=${value.length}] ${value
    .replace(/\s+/g, ' ')
    .slice(0, 220)}`;
}

function readInlineText(storageUrl?: string | null): string {
  if (!storageUrl?.startsWith('data:')) return '';
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(storageUrl);
  if (!match) return '';
  try {
    const buf = match[2]
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    return buf.toString('utf8').slice(0, 80_000);
  } catch {
    return '';
  }
}

function extractFacts(text: string): string[] {
  return text
    .split(/[\n.]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 24)
    .slice(0, 10);
}

function fileExtractionSchema() {
  return {
    safeParse(
      value: unknown
    ):
      | { success: true; data: FileExtractionArtifact }
      | { success: false; error: unknown } {
      if (!isRecord(value))
        return { success: false as const, error: 'not object' };
      return {
        success: true as const,
        data: {
          files: [],
          summary: String(value.summary ?? ''),
          keyFacts: toStringArray(value.keyFacts),
          suggestedSlides: toStringArray(value.suggestedSlides),
          importantSections: toStringArray(value.importantSections),
        },
      };
    },
  };
}

function researchEventPayload(
  research: ResearchArtifact
): Record<string, unknown> {
  return {
    researchId: research.researchId,
    status: research.status,
    summary: research.summary,
    sourceCount:
      research.sources.filter((source) => source.used).length ||
      research.sources.length,
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
      if (!isRecord(value) || !Array.isArray(value.slides))
        return { success: false as const, error: 'invalid deck' };
      const slides = value.slides.filter(isRecord).map(
        (slide, index): CloudDeckSlide => ({
          slideNumber: Number(slide.slideNumber ?? index + 1),
          slideType:
            typeof slide.slideType === 'string' ? slide.slideType : undefined,
          title: String(slide.title ?? `Slide ${index + 1}`).slice(0, 240),
          subtitle:
            typeof slide.subtitle === 'string'
              ? slide.subtitle.slice(0, 500)
              : undefined,
          bullets: toStringArray(slide.bullets).slice(0, 8),
          body:
            typeof slide.body === 'string'
              ? slide.body.slice(0, 2000)
              : undefined,
          speakerNotes:
            typeof slide.speakerNotes === 'string'
              ? slide.speakerNotes.slice(0, 2000)
              : undefined,
          layoutId:
            typeof slide.layoutId === 'string'
              ? slide.layoutId.slice(0, 120)
              : undefined,
          visual: isRecord(slide.visual) ? slide.visual : undefined,
          html:
            typeof slide.html === 'string'
              ? slide.html.slice(0, 30_000)
              : undefined,
          previewHtml:
            typeof slide.previewHtml === 'string'
              ? slide.previewHtml.slice(0, 40_000)
              : undefined,
        })
      );
      if (!slides.length)
        return { success: false as const, error: 'no slides' };
      return {
        success: true as const,
        data: {
          deckTitle: String(value.deckTitle ?? 'Untitled YDeck').slice(0, 255),
          deckType: String(value.deckType ?? 'general').slice(0, 80),
          designStyle: String(value.designStyle ?? 'modern').slice(0, 120),
          language: String(value.language ?? 'en').slice(0, 20),
          summary:
            typeof value.summary === 'string'
              ? value.summary.slice(0, 2000)
              : undefined,
          slides,
        },
      };
    },
  };
}

function slideForAgentSchema(fallback: CloudDeckSlide) {
  return {
    safeParse(
      value: unknown
    ):
      | { success: true; data: CloudDeckSlide }
      | { success: false; error: unknown } {
      if (!isRecord(value)) return { success: false, error: 'invalid slide' };
      const slide: CloudDeckSlide = {
        slideNumber: Number(value.slideNumber ?? fallback.slideNumber ?? 1),
        slideType:
          typeof value.slideType === 'string'
            ? value.slideType.slice(0, 80)
            : fallback.slideType,
        title: String(value.title ?? fallback.title ?? 'Untitled slide').slice(
          0,
          240
        ),
        subtitle:
          typeof value.subtitle === 'string'
            ? value.subtitle.slice(0, 500)
            : fallback.subtitle,
        bullets: Array.isArray(value.bullets)
          ? value.bullets.map(String).slice(0, 8)
          : fallback.bullets,
        body:
          typeof value.body === 'string'
            ? value.body.slice(0, 2000)
            : fallback.body,
        speakerNotes:
          typeof value.speakerNotes === 'string'
            ? value.speakerNotes.slice(0, 2000)
            : fallback.speakerNotes,
        layoutId:
          typeof value.layoutId === 'string'
            ? value.layoutId.slice(0, 120)
            : fallback.layoutId,
        visual: isRecord(value.visual)
          ? {
              ...(isRecord(fallback.visual) ? fallback.visual : {}),
              ...value.visual,
            }
          : fallback.visual,
        html:
          typeof value.html === 'string'
            ? value.html.slice(0, 30_000)
            : fallback.html,
        previewHtml:
          typeof value.previewHtml === 'string'
            ? value.previewHtml.slice(0, 40_000)
            : fallback.previewHtml,
        preview: isRecord(value.preview)
          ? (value.preview as CloudDeckSlide['preview'])
          : fallback.preview,
      };
      if (!slide.html && !slide.previewHtml)
        return { success: false, error: 'slide missing html' };
      return { success: true, data: slide };
    },
  };
}

function jsonPrompt(
  agent: string,
  input: unknown,
  instruction: string
): string {
  return [
    `You are the YDeck Cloud ${agent}.`,
    'Return only valid JSON. Do not wrap in markdown. Do not include commentary.',
    instruction,
    '',
    'Input:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  const raw = fenced ?? trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('No JSON object found in agent response.');
  }
}

async function auditAgent(
  ctx: RunContext,
  agent: CloudAgentName,
  phase: string,
  meta: Record<string, unknown>
): Promise<void> {
  await AuditLogModel.create({
    userId: null,
    workspaceId: ctx.job.workspaceId,
    action: `cloud.agent.${phase}`,
    targetType: 'deck_job',
    targetId: ctx.job.id,
    meta: { agent, ...meta },
  }).catch((err) => logger.warn({ err, agent }, 'cloud.agent.audit_failed'));
}

function logAgentFlow(jobId: string, label: string, data: unknown): void {
  if (!env.agentFlowLogOutput) return;
  // eslint-disable-next-line no-console
  console.log(
    `[ydeck-production:${jobId.slice(-6)}] ${label}`,
    JSON.stringify(redactAndTruncate(data), null, 2)
  );
}

function redactAndTruncate(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string')
    return value.length > 2000
      ? `${value.slice(0, 2000)}... [truncated]`
      : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactAndTruncate(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|authorization|password|token|secret/i.test(key))
      out[key] = '[redacted]';
    else out[key] = depth > 4 ? '[nested]' : redactAndTruncate(item, depth + 1);
  }
  return out;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function audienceForDeckType(deckType: string): string {
  const type = deckType.toLowerCase();
  if (type.includes('investor')) return 'investors';
  if (type.includes('education') || type.includes('lesson'))
    return 'teachers and learners';
  if (type.includes('sales')) return 'customers';
  if (type.includes('government')) return 'public sector stakeholders';
  return 'presentation audience';
}

function compactText(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= maxChars
    ? clean
    : `${clean.slice(0, maxChars - 1).trim()}...`;
}

function safeFileName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'ydeck'
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
