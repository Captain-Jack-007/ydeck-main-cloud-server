import { AuditLogModel, DeckJobModel, DeckProjectModel, type DeckJobDoc } from "../../models";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { jobBus } from "../decks/jobs.events";
import { getCloudLlmProvider } from "./cloudLlm";
import { runAgentLoop, type AgentEvent, type AgentMessage, type ToolAuditEvent } from "./loop/runAgentLoop";
import { buildEffectiveToolPolicy } from "./loop/toolPolicy";
import { bootstrapTools } from "./tools";
import type { ToolContext } from "./tools/types";

export async function runCloudDeckAgentJob(job: DeckJobDoc): Promise<void> {
  bootstrapTools();
  const project = await DeckProjectModel.findById(job.projectId).lean();
  if (!project) throw new Error("Project not found for deck job.");

  await setJobState(job, "llm", 35);

  const provider = getCloudLlmProvider();
  const prompt = buildJobPrompt(job, {
    title: project.title,
    description: project.description ?? undefined,
    templateId: project.templateId ?? undefined,
    meta: project.meta ?? undefined,
  });

  const callLLM = async (nextPrompt: string, _history: AgentMessage[]) => {
    return provider.generate(nextPrompt, { temperature: 0.4, maxTokens: 3500 });
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
    onEvent,
    onToolEvent,
  });

  await setJobState(job, "rendering", 85);
  const fresh = await DeckJobModel.findById(job.id);
  const resultMeta = (fresh?.resultMeta ?? null) as Record<string, unknown> | null;
  if (!resultMeta?.deckArtifact) {
    throw new Error("Cloud deck agent finished without saving a deck artifact.");
  }

  await DeckJobModel.findByIdAndUpdate(job.id, {
    $set: {
      status: "done",
      progress: 100,
      finishedAt: new Date(),
      resultMeta: {
        ...resultMeta,
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
    payload: { rounds: result.rounds, toolCalls: result.toolCalls.length, stoppedReason: result.stoppedReason },
    at: new Date().toISOString(),
  });
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
    "Return the final deck by calling create_deck for new generation or update_deck for refinement.",
    "Each slide should have a clear title, concise bullets, and useful speakerNotes when helpful.",
  ]
    .filter(Boolean)
    .join("\n");
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
