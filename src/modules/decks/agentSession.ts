import {
  AuditLogModel,
  DeckJobModel,
  type DeckProjectDoc,
} from "../../models";

export interface AgentSessionOptions {
  includeArtifacts?: boolean;
}

interface AgentEvent {
  at: string;
  phase: string;
  meta: Record<string, unknown>;
}

interface AgentTimelineEntry {
  agent: string;
  status: "started" | "completed" | "errored";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  promptChars: number | null;
  responseChars: number | null;
  error: string | null;
  events: AgentEvent[];
}

const AUDIT_ACTION_PREFIX = "cloud.agent.";

export async function buildAgentSession(
  project: DeckProjectDoc,
  options: AgentSessionOptions = {},
): Promise<Record<string, unknown>> {
  const jobs = await DeckJobModel.find({ projectId: project.id })
    .sort({ createdAt: 1 })
    .lean();

  const jobIds = jobs.map((j) => String(j._id));
  const auditRows = jobIds.length
    ? await AuditLogModel.find({
        targetType: "deck_job",
        targetId: { $in: jobIds },
        action: { $regex: `^${AUDIT_ACTION_PREFIX}` },
      })
        .sort({ createdAt: 1 })
        .lean()
    : [];

  const auditByJob = new Map<string, typeof auditRows>();
  for (const row of auditRows) {
    const key = String(row.targetId);
    const list = auditByJob.get(key) ?? [];
    list.push(row);
    auditByJob.set(key, list);
  }

  const jobSessions = jobs.map((job) => {
    const jobId = String(job._id);
    const rows = auditByJob.get(jobId) ?? [];
    const productionFlow = isRecord(job.resultMeta)
      ? (job.resultMeta.productionFlow as Record<string, unknown> | undefined)
      : undefined;
    const toolUsage = Array.isArray(productionFlow?.toolUsage)
      ? productionFlow.toolUsage
      : [];

    return {
      jobId,
      type: job.type,
      status: job.status,
      progress: job.progress ?? 0,
      pipeline: isRecord(job.inputParams)
        ? job.inputParams.pipeline ?? null
        : null,
      createdAt: toIso(job.createdAt),
      startedAt: toIso(job.startedAt),
      finishedAt: toIso(job.finishedAt),
      errorMessage: job.errorMessage ?? null,
      input: summarizeInput(job.inputParams),
      agents: buildAgentTimeline(rows),
      toolUsage,
      ...(options.includeArtifacts
        ? { artifacts: productionFlow?.artifacts ?? null }
        : {}),
    };
  });

  return {
    projectId: project.id,
    title: project.title,
    description: project.description ?? null,
    createdAt: toIso(project.get("createdAt")),
    jobCount: jobSessions.length,
    jobs: jobSessions,
  };
}

function buildAgentTimeline(
  rows: Array<Record<string, unknown>>,
): AgentTimelineEntry[] {
  const byAgent = new Map<string, AgentEvent[]>();
  for (const row of rows) {
    const meta = isRecord(row.meta) ? row.meta : {};
    const agent = typeof meta.agent === "string" ? meta.agent : "unknown";
    const action = String(row.action ?? "");
    const phase = action.startsWith(AUDIT_ACTION_PREFIX)
      ? action.slice(AUDIT_ACTION_PREFIX.length)
      : action;
    const list = byAgent.get(agent) ?? [];
    list.push({
      at: toIso(row.createdAt) ?? new Date().toISOString(),
      phase,
      meta: { ...meta },
    });
    byAgent.set(agent, list);
  }
  return Array.from(byAgent.entries()).map(([agent, events]) => {
    const started = events.find((e) => e.phase === "started") ?? null;
    const terminal =
      [...events].reverse().find(
        (e) => e.phase === "completed" || e.phase === "errored",
      ) ?? null;
    const startedAt = started?.at ?? null;
    const completedAt = terminal?.at ?? null;
    return {
      agent,
      status: (terminal?.phase ?? "started") as AgentTimelineEntry["status"],
      startedAt,
      completedAt,
      durationMs:
        startedAt && completedAt
          ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
          : null,
      promptChars: numberOrNull(started?.meta.promptChars),
      responseChars: numberOrNull(terminal?.meta.responseChars),
      error:
        terminal?.phase === "errored"
          ? String(terminal.meta.detail ?? terminal.meta.reason ?? "")
          : null,
      events,
    };
  });
}

function summarizeInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const {
    prompt,
    userPrompt,
    editInstruction,
    deckType,
    designStyle,
    language,
    slideCount,
    generationMode,
    researchMode,
    pipeline,
    mode,
    cloudProvider,
    cloudModel,
  } = value;
  return {
    prompt: prompt ?? userPrompt ?? editInstruction ?? null,
    deckType: deckType ?? null,
    designStyle: designStyle ?? null,
    language: language ?? null,
    slideCount: slideCount ?? null,
    generationMode: generationMode ?? null,
    researchMode: researchMode ?? null,
    pipeline: pipeline ?? null,
    mode: mode ?? null,
    cloudProvider: cloudProvider ?? null,
    cloudModel: cloudModel ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
