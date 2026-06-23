import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import { env } from "../../config/env";
import { verifyAccessToken } from "../../lib/jwt";
import { DeckJobModel, WorkspaceMemberModel, type DeckJobDoc } from "../../models";
import { jobBus, type JobEvent } from "../decks/jobs.events";
import { listClientJobEvents } from "../decks/jobEventLog.service";

interface AuthedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
}

const TERMINAL = new Set(["done", "error", "canceled"]);

export function attachRealtimeServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/realtime",
    cors: {
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  io.use((socket: AuthedSocket, next) => {
    const token = extractSocketToken(socket);
    if (!token) return next(new Error("Missing access token"));
    try {
      const payload = verifyAccessToken(token);
      socket.user = {
        id: payload.sub,
        email: payload.email,
        isAdmin: payload.isAdmin,
      };
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    socket.on("deck:subscribe", async (payload: { jobId?: string; afterSeq?: number }, ack?: (response: unknown) => void) => {
      try {
        if (!socket.user) throw new Error("Unauthenticated socket");
        const jobId = payload?.jobId;
        if (!jobId) throw new Error("jobId is required");

        const job = await loadJobForSocket(jobId, socket.user.id);
        const room = jobRoom(job.id);
        await socket.join(room);

        const snapshot = jobToStatus(job);
        socket.emit("deck:status", snapshot);
        const afterSeq =
          typeof payload.afterSeq === "number" && Number.isFinite(payload.afterSeq)
            ? Math.max(0, Math.floor(payload.afterSeq))
            : null;
        let replayed = 0;
        let nextSeq = afterSeq ?? 0;
        if (afterSeq !== null) {
          const events = await listClientJobEvents(job.id, { afterSeq, limit: 500 });
          for (const event of events) {
            socket.emit(event.eventName, event);
            socket.emit("deck:event", event);
            replayed += 1;
            nextSeq = event.seq;
          }
        }
        ack?.({ ok: true, job: snapshot, replayed, nextSeq });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to subscribe";
        ack?.({ ok: false, error: message });
        socket.emit("deck:error", { errorMessage: message });
      }
    });

    socket.on("deck:unsubscribe", async (payload: { jobId?: string }, ack?: (response: unknown) => void) => {
      const jobId = payload?.jobId;
      if (jobId) await socket.leave(jobRoom(jobId));
      ack?.({ ok: true });
    });
  });

  const onJobEvent = (event: JobEvent): void => {
    const mapped = mapJobEvent(event);
    io.to(jobRoom(event.jobId)).emit(mapped.name, mapped.payload);
    io.to(jobRoom(event.jobId)).emit("deck:event", mapped.payload);
  };

  jobBus.on("job:any", onJobEvent);
  httpServer.on("close", () => {
    jobBus.off("job:any", onJobEvent);
    io.close();
  });

  return io;
}

function extractSocketToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;

  const queryToken = socket.handshake.query.token;
  if (typeof queryToken === "string" && queryToken) return queryToken;

  const header = socket.handshake.headers.authorization;
  if (typeof header === "string") {
    const [scheme, token] = header.split(" ");
    if (scheme === "Bearer" && token) return token;
  }

  return null;
}

async function loadJobForSocket(jobId: string, userId: string): Promise<DeckJobDoc> {
  const job = await DeckJobModel.findById(jobId);
  if (!job) throw new Error("Job not found");

  const membership = await WorkspaceMemberModel.findOne({
    workspaceId: job.workspaceId,
    userId,
  });
  if (!membership) throw new Error("Not a member of this workspace");

  return job;
}

function jobRoom(jobId: string): string {
  return `deck-job:${jobId}`;
}

function jobToStatus(job: DeckJobDoc) {
  return {
    type: "job.status",
    jobId: job.id,
    projectId: String(job.projectId),
    workspaceId: String(job.workspaceId),
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    at: new Date().toISOString(),
  };
}

function mapJobEvent(event: JobEvent): { name: string; payload: unknown } {
  if (event.channel === "deck.artifact") {
    return {
      name: "deck:artifact",
      payload: {
        seq: event.seq,
        type: "deck.artifact",
        jobId: event.jobId,
        data: event.payload,
        at: event.at,
      },
    };
  }

  if (event.channel === "agent.loop") {
    return {
      name: "agent:loop",
      payload: {
        seq: event.seq,
        type: "agent.loop",
        jobId: event.jobId,
        data: event.payload,
        at: event.at,
      },
    };
  }

  if (event.channel === "run.summary") {
    return {
      name: "deck:done",
      payload: {
        seq: event.seq,
        type: "run.summary",
        jobId: event.jobId,
        status: event.status,
        progress: event.progress,
        data: event.payload,
        at: event.at,
      },
    };
  }

  const namedDeckEvent = mapNamedDeckEvent(event.channel);
  if (namedDeckEvent) {
    return {
      name: namedDeckEvent,
      payload: {
        seq: event.seq,
        type: event.channel,
        jobId: event.jobId,
        status: event.status,
        progress: event.progress,
        data: event.payload,
        at: event.at,
      },
    };
  }

  if (event.channel) {
    return {
      name: event.channel,
      payload: {
        seq: event.seq,
        type: event.channel,
        jobId: event.jobId,
        status: event.status,
        progress: event.progress,
        data: event.payload,
        at: event.at,
      },
    };
  }

  if (TERMINAL.has(event.status)) {
    return {
      name: event.status === "done" ? "deck:done" : event.status === "canceled" ? "deck:canceled" : "deck:error",
      payload: {
        seq: event.seq,
        type: "job.status",
        jobId: event.jobId,
        status: event.status,
        progress: event.progress,
        errorMessage: event.errorMessage,
        at: event.at,
      },
    };
  }

  return {
    name: "deck:status",
    payload: {
      seq: event.seq,
      type: "job.status",
      jobId: event.jobId,
      status: event.status,
      progress: event.progress,
      errorMessage: event.errorMessage,
      at: event.at,
    },
  };
}

function mapNamedDeckEvent(channel?: string): string | null {
  switch (channel) {
    case "deck.plan":
      return "deck:plan";
    case "deck.context":
      return "deck:context";
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
