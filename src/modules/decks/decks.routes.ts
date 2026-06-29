import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../lib/validate';
import { requireUser } from '../../middleware/auth';
import { requireWorkspaceRole } from '../../middleware/workspace';
import { ApiError } from '../../lib/errors';
import { isObjectId } from '../../lib/ids';
import { jobBus, type JobEvent } from './jobs.events';
import { listClientJobEvents } from './jobEventLog.service';
import { recordUsage } from '../usage/usage.service';
import { effectiveCloudConfig } from '../agents/cloudLlm';
import {
  ensureCloudDeckHtml,
  type CloudDeckArtifact,
} from '../agents/tools/cloudDeck.tools';
import {
  DeckJobModel,
  DeckProjectModel,
  WorkspaceMemberModel,
  type DeckJobDoc,
  type DeckProjectDoc,
  type JobType,
} from '../../models';
import { cascadeDeleteDeckProject } from './deckCleanup';
import { buildAgentSession } from './agentSession';

export const decksRouter: Router = Router();

const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  templateId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createJobSchema = z.object({
  type: z.enum(['generate', 'refine', 'export', 'share']),
  inputParams: z.record(z.string(), z.unknown()).optional(),
  pipeline: z.enum(['agentic', 'mock']).optional(),
  mode: z.enum(['cloud']).optional(),
});

const listProjectsQuerySchema = z.object({
  workspaceId: z.string().optional(),
  includeShared: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

decksRouter.use(requireUser);

// ----- projects -----
decksRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    res.json(await listProjectPage(req.auth!.userId, req.query));
  })
);

decksRouter.get(
  '/workspaces/:workspaceId/projects',
  requireWorkspaceRole('viewer'),
  asyncHandler(async (req, res) => {
    const includeShared = req.query.includeShared === 'true';
    const items = await DeckProjectModel.find({
      workspaceId: req.params.workspaceId,
      ...(includeShared ? {} : { ownerId: req.auth!.userId }),
    })
      .sort({ updatedAt: -1 })
      .limit(100);
    res.json(items.map((i) => i.toJSON()));
  })
);

// Web frontend compatibility aliases. Some clients group deck-history routes
// under /v1/decks/*, while the canonical API lists projects at /v1/projects.
decksRouter.get(
  '/decks',
  asyncHandler(async (req, res) => {
    const page = await listProjectPage(req.auth!.userId, req.query);
    res.json({ ...page, decks: page.projects });
  })
);

decksRouter.get(
  '/decks/projects',
  asyncHandler(async (req, res) => {
    res.json(await listProjectPage(req.auth!.userId, req.query));
  })
);

decksRouter.get(
  '/decks/workspaces/:workspaceId/projects',
  requireWorkspaceRole('viewer'),
  asyncHandler(async (req, res) => {
    const includeShared = req.query.includeShared === 'true';
    const items = await DeckProjectModel.find({
      workspaceId: req.params.workspaceId,
      ...(includeShared ? {} : { ownerId: req.auth!.userId }),
    })
      .sort({ updatedAt: -1 })
      .limit(100);
    res.json(items.map((i) => i.toJSON()));
  })
);

decksRouter.post(
  '/workspaces/:workspaceId/projects',
  requireWorkspaceRole('editor'),
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
    await recordUsage(req.params.workspaceId, 'deck.project.created', 1);
    res.status(201).json(project.toJSON());
  })
);

decksRouter.get(
  '/projects/:projectId',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.projectId,
      req.auth!.userId
    );
    res.json(await projectDetail(project));
  })
);

decksRouter.get(
  '/decks/:deckId',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.deckId,
      req.auth!.userId
    );
    res.json(await projectDetail(project));
  })
);

decksRouter.get(
  '/decks/:deckId/json',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.deckId,
      req.auth!.userId
    );
    const meta = projectMeta(project);
    const artifact = normalizeDeckArtifactForResponse(meta.deckArtifact);
    if (!artifact) throw ApiError.notFound('Deck artifact not found');
    res.json(artifact);
  })
);

decksRouter.get(
  '/decks/:deckId/agent-session',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.deckId,
      req.auth!.userId
    );
    const includeArtifacts = String(req.query.include ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes('artifacts');
    const session = await buildAgentSession(project, { includeArtifacts });
    res.json(session);
  })
);

decksRouter.patch(
  '/projects/:projectId',
  validate(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.projectId,
      req.auth!.userId,
      'editor'
    );
    if (req.body.title !== undefined) project.title = req.body.title;
    if (req.body.description !== undefined)
      project.description = req.body.description;
    if (req.body.templateId !== undefined)
      project.templateId = req.body.templateId;
    if (req.body.meta !== undefined) project.meta = req.body.meta;
    await project.save();
    res.json(project.toJSON());
  })
);

decksRouter.delete(
  '/projects/:projectId',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.projectId,
      req.auth!.userId,
      'editor'
    );
    const result = await cascadeDeleteDeckProject(project);
    res.status(200).json({ success: true, projectId: project.id, ...result });
  })
);

decksRouter.delete(
  '/decks/:deckId',
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.deckId,
      req.auth!.userId,
      'editor'
    );
    const result = await cascadeDeleteDeckProject(project);
    res.status(200).json({ success: true, projectId: project.id, ...result });
  })
);

// ----- jobs -----
decksRouter.post(
  '/projects/:projectId/jobs',
  validate(createJobSchema),
  asyncHandler(async (req, res) => {
    const project = await loadProjectWithAccess(
      req.params.projectId,
      req.auth!.userId,
      'editor'
    );
    const workspaceId = String(project.workspaceId);
    const cloud = await effectiveCloudConfig();
    const job = await DeckJobModel.create({
      projectId: project.id,
      workspaceId,
      type: req.body.type as JobType,
      status: 'queued',
      progress: 0,
      inputParams: {
        ...(req.body.inputParams ?? {}),
        pipeline: req.body.pipeline ?? 'agentic',
        mode: req.body.mode ?? 'cloud',
        cloudProvider: cloud.llmProvider,
        cloudModel:
          cloud.llmProvider === 'mock'
            ? 'mock'
            : cloud.models[cloud.llmProvider],
      },
    });
    await recordUsage(workspaceId, `deck.job.${req.body.type}`, 1);
    res.status(201).json(job.toJSON());
  })
);

decksRouter.get(
  '/jobs/:jobId',
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId);
    res.json(job.toJSON());
  })
);

decksRouter.post(
  '/jobs/:jobId/cancel',
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(
      req.params.jobId,
      req.auth!.userId,
      'editor'
    );
    if (['done', 'error', 'canceled'].includes(job.status)) {
      throw ApiError.badRequest('Job is already in a terminal state');
    }
    job.status = 'canceled';
    job.resultMeta = {
      ...(typeof job.resultMeta === 'object' &&
      job.resultMeta !== null &&
      !Array.isArray(job.resultMeta)
        ? job.resultMeta
        : {}),
      stoppedBy: 'user',
      stoppedAt: new Date().toISOString(),
      canContinue: true,
    };
    job.finishedAt = new Date();
    await job.save();
    jobBus.emitJob({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      at: new Date().toISOString(),
    });
    res.json(job.toJSON());
  })
);

decksRouter.get(
  '/jobs/:jobId/event-log',
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId);
    const afterSeq = parsePositiveInt(req.query.afterSeq, 0);
    const limit = parsePositiveInt(req.query.limit, 200);
    const events = await listClientJobEvents(job.id, { afterSeq, limit });
    res.json({
      jobId: job.id,
      projectId: String(job.projectId),
      workspaceId: String(job.workspaceId),
      afterSeq,
      events,
      nextSeq: events.length ? events[events.length - 1].seq : afterSeq,
      hasMore: events.length >= Math.max(1, Math.min(500, limit)),
    });
  })
);

// ----- SSE event stream -----
decksRouter.get(
  '/jobs/:jobId/events',
  asyncHandler(async (req, res) => {
    const job = await loadJobWithAccess(req.params.jobId, req.auth!.userId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: JobEvent): void => {
      if (event.channel) {
        res.write(
          `data: ${JSON.stringify({
            type: event.channel,
            data: event.payload ?? {
              jobId: event.jobId,
              status: event.status,
              progress: event.progress,
              errorMessage: event.errorMessage,
            },
          })}\n\n`
        );
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          type: 'job.status',
          data: event,
        })}\n\n`
      );
    };

    // send current snapshot first
    send({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      at: new Date().toISOString(),
    });

    const channel = `job:${job.id}`;
    const onEvent = (e: JobEvent): void => {
      send(e);
      if (['done', 'error', 'canceled'].includes(e.status)) {
        cleanup();
        res.end();
      }
    };
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const cleanup = (): void => {
      clearInterval(ping);
      jobBus.off(channel, onEvent);
    };
    jobBus.on(channel, onEvent);
    req.on('close', cleanup);
  })
);

async function loadProjectWithAccess(
  projectId: string,
  userId: string,
  minRole: 'viewer' | 'editor' | 'admin' = 'viewer'
): Promise<DeckProjectDoc> {
  if (!isObjectId(projectId)) throw ApiError.notFound('Project not found');
  let project = await DeckProjectModel.findById(projectId);
  if (!project) {
    // The client sometimes passes a deck JOB id instead of the project id;
    // resolve it to its owning project so project lookups stay consistent.
    const job = await DeckJobModel.findById(projectId).catch(() => null);
    if (job) project = await DeckProjectModel.findById(job.projectId);
  }
  if (!project) throw ApiError.notFound('Project not found');
  await assertMembership(String(project.workspaceId), userId, minRole);
  return project;
}

async function loadJobWithAccess(
  jobId: string,
  userId: string,
  minRole: 'viewer' | 'editor' | 'admin' = 'viewer'
): Promise<DeckJobDoc> {
  if (!isObjectId(jobId)) throw ApiError.notFound('Job not found');
  const job = await DeckJobModel.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');
  await assertMembership(String(job.workspaceId), userId, minRole);
  return job;
}

const RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};
async function assertMembership(
  workspaceId: string,
  userId: string,
  minRole: string
): Promise<void> {
  const m = await WorkspaceMemberModel.findOne({ workspaceId, userId });
  if (!m) throw ApiError.forbidden('Not a member of this workspace');
  if (RANK[m.role] < RANK[minRole])
    throw ApiError.forbidden(`Role '${minRole}' or higher required`);
}

async function listReadableWorkspaceIds(
  userId: string,
  requested?: string
): Promise<string[]> {
  if (requested) {
    if (!isObjectId(requested))
      throw ApiError.badRequest('Invalid workspaceId');
    await assertMembership(requested, userId, 'viewer');
    return [requested];
  }
  const memberships = await WorkspaceMemberModel.find({ userId }).select(
    'workspaceId'
  );
  return memberships.map((m) => String(m.workspaceId));
}

async function listProjectPage(userId: string, rawQuery: unknown) {
  const parsed = listProjectsQuerySchema.safeParse(rawQuery);
  if (!parsed.success)
    throw ApiError.badRequest('Invalid projects query', parsed.error.issues);

  const workspaceIds = await listReadableWorkspaceIds(
    userId,
    parsed.data.workspaceId
  );
  const query: Record<string, unknown> = {
    workspaceId: { $in: workspaceIds },
    ...(parsed.data.includeShared ? {} : { ownerId: userId }),
  };
  if (parsed.data.cursor) {
    const cursorDate = new Date(parsed.data.cursor);
    if (!Number.isNaN(cursorDate.getTime()))
      query.updatedAt = { $lt: cursorDate };
  }

  const projects = await DeckProjectModel.find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(parsed.data.limit + 1);
  const page = projects.slice(0, parsed.data.limit);
  const summaries = await Promise.all(
    page.map((project) => projectSummary(project))
  );
  const next =
    projects.length > parsed.data.limit ? projects[parsed.data.limit] : null;

  return {
    projects: summaries,
    nextCursor: next
      ? (next as unknown as { updatedAt: Date }).updatedAt.toISOString()
      : null,
  };
}

async function projectSummary(project: DeckProjectDoc) {
  const latestJob = await DeckJobModel.findOne({ projectId: project.id })
    .sort({ createdAt: -1 })
    .select(
      'status progress type resultMeta errorMessage inputParams createdAt updatedAt'
    )
    .lean();
  const meta = projectMeta(project);
  const artifact = deckArtifact(meta, latestJob?.resultMeta);
  const enrichedMeta = enrichProjectMeta(
    meta,
    artifact,
    latestJob?.inputParams,
    latestJob?.resultMeta
  );
  const lastJobId = latestJob ? String(latestJob._id) : stringOrNull(meta.lastJobId);
  const status = latestJob?.status ?? (artifact ? 'done' : 'draft');
  const progress = latestJob?.progress ?? (artifact ? 100 : 0);

  return {
    ...project.toJSON(),
    deckId: project.id,
    projectId: project.id,
    jobId: lastJobId,
    lastJobId,
    deckTitle: stringOrNull(artifact?.deckTitle) ?? project.title,
    status,
    progress,
    slideCount: enrichedMeta.slideCount,
    deckType: enrichedMeta.deckType,
    designStyle: enrichedMeta.designStyle,
    language: enrichedMeta.language,
    hasDeckArtifact: Boolean(artifact),
    thumbnailUrl: thumbnailUrlForArtifact(artifact),
    previewHtml: firstSlideHtml(artifact),
    sourceRef: isRecord(meta.sourceRef) ? meta.sourceRef : null,
    meta: enrichedMeta,
  };
}

async function projectDetail(project: DeckProjectDoc) {
  return projectSummary(project);
}

function projectMeta(project: DeckProjectDoc): Record<string, unknown> {
  return typeof project.meta === 'object' && project.meta !== null
    ? { ...(project.meta as Record<string, unknown>) }
    : {};
}

function deckArtifact(
  projectMetaValue: Record<string, unknown>,
  resultMeta?: unknown
): Record<string, unknown> | null {
  const projectArtifact = normalizeDeckArtifactForResponse(
    projectMetaValue.deckArtifact
  );
  if (projectArtifact) return projectArtifact;
  const resultArtifact = isRecord(resultMeta)
    ? normalizeDeckArtifactForResponse(resultMeta.deckArtifact)
    : null;
  if (resultArtifact) return resultArtifact;
  return null;
}

function enrichProjectMeta(
  meta: Record<string, unknown>,
  artifact: Record<string, unknown> | null,
  inputParams?: unknown,
  resultMeta?: unknown
): Record<string, unknown> {
  const input = isRecord(inputParams) ? inputParams : {};
  const result = isRecord(resultMeta) ? resultMeta : {};
  const slides = Array.isArray(artifact?.slides) ? artifact.slides : undefined;
  return {
    ...meta,
    deckArtifact: artifact ?? meta.deckArtifact ?? null,
    slideCount:
      result.slideCount ??
      meta.slideCount ??
      slides?.length ??
      input.slideCount ??
      null,
    deckType: artifact?.deckType ?? meta.deckType ?? input.deckType ?? null,
    designStyle:
      artifact?.designStyle ??
      meta.designStyle ??
      input.designStyle ??
      input.style ??
      null,
    language: artifact?.language ?? meta.language ?? input.language ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const numberValue =
    typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return Math.floor(numberValue);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function thumbnailUrlForArtifact(
  artifact: Record<string, unknown> | null
): string | null {
  if (!artifact) return null;
  const direct = stringOrNull(artifact.thumbnailUrl);
  if (direct) return direct;

  const slides = Array.isArray(artifact.slides)
    ? artifact.slides.filter(isRecord)
    : [];
  for (const slide of slides) {
    const preview = isRecord(slide.preview) ? slide.preview : {};
    const image = isRecord(slide.image) ? slide.image : {};
    const candidate =
      stringOrNull(preview.thumbnailUrl) ??
      stringOrNull(preview.imageUrl) ??
      stringOrNull(slide.thumbnailUrl) ??
      stringOrNull(slide.imageUrl) ??
      stringOrNull(image.url);
    if (candidate) return candidate;
  }
  return null;
}

function firstSlideHtml(artifact: Record<string, unknown> | null): string | null {
  if (!artifact || !Array.isArray(artifact.slides)) return null;
  const firstSlide = artifact.slides.find(isRecord);
  if (!firstSlide) return null;
  const preview = isRecord(firstSlide.preview) ? firstSlide.preview : {};
  return (
    stringOrNull(preview.html) ??
    stringOrNull(firstSlide.previewHtml) ??
    stringOrNull(firstSlide.html)
  );
}

function normalizeDeckArtifactForResponse(
  value: unknown
): Record<string, unknown> | null {
  if (!isDeckArtifactLike(value)) return null;
  return ensureCloudDeckHtml(value) as Record<string, unknown>;
}

function isDeckArtifactLike(value: unknown): value is CloudDeckArtifact {
  return (
    isRecord(value) &&
    typeof value.deckTitle === 'string' &&
    typeof value.deckType === 'string' &&
    typeof value.designStyle === 'string' &&
    typeof value.language === 'string' &&
    Array.isArray(value.slides) &&
    value.slides.every(
      (slide) => isRecord(slide) && typeof slide.title === 'string'
    )
  );
}
