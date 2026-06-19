import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { requireWorkspaceRole } from "../../middleware/workspace";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import { jobBus, type JobEvent } from "./jobs.events";
import { recordUsage } from "../usage/usage.service";
import {
  DeckJobModel,
  DeckProjectModel,
  WorkspaceMemberModel,
  type DeckJobDoc,
  type DeckProjectDoc,
  type JobType,
} from "../../models";

export const decksRouter: Router = Router();

const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  templateId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createJobSchema = z.object({
  type: z.enum(["generate", "refine", "export", "share"]),
  inputParams: z.record(z.string(), z.unknown()).optional(),
  pipeline: z.enum(["agentic", "mock"]).optional(),
});

decksRouter.use(requireUser);

// ----- projects -----
decksRouter.get(
  "/workspaces/:workspaceId/projects",
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const items = await DeckProjectModel.find({ workspaceId: req.params.workspaceId })
      .sort({ updatedAt: -1 })
      .limit(100);
    res.json(items.map((i) => i.toJSON()));
  }),
);

decksRouter.post(
  "/workspaces/:workspaceId/projects",
  requireWorkspaceRole("editor"),
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await DeckProjectModel.create({
      workspaceId: req.params.workspaceId,
      ownerId: req.auth!.userId,
      title: req.body.title,
      description: req.body.description ?? null,
      templateId: req.body.templateId ?? null,
      meta: req.body.meta ?? null,
    });
    await recordUsage(req.params.workspaceId, "deck.project.created", 1);
    res.status(201).json(project.toJSON());
  }),
);

decksRouter.get(
  "/projects/:projectId",
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(req.params.projectId, req.auth!.userId);
    res.json(project.toJSON());
  }),
);

decksRouter.patch(
  "/projects/:projectId",
  validate(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(req.params.projectId, req.auth!.userId, "editor");
    if (req.body.title !== undefined) project.title = req.body.title;
    if (req.body.description !== undefined) project.description = req.body.description;
    if (req.body.templateId !== undefined) project.templateId = req.body.templateId;
    if (req.body.meta !== undefined) project.meta = req.body.meta;
    await project.save();
    res.json(project.toJSON());
  }),
);

decksRouter.delete(
  "/projects/:projectId",
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(req.params.projectId, req.auth!.userId, "admin");
    await project.deleteOne();
    res.status(204).end();
  }),
);

// ----- jobs -----
decksRouter.post(
  "/projects/:projectId/jobs",
  validate(createJobSchema),
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(req.params.projectId, req.auth!.userId, "editor");
    const workspaceId = String(project.workspaceId);
    const job = await DeckJobModel.create({
      projectId: project.id,
      workspaceId,
      type: req.body.type as JobType,
      status: "queued",
      progress: 0,
      inputParams: {
        ...(req.body.inputParams ?? {}),
        pipeline: req.body.pipeline ?? "agentic",
      },
    });
    await recordUsage(workspaceId, `deck.job.${req.body.type}`, 1);
    res.status(201).json(job.toJSON());
  }),
);

decksRouter.get(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId);
    res.json(job.toJSON());
  }),
);

decksRouter.post(
  "/jobs/:jobId/cancel",
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId, "editor");
    if (["done", "error", "canceled"].includes(job.status)) {
      throw ApiError.badRequest("Job is already in a terminal state");
    }
    job.status = "canceled";
    job.finishedAt = new Date();
    await job.save();
    jobBus.emitJob({ jobId: job.id, status: job.status, progress: job.progress, at: new Date().toISOString() });
    res.json(job.toJSON());
  }),
);

// ----- SSE event stream -----
decksRouter.get(
  "/jobs/:jobId/events",
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: JobEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // send current snapshot first
    send({ jobId: job.id, status: job.status, progress: job.progress, at: new Date().toISOString() });

    const channel = `job:${job.id}`;
    const onEvent = (e: JobEvent): void => {
      send(e);
      if (["done", "error", "canceled"].includes(e.status)) {
        cleanup();
        res.end();
      }
    };
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    const cleanup = (): void => {
      clearInterval(ping);
      jobBus.off(channel, onEvent);
    };
    jobBus.on(channel, onEvent);
    req.on("close", cleanup);
  }),
);

async function loadProjectWithAccess(
  projectId: string,
  userId: string,
  minRole: "viewer" | "editor" | "admin" = "viewer",
): Promise<DeckProjectDoc> {
  if (!isObjectId(projectId)) throw ApiError.notFound("Project not found");
  const project = await DeckProjectModel.findById(projectId);
  if (!project) throw ApiError.notFound("Project not found");
  await assertMembership(String(project.workspaceId), userId, minRole);
  return project;
}

async function loadJobWithAccess(
  jobId: string,
  userId: string,
  minRole: "viewer" | "editor" | "admin" = "viewer",
): Promise<DeckJobDoc> {
  if (!isObjectId(jobId)) throw ApiError.notFound("Job not found");
  const job = await DeckJobModel.findById(jobId);
  if (!job) throw ApiError.notFound("Job not found");
  await assertMembership(String(job.workspaceId), userId, minRole);
  return job;
}

const RANK: Record<string, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
async function assertMembership(workspaceId: string, userId: string, minRole: string): Promise<void> {
  const m = await WorkspaceMemberModel.findOne({ workspaceId, userId });
  if (!m) throw ApiError.forbidden("Not a member of this workspace");
  if (RANK[m.role] < RANK[minRole]) throw ApiError.forbidden(`Role '${minRole}' or higher required`);
}
