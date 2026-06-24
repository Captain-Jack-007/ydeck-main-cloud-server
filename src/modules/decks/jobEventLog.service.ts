import { logger } from "../../lib/logger";
import {
  DeckJobEventCounterModel,
  DeckJobEventModel,
  DeckJobModel,
} from "../../models";
import type { JobEvent } from "./jobs.events";

const TERMINAL = new Set(["done", "error", "canceled"]);

export interface ClientJobEvent {
  seq: number;
  eventName: string;
  type: string;
  jobId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  data?: unknown;
  at: string;
}

export async function recordJobEvent(event: JobEvent): Promise<number | null> {
  try {
    const job = await DeckJobModel.findById(event.jobId)
      .select("projectId workspaceId")
      .lean();
    if (!job) return null;

    const counter = await DeckJobEventCounterModel.findOneAndUpdate(
      { jobId: event.jobId },
      {
        $inc: { seq: 1 },
        $set: {
          projectId: job.projectId,
          workspaceId: job.workspaceId,
        },
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );

    await DeckJobEventModel.create({
      jobId: event.jobId,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      seq: counter!.seq,
      channel: event.channel ?? null,
      status: event.status,
      progress: event.progress,
      errorMessage: event.errorMessage ?? null,
      payload: event.payload ?? null,
      emittedAt: new Date(event.at),
    });
    return counter!.seq;
  } catch (err) {
    logger.warn({ err, jobId: event.jobId }, "deck_job_event_log.persist_failed");
    return null;
  }
}

export async function listClientJobEvents(
  jobId: string,
  options: { afterSeq?: number; limit?: number } = {},
): Promise<ClientJobEvent[]> {
  const afterSeq = Math.max(0, Math.floor(options.afterSeq ?? 0));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 200)));
  const rows = await DeckJobEventModel.find({
    jobId,
    seq: { $gt: afterSeq },
  })
    .sort({ seq: 1 })
    .limit(limit)
    .lean();
  return rows.map(toClientJobEvent);
}

export function toClientJobEvent(row: {
  seq: number;
  channel?: string | null;
  jobId: string;
  status: string;
  progress?: number | null;
  errorMessage?: string | null;
  payload?: unknown;
  emittedAt?: Date | string | null;
}): ClientJobEvent {
  const at = toIso(row.emittedAt) ?? new Date().toISOString();
  const progress = row.progress ?? 0;
  const channel = row.channel ?? null;

  if (channel === "deck.artifact") {
    return {
      seq: row.seq,
      eventName: "deck:artifact",
      type: "deck.artifact",
      jobId: row.jobId,
      status: row.status,
      progress,
      data: row.payload,
      at,
    };
  }

  if (channel === "agent.loop") {
    return {
      seq: row.seq,
      eventName: "agent:loop",
      type: "agent.loop",
      jobId: row.jobId,
      status: row.status,
      progress,
      data: row.payload,
      at,
    };
  }

  if (channel === "run.summary") {
    return {
      seq: row.seq,
      eventName: "deck:done",
      type: "run.summary",
      jobId: row.jobId,
      status: row.status,
      progress,
      data: row.payload,
      at,
    };
  }

  const named = mapNamedDeckEvent(channel ?? undefined);
  if (named && channel) {
    return {
      seq: row.seq,
      eventName: named,
      type: channel,
      jobId: row.jobId,
      status: row.status,
      progress,
      data: row.payload,
      at,
    };
  }

  if (channel) {
    return {
      seq: row.seq,
      eventName: channel,
      type: channel,
      jobId: row.jobId,
      status: row.status,
      progress,
      data: row.payload,
      at,
    };
  }

  if (TERMINAL.has(row.status)) {
    return {
      seq: row.seq,
      eventName:
        row.status === "done"
          ? "deck:done"
          : row.status === "canceled"
          ? "deck:canceled"
          : "deck:error",
      type: "job.status",
      jobId: row.jobId,
      status: row.status,
      progress,
      errorMessage: row.errorMessage ?? null,
      at,
    };
  }

  return {
    seq: row.seq,
    eventName: "deck:status",
    type: "job.status",
    jobId: row.jobId,
    status: row.status,
    progress,
    errorMessage: row.errorMessage ?? null,
    at,
  };
}

function mapNamedDeckEvent(channel?: string): string | null {
  switch (channel) {
    case "deck.plan":
      return "deck:plan";
    case "deck.context":
      return "deck:context";
    case "deck.skill":
      return "deck:skill";
    case "deck.file":
      return "deck:file";
    case "deck.research":
      return "deck:research";
    case "deck.outline":
      return "deck:outline";
    case "deck.content":
      return "deck:content";
    case "deck.qa":
      return "deck:qa";
    case "deck.repair":
      return "deck:repair";
    case "deck.asset":
      return "deck:asset";
    case "deck.version":
      return "deck:version";
    case "deck.export":
      return "deck:export";
    case "deck.done":
      return "deck:done";
    case "deck.error":
      return "deck:error";
    default:
      return null;
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
