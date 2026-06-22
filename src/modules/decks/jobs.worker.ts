import { DeckJobModel, type JobStatus, type JobType } from "../../models";
import { logger } from "../../lib/logger";
import { jobBus } from "./jobs.events";
import { env } from "../../config/env";
import { runCloudProductionDeckJob } from "../agents/cloudProductionAgent";

const POLL_MS = 1000;

// Linear status progression per job type (PRD §6.4 stages).
const PIPELINE: Record<JobType, JobStatus[]> = {
  generate: ["queued", "parsing", "llm", "rendering", "done"],
  refine:   ["queued", "llm", "rendering", "done"],
  export:   ["queued", "exporting", "done"],
  share:    ["queued", "exporting", "done"],
};

async function advanceOne(): Promise<void> {
  // Pick the oldest non-terminal job and advance it by one stage.
  const job = await DeckJobModel.findOne({ status: { $nin: ["done", "error", "canceled"] } })
    .sort({ updatedAt: 1 });
  if (!job) return;

  if (await cancelStaleDevJob(job)) return;

  const input = (job.inputParams ?? {}) as Record<string, unknown>;
  const pipeline = input.pipeline ?? "agentic";
  if (env.agentLoopEnabled && pipeline === "agentic" && ["generate", "refine"].includes(job.type)) {
    try {
      await runCloudProductionDeckJob(job);
    } catch (err) {
      logger.warn({ err, jobId: job.id }, "job_worker.agentic_failed");
      await failJob(job.id, (err as Error).message);
    }
    return;
  }

  const fallbackPipeline = PIPELINE[job.type as JobType];
  const idx = fallbackPipeline.indexOf(job.status as JobStatus);
  if (idx < 0 || idx === fallbackPipeline.length - 1) {
    await finishJob(job.id, "done", 100);
    return;
  }

  const nextStatus = fallbackPipeline[idx + 1];
  const nextProgress = Math.round(((idx + 1) / (fallbackPipeline.length - 1)) * 100);

  job.status = nextStatus;
  job.progress = nextProgress;
  if (!job.startedAt) job.startedAt = new Date();
  job.finishedAt = nextStatus === "done" ? new Date() : null;
  await job.save();

  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    at: new Date().toISOString(),
  });
}

async function cancelStaleDevJob(job: Awaited<ReturnType<typeof DeckJobModel.findOne>>): Promise<boolean> {
  if (!job || env.nodeEnv === "production") return false;
  const maxAgeMs = Math.max(1, env.devJobResumeMaxAgeMinutes) * 60 * 1000;
  const createdAt = (job as unknown as { createdAt?: Date }).createdAt;
  const updatedAt = (job as unknown as { updatedAt?: Date }).updatedAt;
  const reference = job.status === "queued" ? createdAt ?? updatedAt : updatedAt ?? createdAt;
  if (!reference || Date.now() - reference.getTime() <= maxAgeMs) return false;

  const resultMeta = isRecord(job.resultMeta) ? job.resultMeta : {};
  const input = isRecord(job.inputParams) ? job.inputParams : {};
  const explicitlyContinued = resultMeta.retryType === "continue" || input.retryType === "continue" || input.continuedFromJobId || resultMeta.continuedFromJobId;
  if (explicitlyContinued) return false;

  job.status = "canceled";
  job.errorMessage = `Dev worker skipped stale job older than ${env.devJobResumeMaxAgeMinutes} minutes.`;
  job.finishedAt = new Date();
  job.resultMeta = {
    ...resultMeta,
    stoppedBy: "system",
    staleCanceledAt: new Date().toISOString(),
    staleCancelReason: "dev_worker_stale_job_guard",
    canContinue: true,
  };
  await job.save();
  logger.info({ jobId: job.id, updatedAt: reference }, "job_worker.dev_stale_job_canceled");
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    channel: "deck.canceled",
    payload: {
      reason: "dev_worker_stale_job_guard",
      canContinue: true,
      maxAgeMinutes: env.devJobResumeMaxAgeMinutes,
    },
    at: new Date().toISOString(),
  });
  return true;
}

async function failJob(jobId: string, message: string): Promise<void> {
  const job = await DeckJobModel.findById(jobId);
  if (!job) return;
  job.status = "error";
  job.progress = Math.max(job.progress, 1);
  job.errorMessage = message;
  job.finishedAt = new Date();
  await job.save();
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    errorMessage: message,
    at: new Date().toISOString(),
  });
}

async function finishJob(jobId: string, status: JobStatus, progress: number): Promise<void> {
  const job = await DeckJobModel.findById(jobId);
  if (!job) return;
  job.status = status;
  job.progress = progress;
  job.finishedAt = new Date();
  await job.save();
  jobBus.emitJob({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    at: new Date().toISOString(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function startJobWorker(): () => void {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await advanceOne();
    } catch (err) {
      logger.warn({ err }, "job_worker.tick_failed");
    } finally {
      if (!stopped) setTimeout(tick, POLL_MS);
    }
  };
  setTimeout(tick, POLL_MS);
  logger.info("job worker started");
  return () => {
    stopped = true;
    logger.info("job worker stopped");
  };
}
