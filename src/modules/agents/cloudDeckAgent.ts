import { AuditLogModel, DeckJobModel, DeckProjectModel, type DeckJobDoc } from "../../models";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { jobBus } from "../decks/jobs.events";
import { effectiveCloudConfig, getCloudLlmProvider } from "./cloudLlm";
import { runAgentLoop, type AgentEvent, type AgentFlowTraceEvent, type AgentMessage, type ToolAuditEvent } from "./loop/runAgentLoop";
import { buildEffectiveToolPolicy } from "./loop/toolPolicy";
import { bootstrapTools, executeRegisteredTool } from "./tools";
import type { ToolContext } from "./tools/types";

export async function runCloudDeckAgentJob(job: DeckJobDoc): Promise<void> {
  bootstrapTools();
  const project = await DeckProjectModel.findById(job.projectId).lean();
  if (!project) throw new Error("Project not found for deck job.");

  await setJobState(job, "llm", 35);

  const cloudConfig = await effectiveCloudConfig();
  const provider = await getCloudLlmProvider(cloudConfig);
  const prompt = buildJobPrompt(job, {
    title: project.title,
    description: project.description ?? undefined,
    templateId: project.templateId ?? undefined,
    meta: project.meta ?? undefined,
  });
  const visiblePlan = buildVisiblePlan(job, {
    title: project.title,
    description: project.description ?? undefined,
  });
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    channel: "deck.plan",
    payload: visiblePlan.plan,
    at: new Date().toISOString(),
  });
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    channel: "deck.outline",
    payload: visiblePlan.outline,
    at: new Date().toISOString(),
  });
  logAgentFlow(job.id, "job.input", {
    provider: provider.name,
    model: provider.model,
    projectId: String(job.projectId),
    workspaceId: String(job.workspaceId),
    inputParams: job.inputParams ?? null,
    project: {
      title: project.title,
      description: project.description ?? null,
      templateId: project.templateId ?? null,
    },
  });

  const callLLM = async (nextPrompt: string, _history: AgentMessage[]) => {
    return provider.generate(nextPrompt, { temperature: 0.55, maxTokens: env.llmMaxTokens });
  };

  const publish = ({ channel, payload }: { channel: string; payload: unknown }) => {
    jobBus.emitJob({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      channel,
      payload,
      at: new Date().toISOString(),
    });
  };

  const ctx: ToolContext = {
    projectId: String(job.projectId),
    jobId: job.id,
    workspaceId: String(job.workspaceId),
    userRole: "user",
    mode: "full",
    requestId: job.id,
    publish,
  };
  const policy = buildEffectiveToolPolicy({
    lastUserMessage: prompt,
    mode: "full",
  });

  const onToolEvent = (e: ToolAuditEvent) => {
    void AuditLogModel.create({
      userId: null,
      workspaceId: job.workspaceId,
      action: `agent.tool.${e.phase}`,
      targetType: "deck_job",
      targetId: job.id,
      meta: {
        round: e.round,
        tool: e.name,
        dialect: e.dialect,
        argKeys: e.argKeys,
        argsBytes: e.argsBytes,
        ok: e.ok,
        error: e.error,
        contentBytes: e.contentBytes,
        ms: e.ms,
      },
    }).catch((err) => logger.warn({ err }, "agent.audit_failed"));
  };

  const onEvent = (event: AgentEvent) => {
    jobBus.emitJob({
      jobId: job.id,
      status: event.type === "error" ? "error" : job.status,
      progress: job.progress,
      channel: "agent.loop",
      payload: event,
      at: new Date().toISOString(),
    });
  };

  const result = await runAgentLoop({
    messages: [{ role: "user", content: prompt }],
    llm: callLLM,
    ctx,
    policy,
    maxRounds: env.agentLoopMaxRounds,
    k: env.agentLoopMaxTools,
    alwaysInclude: ["inspect_project", "read_workspace_context", "list_packs", "design_deck", "create_deck", "update_deck"],
    onEvent,
    onToolEvent,
    onTrace: (event) => logAgentTrace(job.id, event),
  });

  await setJobState(job, "rendering", 85);
  let fresh = await DeckJobModel.findById(job.id);
  let resultMeta = (fresh?.resultMeta ?? null) as Record<string, unknown> | null;
  if (!resultMeta?.deckArtifact && result.stoppedReason !== "error") {
    const fallbackDeck = buildFallbackDeckArtifact(job, {
      title: project.title,
      description: project.description ?? undefined,
    });
    logAgentFlow(job.id, "fallback.design_deck.send", {
      reason: "agent_finished_without_artifact",
      deck: fallbackDeck,
    });
    onEvent({
      type: "tool.call",
      data: { name: "design_deck", dialect: "fallback", reason: "agent_finished_without_artifact" },
    });
    const fallback = await executeRegisteredTool(
      "design_deck",
      { deck: fallbackDeck, targetScore: 85, maxAttempts: 3 },
      ctx,
    );
    logAgentFlow(job.id, "fallback.design_deck.receive", fallback);
    result.toolCalls.push({ name: "design_deck", result: fallback });
    onEvent({
      type: "tool.result",
      data: { name: "design_deck", ok: fallback.ok, content: fallback.content, fallback: true },
    });
    fresh = await DeckJobModel.findById(job.id);
    resultMeta = (fresh?.resultMeta ?? null) as Record<string, unknown> | null;
  }
  if (!resultMeta?.deckArtifact) {
    if (result.stoppedReason === "error") {
      throw new Error(`Cloud deck agent LLM failed before saving a deck artifact: ${result.text || "provider error"}`);
    }
    throw new Error("Cloud deck agent finished without saving a deck artifact.");
  }

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
        },
        agent: {
          text: result.text,
          rounds: result.rounds,
          stoppedReason: result.stoppedReason,
          selectedTools: result.selectedTools,
          toolCalls: result.toolCalls.map((t) => ({ name: t.name, ok: t.result.ok, error: t.result.error })),
        },
      },
    },
  });
  jobBus.emitJob({
    jobId: job.id,
    status: "done",
    progress: 100,
    channel: "run.summary",
    payload: {
      provider: provider.name,
      model: provider.model,
      rounds: result.rounds,
      toolCalls: result.toolCalls.length,
      stoppedReason: result.stoppedReason,
    },
    at: new Date().toISOString(),
  });
  logAgentFlow(job.id, "job.done", {
    provider: provider.name,
    model: provider.model,
    rounds: result.rounds,
    stoppedReason: result.stoppedReason,
    toolCalls: result.toolCalls.map((t) => ({ name: t.name, ok: t.result.ok, error: t.result.error })),
  });
}

function logAgentTrace(jobId: string, event: AgentFlowTraceEvent): void {
  const label = `${event.kind}.${event.direction}${event.name ? `.${event.name}` : ""}.round${event.round}`;
  logAgentFlow(jobId, label, { chars: event.chars, ...safeTraceData(event.data) });
}

function logAgentFlow(jobId: string, label: string, data: unknown): void {
  if (!env.agentFlowLogOutput) return;
  const prefix = `[ydeck-agentic:${jobId.slice(-6)}] ${label}`;
  // eslint-disable-next-line no-console
  console.log(prefix, JSON.stringify(redactAndTruncate(data), null, 2));
}

function safeTraceData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}

function redactAndTruncate(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(truncateString(value, depth === 0 ? 4_000 : 1_200));
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const max = depth > 2 ? 8 : 24;
    const items = value.slice(0, max).map((item) => redactAndTruncate(item, depth + 1));
    return value.length > max ? [...items, `... ${value.length - max} more items`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|authorization|password|token|secret/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (/html|previewHtml/i.test(key) && typeof item === "string") {
      out[key] = summarizeHtml(item);
      continue;
    }
    out[key] = depth >= 5 ? summarizeValue(item) : redactAndTruncate(item, depth + 1);
  }
  return out;
}

function summarizeValue(value: unknown): unknown {
  if (typeof value === "string") return truncateString(redactString(value), 400);
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (value && typeof value === "object") return `[object:${Object.keys(value).length}]`;
  return value;
}

function summarizeHtml(html: string): string {
  const cleaned = html.replace(/\s+/g, " ").trim();
  return `[html chars=${html.length}] ${truncateString(redactString(cleaned), 700)}`;
}

function truncateString(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[redacted]")
    .replace(/(api[_-]?key['\"=: ]+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]");
}

function buildJobPrompt(
  job: DeckJobDoc,
  project: { title: string; description?: string; templateId?: string; meta?: unknown },
): string {
  const input = (job.inputParams ?? {}) as Record<string, unknown>;
  const prompt = String(input.prompt ?? input.userPrompt ?? project.description ?? project.title);
  const slideCount = Number(input.slideCount ?? input.slides ?? 10);
  const deckType = String(input.deckType ?? "general");
  const designStyle = String(input.designStyle ?? input.style ?? "modern");
  const language = String(input.language ?? "en");
  const existing =
    typeof project.meta === "object" && project.meta !== null && "deckArtifact" in project.meta
      ? JSON.stringify((project.meta as { deckArtifact?: unknown }).deckArtifact)
      : "none";
  const verb = job.type === "refine" ? "Refine the existing deck" : "Create a new deck";

  return [
    `${verb} for this YDeck cloud project.`,
    "",
    `Project: ${project.title}`,
    project.description ? `Description: ${project.description}` : undefined,
    project.templateId ? `Template: ${project.templateId}` : undefined,
    `User request: ${prompt}`,
    `Deck type: ${deckType}`,
    `Design style: ${designStyle}`,
    `Language: ${language}`,
    `Target slide count: ${Number.isFinite(slideCount) ? slideCount : 10}`,
    `Existing deck artifact: ${existing}`,
    "",
    "Return the final deck by calling design_deck for new generation. For refinement, call design_deck with the revised full deck unless the user explicitly asks for text-only changes.",
    "Use create_deck/update_deck only as a fallback when design_deck is unavailable.",
    "You are responsible for visual slide design, not only the text. Each slide must include content AND a designed `html` field.",
    "The `html` field must be a complete self-contained 16:9 slide preview as a single <section class=\"ydeck-slide\">...</section> string.",
    "Use inline CSS or a <style> tag inside the section. Target 1920x1080 px. Do not use external images, external fonts, scripts, iframes, or remote URLs.",
    "Design each slide visually: strong layout, background, typography, spacing, color accents, cards/charts/timelines/stat blocks when appropriate.",
    "Use different compositions across the deck: title hero, section divider, two-column argument, card grid, metric/stat slide, timeline/process, comparison, and closing CTA as appropriate.",
    "The HTML must be presentation-quality and iframe-preview ready. It should not rely on the frontend to apply a theme.",
    "Avoid blank white slides. Do not return placeholder words like 'content'.",
    "Still include title, subtitle/bullets/body, speakerNotes, slideType, layoutId, and visual metadata so the editor can inspect structure.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackDeckArtifact(
  job: DeckJobDoc,
  project: { title: string; description?: string },
) {
  const input = (job.inputParams ?? {}) as Record<string, unknown>;
  const prompt = String(input.prompt ?? input.userPrompt ?? project.description ?? project.title);
  const slideCount = Math.max(1, Math.min(Number(input.slideCount ?? input.slides ?? 6) || 6, 12));
  const deckTitle = String(input.title ?? project.title ?? prompt.slice(0, 90) ?? "Untitled YDeck");
  const deckType = String(input.deckType ?? "general");
  const designStyle = String(input.designStyle ?? input.style ?? "modern");
  const language = String(input.language ?? "en");
  const slides = fallbackSlidePlan(deckTitle, prompt, slideCount);
  return {
    deckTitle,
    deckType,
    designStyle,
    language,
    summary: "Generated with the deterministic YDeck fallback because the cloud agent did not persist a deck artifact.",
    slides,
  };
}

function buildVisiblePlan(
  job: DeckJobDoc,
  project: { title: string; description?: string },
) {
  const input = (job.inputParams ?? {}) as Record<string, unknown>;
  const prompt = String(input.prompt ?? input.userPrompt ?? project.description ?? project.title);
  const slideCount = Math.max(1, Math.min(Number(input.slideCount ?? input.slides ?? 10) || 10, 100));
  const deckTitle = String(input.title ?? project.title ?? prompt.slice(0, 90) ?? "Untitled YDeck");
  const deckType = String(input.deckType ?? "general");
  const designStyle = String(input.designStyle ?? input.style ?? "modern");
  const language = String(input.language ?? "en");
  const outlineSlides = fallbackSlidePlan(deckTitle, prompt, Math.min(slideCount, 12)).map((slide) => ({
    slideNumber: slide.slideNumber,
    slideType: slide.slideType,
    title: slide.title,
    purpose: purposeForSlide(slide.slideType, slide.title),
  }));
  return {
    plan: {
      deckTitle,
      deckType,
      audience: audienceForDeckType(deckType),
      language,
      slideCount,
      style: designStyle,
      summary: `Creating a ${slideCount}-slide ${labelizeForPlan(deckType)} deck in ${labelizeForPlan(designStyle)} style.`,
      steps: [
        "Analyze prompt",
        "Create outline",
        "Write slide content",
        "Choose layouts",
        "Generate visual previews",
        "Run design QA",
        "Save final deck",
      ],
    },
    outline: {
      title: deckTitle,
      deckType,
      language,
      slideCount,
      slides: outlineSlides,
      status: "draft",
    },
  };
}

function purposeForSlide(type: string | undefined, title: string): string {
  const normalized = String(type ?? "").toLowerCase();
  if (normalized.includes("title")) return "Introduce the deck and positioning.";
  if (normalized.includes("problem")) return "Explain the core pain point.";
  if (normalized.includes("solution")) return "Show the proposed answer.";
  if (normalized.includes("process")) return "Explain the workflow or sequence.";
  if (normalized.includes("metric")) return "Highlight measurable proof or quality targets.";
  if (normalized.includes("closing")) return "Close with next steps.";
  return `Develop the point: ${title}.`;
}

function audienceForDeckType(deckType: string): string {
  const type = deckType.toLowerCase();
  if (type.includes("investor")) return "investors";
  if (type.includes("education") || type.includes("lesson")) return "teachers and learners";
  if (type.includes("government")) return "public sector stakeholders";
  if (type.includes("sales")) return "customers";
  return "presentation audience";
}

function labelizeForPlan(value: string): string {
  return value.replace(/[_-]+/g, " ");
}

function fallbackSlidePlan(deckTitle: string, prompt: string, slideCount: number) {
  const core = [
    {
      slideType: "title",
      title: deckTitle,
      subtitle: compactPrompt(prompt, 150),
      bullets: ["Clear story", "Designed HTML preview", "Ready for refinement"],
      speakerNotes: "Open with the core promise and audience context.",
    },
    {
      slideType: "problem",
      title: "Why This Matters",
      bullets: ["Current workflows waste attention", "Teams need faster presentation drafts", "Design quality must be checked before export"],
      speakerNotes: "Explain the pain and why solving it now matters.",
    },
    {
      slideType: "solution",
      title: "YDeck Approach",
      bullets: ["Plan the story", "Design each slide in HTML", "Preview and repair before final output"],
      speakerNotes: "Describe the generation loop at a high level.",
    },
    {
      slideType: "process",
      title: "Generation Loop",
      bullets: ["Generate content", "Render HTML", "Run design QA", "Repair and save"],
      speakerNotes: "Show that the system improves the deck instead of stopping at first draft.",
    },
    {
      slideType: "metrics",
      title: "Quality Targets",
      bullets: ["Readable typography", "No unsafe HTML", "Consistent layout", "Preview-ready artifact"],
      speakerNotes: "Focus on practical quality gates.",
    },
    {
      slideType: "closing",
      title: "Next Step",
      bullets: ["Review live previews", "Refine slide text", "Export when ready"],
      speakerNotes: "Close with the next action for the user.",
    },
  ];
  return Array.from({ length: slideCount }, (_, index) => ({
    slideNumber: index + 1,
    ...(core[index] ?? {
      slideType: "content",
      title: `Key Point ${index + 1}`,
      bullets: ["Important idea", "Supporting proof", "Recommended action"],
      speakerNotes: "Use this slide to develop the supporting story.",
    }),
  }));
}

function compactPrompt(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

async function setJobState(job: DeckJobDoc, status: "llm" | "rendering", progress: number): Promise<void> {
  await DeckJobModel.findByIdAndUpdate(job.id, {
    $set: {
      status,
      progress,
      startedAt: job.startedAt ?? new Date(),
    },
  });
  job.status = status;
  job.progress = progress;
  job.startedAt = job.startedAt ?? new Date();
  jobBus.emitJob({ jobId: job.id, status, progress, at: new Date().toISOString() });
}
