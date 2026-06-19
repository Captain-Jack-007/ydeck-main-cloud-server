import { DeckJobModel, type JobStatus, type JobType } from "../../models";
import { logger } from "../../lib/logger";
import { jobBus } from "./jobs.events";
import { env } from "../../config/env";
import { runCloudDeckAgentJob } from "../agents/cloudDeckAgent";

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

  const input = (job.inputParams ?? {}) as Record<string, unknown>;
  const pipeline = input.pipeline ?? "agentic";
  if (env.agentLoopEnabled && pipeline === "agentic" && ["generate", "refine"].includes(job.type)) {
    try {
      await runCloudDeckAgentJob(job);
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
