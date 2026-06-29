import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { ApiError } from '../../lib/errors';
import { randomToken, sha256Hex } from '../../lib/crypto';
import { isObjectId } from '../../lib/ids';
import { requireUser } from '../../middleware/auth';
import {
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  TemplatePackModel,
  WorkspaceBrandingModel,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspacePreferenceModel,
  type DeckJobDoc,
  type DeckProjectDoc,
  type JobType,
} from '../../models';
import { getMe, updateMe } from '../auth/auth.service';
import { effectiveCloudConfig } from '../agents/cloudLlm';
import {
  ensureCloudDeckHtml,
  type CloudDeckArtifact,
} from '../agents/tools/cloudDeck.tools';
import { jobBus, type JobEvent } from '../decks/jobs.events';
import { recordUsage } from '../usage/usage.service';
import {
  createSourcePlaceholder,
  deleteSource,
  getPageImageBuffer,
  getSourceDetail,
  listSourceCollections,
  resolveBookReference,
  searchBookContent,
} from '../documents/sourceLibrary.service';

export const apiCompatRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  // Books/PDFs can be large; allow up to 50MB per upload.
  limits: { fileSize: 50 * 1024 * 1024 },
});

interface RenderJob {
  exportId: string;
  deckId: string | null;
  exportType: 'pptx_editable' | 'html';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  fileName: string | null;
  downloadUrl: string | null;
  previewUrl?: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  html?: string;
}

const renderJobs = new Map<string, RenderJob>();

const generateSchema = z.object({
  prompt: z.string().min(1).max(10_000).optional(),
  instruction: z.string().max(2000).optional(),
  fileId: z.string().optional(),
  workspaceId: z.string().optional(),
  title: z.string().min(1).max(255).optional(),
  deckType: z.string().min(1).max(80).optional(),
  designStyle: z.string().min(1).max(120).optional(),
  language: z.string().min(1).max(20).optional(),
  slideCount: z.number().int().min(1).max(100).optional(),
});

const intentSchema = z.object({
  prompt: z.string().max(10_000).optional(),
  fileId: z.string().optional(),
  language: z.string().min(1).max(20).optional(),
  privacyMode: z.string().optional(),
});

const messageSchema = z.object({
  message: z.string().min(1).max(10_000).optional(),
  instruction: z.string().min(1).max(10_000).optional(),
  language: z.string().min(1).max(20).optional(),
});

const outlinePatchSchema = z.object({
  outline: z.unknown().optional(),
  raw: z.string().max(20_000).optional(),
  body: z.string().max(20_000).optional(),
});

const renderSchema = z.object({
  deckId: z.string().optional(),
  deckJson: z.unknown().optional(),
  html: z.string().optional(),
});

apiCompatRouter.get(
  '/auth/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const me = await getMe(req.auth!.userId);
    const user = me.user;
    res.json({
      success: true,
      authenticated: true,
      user: {
        ...user,
        authenticated: true,
        userId: user.id,
        name: user.displayName ?? '',
        initials: initialsFor(user.displayName || user.email),
        role: user.isAdmin ? 'admin' : 'user',
      },
      workspaces: me.workspaces,
    });
  })
);

apiCompatRouter.patch(
  '/auth/me',
  requireUser,
  asyncHandler(async (req, res) => {
    res.json(await updateMe(req.auth!.userId, req.body ?? {}));
  })
);

apiCompatRouter.get(
  '/user/settings',
  requireUser,
  asyncHandler(async (req, res) => {
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query.workspaceId
    );
    res.json(await buildSettings(workspaceId));
  })
);

apiCompatRouter.patch(
  '/user/settings',
  requireUser,
  asyncHandler(async (req, res) => {
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.body?.workspaceId
    );
    const patch = req.body ?? {};
    const prefPatch: Record<string, unknown> = {};
    if (patch.language !== undefined) prefPatch.language = patch.language;
    if (patch.defaultDeckType !== undefined)
      prefPatch.defaultDeckType = patch.defaultDeckType;
    if (patch.defaultDesignStyle !== undefined)
      prefPatch.defaultStyle = patch.defaultDesignStyle;
    if (patch.defaultStyle !== undefined)
      prefPatch.defaultStyle = patch.defaultStyle;
    if (patch.defaultSlideCount !== undefined)
      prefPatch.defaultSlideCount = patch.defaultSlideCount;

    const branding =
      typeof patch.branding === 'object' && patch.branding
        ? { ...patch.branding }
        : null;
    if (branding) delete (branding as Record<string, unknown>).logoPath;

    await Promise.all([
      Object.keys(prefPatch).length
        ? WorkspacePreferenceModel.findOneAndUpdate(
            { workspaceId },
            { $set: prefPatch },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
          )
        : Promise.resolve(null),
      branding && Object.keys(branding).length
        ? WorkspaceBrandingModel.findOneAndUpdate(
            { workspaceId },
            { $set: branding },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
          )
        : Promise.resolve(null),
    ]);

    res.json({ success: true, settings: await buildSettings(workspaceId) });
  })
);

apiCompatRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const items = await TemplatePackModel.find().sort({ name: 1 });
    res.json({
      templates: items.map((template) =>
        templateForFrontend(template.toJSON() as Record<string, unknown>)
      ),
    });
  })
);

apiCompatRouter.use(
  '/admin',
  requireUser,
  asyncHandler(async (req, _res, next) => {
    if (!req.auth?.isAdmin) throw ApiError.forbidden('Admin role required');
    next();
  })
);

apiCompatRouter.get('/admin/cloud-providers', proxyAdminCloudProviders('GET'));
apiCompatRouter.post(
  '/admin/cloud-providers/test',
  proxyAdminCloudProviders('TEST')
);

apiCompatRouter.post(
  '/files/upload',
  requireUser,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.body?.workspaceId
    );
    const file = req.file;
    if (!file) throw ApiError.badRequest('Missing file');
    const checksum = sha256Hex(file.buffer.toString('base64'));
    const storageUrl = `data:${
      file.mimetype || 'application/octet-stream'
    };base64,${file.buffer.toString('base64')}`;
    const projectId =
      typeof req.body?.projectId === 'string' && isObjectId(req.body.projectId)
        ? req.body.projectId
        : null;
    const saved = await FileModel.create({
      workspaceId,
      projectId,
      scope: projectId ? 'job' : 'workspace',
      kind: 'upload',
      filename: file.originalname || 'upload',
      mimeType: file.mimetype || null,
      sizeBytes: file.size,
      storageUrl,
      checksum,
      meta: { source: 'api_compat_upload' },
    });

    // Register the upload in the Source Library as `processing`; the background
    // source-index worker reads the bytes back from the stored File and indexes
    // it durably (survives restarts). The UI polls status until `indexed`.
    let source: { sourceId: string | null; status: string } = {
      sourceId: null,
      status: 'skipped',
    };
    try {
      const placeholder = await createSourcePlaceholder({
        fileId: saved.id,
        workspaceId,
        projectId,
        ownerId: req.auth!.userId,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        buffer: file.buffer,
      });
      source = { sourceId: placeholder.id, status: placeholder.status };
    } catch {
      source = { sourceId: null, status: 'failed' };
    }

    res.status(201).json({
      success: true,
      fileId: saved.id,
      sourceId: source.sourceId,
      file: {
        id: saved.id,
        fileId: saved.id,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        sourceId: source.sourceId,
        status: source.status,
      },
    });
  })
);

// --- Source Library (persistent book/document sources) ----------------------

apiCompatRouter.get(
  '/sources',
  requireUser,
  asyncHandler(async (req, res) => {
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const sources = await listSourceCollections({ workspaceId });
    res.json({ success: true, sources });
  })
);

apiCompatRouter.get(
  '/sources/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id))
      throw ApiError.badRequest('Invalid source id');
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const detail = await getSourceDetail({
      workspaceId,
      sourceId: req.params.id,
    });
    if (!detail) throw ApiError.notFound('Source not found');
    res.json({ success: true, ...detail });
  })
);

apiCompatRouter.delete(
  '/sources/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id))
      throw ApiError.badRequest('Invalid source id');
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const deleted = await deleteSource({ workspaceId, sourceId: req.params.id });
    if (!deleted) throw ApiError.notFound('Source not found');
    res.json({ success: true });
  })
);

// Resolve a natural reference ("Lesson 5", "pages 23-45") to a page range so
// the UI can confirm low-confidence matches before generating.
apiCompatRouter.post(
  '/sources/:id/resolve',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id))
      throw ApiError.badRequest('Invalid source id');
    const reference = String(req.body?.reference ?? '').trim();
    if (!reference) throw ApiError.badRequest('Missing reference');
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const result = await resolveBookReference({
      workspaceId,
      sourceId: req.params.id,
      reference,
    });
    res.json({ success: true, ...result });
  })
);

// Semantic "search this book" — returns the most relevant passages w/ pages.
apiCompatRouter.post(
  '/sources/:id/search',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id))
      throw ApiError.badRequest('Invalid source id');
    const query = String(req.body?.query ?? '').trim();
    if (!query) throw ApiError.badRequest('Missing query');
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const result = await searchBookContent({
      workspaceId,
      sourceId: req.params.id,
      query,
      topK: Number(req.body?.topK) || undefined,
    });
    res.json({ success: true, ...result });
  })
);

// Render (and cache) a single page as a PNG thumbnail.
apiCompatRouter.get(
  '/sources/:id/pages/:n/image',
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id))
      throw ApiError.badRequest('Invalid source id');
    const pageNumber = Number(req.params.n);
    if (!Number.isInteger(pageNumber) || pageNumber < 1)
      throw ApiError.badRequest('Invalid page number');
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      req.query?.workspaceId
    );
    const png = await getPageImageBuffer({
      workspaceId,
      sourceId: req.params.id,
      pageNumber,
    });
    if (!png) throw ApiError.notFound('Page image unavailable');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(png);
  })
);

apiCompatRouter.post(
  '/decks/detect-intent',
  requireUser,
  asyncHandler(async (req, res) => {
    const parsed = intentSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest('Invalid intent payload', parsed.error.issues);
    res.json({ success: true, intent: detectIntent(parsed.data) });
  })
);

apiCompatRouter.post(
  '/decks/generate',
  requireUser,
  startCompatGeneration('generate')
);
apiCompatRouter.post(
  '/decks/generate-phased',
  requireUser,
  startCompatGeneration('generate')
);
apiCompatRouter.post(
  '/decks/generate-from-file',
  requireUser,
  startCompatGeneration('generate')
);
apiCompatRouter.post(
  '/decks/improve-from-file',
  requireUser,
  startCompatGeneration('refine')
);

apiCompatRouter.get(
  '/decks',
  requireUser,
  asyncHandler(async (req, res) => {
    const workspaceIds = await readableWorkspaceIds(
      req.auth!.userId,
      req.query.workspaceId
    );
    const limit = clampInt(req.query.limit, 50, 1, 100);
    const includeShared = req.query.includeShared === 'true';
    const query: Record<string, unknown> = {
      workspaceId: { $in: workspaceIds },
      ...(includeShared ? {} : { ownerId: req.auth!.userId }),
    };
    if (typeof req.query.cursor === 'string') {
      const cursorDate = new Date(req.query.cursor);
      if (!Number.isNaN(cursorDate.getTime()))
        query.updatedAt = { $lt: cursorDate };
    }
    const projects = await DeckProjectModel.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1);
    const page = projects.slice(0, limit);
    const decks = await Promise.all(page.map(deckListItem));
    const next = projects.length > limit ? projects[limit] : null;
    res.json({
      decks,
      nextCursor: next
        ? (next as unknown as { updatedAt: Date }).updatedAt.toISOString()
        : null,
    });
  })
);

apiCompatRouter.get(
  '/decks/:deckId/json',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    const artifact = artifactFor(project, latest);
    res.json({ deckId: project.id, deckJson: artifact });
  })
);

apiCompatRouter.get(
  '/decks/:deckId/status',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    res.json(statusPayload(project, latest));
  })
);

apiCompatRouter.get(
  '/decks/:deckId/outline',
  requireUser,
  loadCompatDeck(async (_req, res, project) => {
    const meta = metaRecord(project.meta);
    const artifact = artifactFor(project, null);
    res.json({
      deckId: project.id,
      outline: meta.outline ?? outlineFromArtifact(artifact),
      status: meta.approvalStatus ?? 'approved',
    });
  })
);

apiCompatRouter.patch(
  '/decks/:deckId/outline',
  requireUser,
  loadCompatDeck(async (req, res, project) => {
    const parsed = outlinePatchSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest('Invalid outline payload', parsed.error.issues);
    const meta = metaRecord(project.meta);
    project.meta = {
      ...meta,
      outline: parsed.data.outline ?? {
        raw: parsed.data.raw ?? parsed.data.body ?? '',
      },
      approvalStatus: 'awaiting_approval',
    };
    project.markModified('meta');
    await project.save();
    res.json({
      success: true,
      deckId: project.id,
      outline: metaRecord(project.meta).outline,
    });
  })
);

apiCompatRouter.post(
  '/decks/:deckId/approve',
  requireUser,
  loadCompatDeck(async (_req, res, project) => {
    const meta = metaRecord(project.meta);
    project.meta = { ...meta, approvalStatus: 'approved' };
    project.markModified('meta');
    await project.save();
    res.json({ success: true, deckId: project.id, status: 'approved' });
  })
);

apiCompatRouter.post(
  '/decks/:deckId/cancel',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    if (latest && !['done', 'error', 'canceled'].includes(latest.status)) {
      latest.status = 'canceled';
      latest.finishedAt = new Date();
      await latest.save();
      jobBus.emitJob({
        jobId: latest.id,
        status: 'canceled',
        progress: latest.progress,
        at: new Date().toISOString(),
      });
    }
    res.json({ success: true, deckId: project.id, status: 'canceled' });
  })
);

apiCompatRouter.post(
  '/decks/:deckId/agent-chat',
  requireUser,
  createRefineJob('message')
);
apiCompatRouter.post(
  '/decks/:deckId/slides/:slideNumber/rewrite',
  requireUser,
  createRefineJob('rewrite')
);
apiCompatRouter.post(
  '/decks/:deckId/slides/:slideNumber/regenerate',
  requireUser,
  createRefineJob('regenerate')
);
apiCompatRouter.post(
  '/decks/:deckId/translate',
  requireUser,
  createRefineJob('translate')
);

apiCompatRouter.get(
  '/decks/:deckId/events',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const jobId = latest?.id;
    const send = (event: unknown) =>
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'deck.status', data: statusPayload(project, latest) });

    if (!jobId) {
      res.end();
      return;
    }

    const channel = `job:${jobId}`;
    const onEvent = (event: JobEvent): void => {
      send(legacyEvent(event));
      if (['done', 'error', 'canceled'].includes(event.status)) {
        cleanup();
        res.end();
      }
    };
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const cleanup = () => {
      clearInterval(ping);
      jobBus.off(channel, onEvent);
    };
    jobBus.on(channel, onEvent);
    _req.on('close', cleanup);
  })
);

apiCompatRouter.post(
  '/decks/:deckId/export',
  requireUser,
  loadCompatDeck(async (_req, res, project) => {
    res.json({
      success: true,
      downloadUrl: `/api/decks/${project.id}/download`,
    });
  })
);

apiCompatRouter.get(
  '/decks/:deckId/download',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    const artifact = artifactFor(project, latest);
    if (!artifact) throw ApiError.badRequest('Deck is not ready');
    const body = JSON.stringify(artifact, null, 2);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName(project.title)}.pptx"`
    );
    res.send(Buffer.from(body, 'utf8'));
  })
);

apiCompatRouter.get(
  '/decks/:deckId',
  requireUser,
  loadCompatDeck(async (_req, res, project, latest) => {
    res.json(await deckMetadata(project, latest));
  })
);

apiCompatRouter.get('/render/supported-types', (_req, res) => {
  res.json({
    supportedTypes: ['pptx_editable', 'html'],
    endpoints: {
      pptx_editable: '/api/render/export-pptx-editable',
      pptx_pixel_perfect: null,
      html: '/api/render/html',
      pdf: null,
    },
  });
});

apiCompatRouter.post(
  '/render/export-pptx-editable',
  requireUser,
  createRenderJob('pptx_editable')
);
apiCompatRouter.post('/render/html', requireUser, createRenderJob('html'));

apiCompatRouter.get('/render/jobs/:exportId', (req, res) => {
  const job = renderJobs.get(req.params.exportId);
  if (!job) throw ApiError.notFound('Export job not found');
  res.json({ success: true, ...job });
});

apiCompatRouter.get('/render/jobs/:exportId/download', (req, res) => {
  const job = renderJobs.get(req.params.exportId);
  if (!job) throw ApiError.notFound('Export job not found');
  if (job.status !== 'completed')
    throw ApiError.badRequest('Export is not ready');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${job.fileName ?? `${job.exportId}.pptx`}"`
  );
  res.send(
    Buffer.from(
      `YDeck export ${job.exportId}\nDeck: ${job.deckId ?? 'inline'}\n`,
      'utf8'
    )
  );
});

apiCompatRouter.get('/render/jobs/:exportId/preview', (req, res) => {
  const job = renderJobs.get(req.params.exportId);
  if (!job) throw ApiError.notFound('Export job not found');
  if (job.status !== 'completed')
    throw ApiError.badRequest('Preview is not ready');
  res
    .type('html')
    .send(
      job.html ??
        '<!doctype html><html><body><main>YDeck preview</main></body></html>'
    );
});

function startCompatGeneration(type: JobType) {
  return asyncHandler(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid generation payload',
        parsed.error.issues
      );
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      parsed.data.workspaceId
    );
    const prompt =
      parsed.data.prompt ??
      parsed.data.instruction ??
      'Create a presentation from the supplied file.';
    const title =
      parsed.data.title ?? (prompt.slice(0, 90) || 'Untitled cloud deck');
    const project = await DeckProjectModel.create({
      workspaceId,
      ownerId: req.auth!.userId,
      title,
      description: prompt,
      templateId: null,
      meta: {
        mode: 'cloud',
        source: 'api_compat',
        intent: detectIntent(parsed.data),
      },
    });
    const job = await createDeckJob(project, type, {
      prompt,
      fileId: parsed.data.fileId,
      deckType: parsed.data.deckType ?? 'general',
      designStyle: parsed.data.designStyle ?? 'modern',
      language: parsed.data.language ?? 'en',
      slideCount: parsed.data.slideCount ?? 10,
    });
    await recordUsage(workspaceId, `deck.job.${type}`, 1);
    res.status(201).json({
      success: true,
      deckId: project.id,
      projectId: project.id,
      jobId: job.id,
      status: 'processing',
      pipeline: 'phased',
      eventsUrl: `/api/decks/${project.id}/events`,
      intent: detectIntent(parsed.data),
    });
  });
}

function createRefineJob(
  kind: 'message' | 'rewrite' | 'regenerate' | 'translate'
) {
  return loadCompatDeck(async (req, res, project) => {
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid refinement payload',
        parsed.error.issues
      );
    const instruction =
      parsed.data.message ?? parsed.data.instruction ?? `${kind} deck`;
    const slideNumber = req.params.slideNumber
      ? Number(req.params.slideNumber)
      : undefined;
    const prompt = slideNumber
      ? `${kind} slide ${slideNumber}: ${instruction}`
      : instruction;
    const job = await createDeckJob(project, 'refine', {
      prompt,
      userPrompt: prompt,
      deckType: metaRecord(project.meta).deckType ?? 'general',
      designStyle: metaRecord(project.meta).designStyle ?? 'modern',
      language:
        parsed.data.language ?? metaRecord(project.meta).language ?? 'en',
      slideNumber,
      action: kind,
    });
    res.status(202).json({
      success: true,
      deckId: project.id,
      jobId: job.id,
      chatRunId: job.id,
      eventsUrl: `/api/decks/${project.id}/events`,
    });
  });
}

function createRenderJob(exportType: 'pptx_editable' | 'html') {
  return asyncHandler(async (req, res) => {
    const parsed = renderSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest('Invalid render payload', parsed.error.issues);
    const exportId = `exp_${randomToken(8)}`;
    const now = new Date().toISOString();
    const deckId = parsed.data.deckId ?? null;
    const job: RenderJob = {
      exportId,
      deckId,
      exportType,
      status: 'completed',
      progress: 100,
      fileName:
        exportType === 'pptx_editable'
          ? `${safeFileName(deckId ?? 'deck')}.pptx`
          : `${safeFileName(deckId ?? 'deck')}.html`,
      downloadUrl: `/api/render/jobs/${exportId}/download`,
      previewUrl:
        exportType === 'html' ? `/api/render/jobs/${exportId}/preview` : null,
      error: null,
      createdAt: now,
      completedAt: now,
      html:
        parsed.data.html ??
        htmlForDeck(parsed.data.deckJson, deckId ?? exportId),
    };
    renderJobs.set(exportId, job);
    res.status(202).json({ success: true, ...job });
  });
}

async function createDeckJob(
  project: DeckProjectDoc,
  type: JobType,
  inputParams: Record<string, unknown>
): Promise<DeckJobDoc> {
  const cloud = await effectiveCloudConfig();
  return DeckJobModel.create({
    projectId: project.id,
    workspaceId: project.workspaceId,
    type,
    status: 'queued',
    progress: 0,
    inputParams: {
      ...inputParams,
      pipeline: 'agentic',
      mode: 'cloud',
      cloudProvider: cloud.llmProvider,
      cloudModel:
        cloud.llmProvider === 'mock' ? 'mock' : cloud.models[cloud.llmProvider],
    },
  });
}

function loadCompatDeck(
  handler: (
    req: Parameters<Parameters<Router['get']>[1]>[0],
    res: Parameters<Parameters<Router['get']>[1]>[1],
    project: DeckProjectDoc,
    latest: DeckJobDoc | null
  ) => Promise<void> | void
) {
  return asyncHandler(async (req, res) => {
    const project = await loadProject(req.params.deckId, req.auth!.userId);
    const latest = await DeckJobModel.findOne({ projectId: project.id }).sort({
      createdAt: -1,
    });
    await handler(req, res, project, latest);
  });
}

async function loadProject(
  projectId: string,
  userId: string
): Promise<DeckProjectDoc> {
  if (!isObjectId(projectId)) throw ApiError.notFound('Deck not found');
  let project = await DeckProjectModel.findById(projectId);
  if (!project) {
    // The client sometimes passes a deck JOB id instead of the project id
    // (e.g. straight after generation). Resolve the job to its owning project
    // so deck metadata / export load consistently.
    const job = await DeckJobModel.findById(projectId).catch(() => null);
    if (job) project = await DeckProjectModel.findById(job.projectId);
  }
  if (!project) throw ApiError.notFound('Deck not found');
  await assertWorkspace(project.workspaceId.toString(), userId);
  return project;
}

async function assertWorkspace(
  workspaceId: string,
  userId: string
): Promise<void> {
  const membership = await WorkspaceMemberModel.findOne({
    workspaceId,
    userId,
  });
  if (!membership) throw ApiError.forbidden('Not a member of this workspace');
}

async function resolveWorkspaceId(
  userId: string,
  requested?: unknown
): Promise<string> {
  const requestedId =
    typeof requested === 'string' && requested ? requested : undefined;
  if (requestedId) {
    if (!isObjectId(requestedId))
      throw ApiError.badRequest('Invalid workspaceId');
    await assertWorkspace(requestedId, userId);
    return requestedId;
  }
  const membership = await WorkspaceMemberModel.findOne({ userId }).sort({
    createdAt: 1,
  });
  if (!membership) throw ApiError.badRequest('No workspace available');
  return String(membership.workspaceId);
}

async function readableWorkspaceIds(
  userId: string,
  requested?: unknown
): Promise<string[]> {
  if (typeof requested === 'string' && requested)
    return [await resolveWorkspaceId(userId, requested)];
  const memberships = await WorkspaceMemberModel.find({ userId }).select(
    'workspaceId'
  );
  return memberships.map((m) => String(m.workspaceId));
}

async function latestJob(project: DeckProjectDoc): Promise<DeckJobDoc | null> {
  return DeckJobModel.findOne({ projectId: project.id }).sort({
    createdAt: -1,
  });
}

async function deckListItem(project: DeckProjectDoc) {
  return deckMetadata(project, await latestJob(project));
}

async function deckMetadata(
  project: DeckProjectDoc,
  latest: DeckJobDoc | null
) {
  const artifact = artifactFor(project, latest);
  const meta = metaRecord(project.meta);
  return {
    deckId: project.id,
    projectId: project.id,
    jobId: latest?.id ?? meta.lastJobId ?? null,
    title: artifact?.deckTitle ?? project.title,
    description: project.description ?? 'Generated with the YDeck agent',
    status: legacyStatus(latest?.status, artifact),
    progress: latest?.progress ?? (artifact ? 100 : 0),
    language:
      artifact?.language ??
      meta.language ??
      latestInput(latest).language ??
      'en',
    deckType:
      artifact?.deckType ??
      meta.deckType ??
      latestInput(latest).deckType ??
      'general',
    designStyle:
      artifact?.designStyle ??
      meta.designStyle ??
      latestInput(latest).designStyle ??
      'modern',
    slideCount: Array.isArray(artifact?.slides)
      ? artifact.slides.length
      : meta.slideCount ?? latestInput(latest).slideCount ?? 0,
    createdAt: (project as unknown as { createdAt: Date }).createdAt,
    updatedAt: (project as unknown as { updatedAt: Date }).updatedAt,
  };
}

function statusPayload(project: DeckProjectDoc, latest: DeckJobDoc | null) {
  const artifact = artifactFor(project, latest);
  return {
    deckId: project.id,
    jobId: latest?.id ?? metaRecord(project.meta).lastJobId ?? null,
    status: legacyStatus(latest?.status, artifact),
    progress: latest?.progress ?? (artifact ? 100 : 0),
    stage: latest?.status ?? (artifact ? 'done' : 'draft'),
    error: latest?.errorMessage ?? null,
  };
}

function artifactFor(
  project: DeckProjectDoc,
  latest: DeckJobDoc | null
): Record<string, unknown> | null {
  const meta = metaRecord(project.meta);
  const projectArtifact = normalizeDeckArtifactForResponse(meta.deckArtifact);
  if (projectArtifact) return projectArtifact;
  const result = metaRecord(latest?.resultMeta);
  return normalizeDeckArtifactForResponse(result.deckArtifact);
}

function latestInput(latest: DeckJobDoc | null): Record<string, unknown> {
  return metaRecord(latest?.inputParams);
}

function legacyStatus(
  status: string | undefined,
  artifact: Record<string, unknown> | null
): string {
  if (status === 'done') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'canceled') return 'cancelled';
  if (status) return 'processing';
  return artifact ? 'completed' : 'draft';
}

function legacyEvent(event: JobEvent) {
  if (event.channel)
    return { type: event.channel, data: event.payload, jobId: event.jobId };
  return {
    type: 'deck.status',
    data: {
      jobId: event.jobId,
      status: legacyStatus(event.status, null),
      progress: event.progress,
      error: event.errorMessage ?? null,
    },
  };
}

function detectIntent(input: Record<string, unknown>) {
  const prompt = String(input.prompt ?? input.instruction ?? '');
  const slideCount =
    typeof input.slideCount === 'number'
      ? input.slideCount
      : inferSlideCount(prompt);
  const deckType = String(input.deckType ?? inferDeckType(prompt));
  const designStyle = String(input.designStyle ?? 'modern');
  const language = String(input.language ?? 'en');
  return {
    purpose: deckType,
    purposeLabel: labelize(deckType),
    audience: 'general',
    tone: 'professional',
    toneLabel: 'Professional',
    slideCount,
    focusPoints: prompt ? [prompt.slice(0, 160)] : [],
    recommendedDeckType: deckType,
    deckTypeLabel: labelize(deckType),
    recommendedDesignStyle: designStyle,
    designStyleLabel: labelize(designStyle),
    recommendedDesignPack: designStyle,
    recommendedStructure: Array.from(
      { length: Math.min(slideCount, 12) },
      (_, i) => ({
        slideNumber: i + 1,
        title: i === 0 ? 'Title' : `Slide ${i + 1}`,
      })
    ),
    privacyMode: input.privacyMode ?? 'cloud',
    language,
  };
}

function inferDeckType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('pitch') || lower.includes('investor'))
    return 'investor_pitch';
  if (lower.includes('lesson') || lower.includes('education'))
    return 'education_lesson';
  if (lower.includes('proposal')) return 'business_proposal';
  if (lower.includes('report')) return 'project_summary';
  return 'general';
}

function inferSlideCount(prompt: string): number {
  const match = prompt.match(/(\d{1,2})\s*(slide|page)/i);
  const n = match ? Number(match[1]) : 10;
  return Math.max(1, Math.min(100, Number.isFinite(n) ? n : 10));
}

async function buildSettings(workspaceId: string) {
  const [workspace, preferences, branding] = await Promise.all([
    WorkspaceModel.findById(workspaceId),
    WorkspacePreferenceModel.findOne({ workspaceId }),
    WorkspaceBrandingModel.findOne({ workspaceId }),
  ]);
  if (!workspace) throw ApiError.notFound('Workspace not found');
  return {
    workspaceId,
    language: preferences?.language ?? 'en',
    defaultDeckType: preferences?.defaultDeckType ?? 'general',
    defaultDesignStyle: preferences?.defaultStyle ?? 'modern',
    defaultSlideCount: preferences?.defaultSlideCount ?? 10,
    branding: {
      companyName: branding?.companyName ?? null,
      productName: branding?.productName ?? null,
      logoPath: null,
      logoUrl: branding?.logoUrl ?? null,
      primaryColor: branding?.primaryColor ?? '#111827',
      accentColor: branding?.accentColor ?? '#2563eb',
    },
  };
}

function proxyAdminCloudProviders(mode: 'GET' | 'TEST') {
  return asyncHandler(async (req, res) => {
    const {
      CLOUD_PROVIDERS,
      CLOUD_MODELS,
      effectiveCloudConfig,
      testCloudProvider,
    } = await import('../agents/cloudLlm');
    const cfg = await effectiveCloudConfig();
    if (mode === 'GET') {
      res.json({
        mode: 'cloud',
        activeProvider: cfg.llmProvider,
        streamOutput: cfg.streamOutput,
        logOutput: cfg.logOutput,
        providers: CLOUD_PROVIDERS.filter((p) => p !== 'mock').map(
          (provider) => ({
            provider,
            hasKey: cfg.keys[provider as keyof typeof cfg.keys].length > 0,
            maskedKey: maskKey(cfg.keys[provider as keyof typeof cfg.keys]),
            model: cfg.models[provider as keyof typeof cfg.models],
            baseUrl:
              provider === 'openai-compatible'
                ? cfg.baseUrls['openai-compatible']
                : undefined,
            models: CLOUD_MODELS[provider as keyof typeof CLOUD_MODELS],
          })
        ),
      });
      return;
    }
    const status = await testCloudProvider(req.body ?? {});
    res.json({
      ok: status.status === 'available' || status.status === 'unknown',
      status,
    });
  });
}

function templateForFrontend(template: Record<string, unknown>) {
  const manifest = metaRecord(template.manifest);
  return {
    ...template,
    templateId: template.slug ?? template.id,
    category: manifest.category ?? 'general',
    slideCount: manifest.slideCount ?? null,
    designStyle: manifest.designStyle ?? template.slug ?? 'modern',
    supportedDeckTypes: manifest.supportedDeckTypes ?? [],
    preview: manifest.preview ?? null,
    thumbnailUrl: manifest.thumbnailUrl ?? null,
  };
}

function outlineFromArtifact(artifact: Record<string, unknown> | null) {
  const slides = Array.isArray(artifact?.slides) ? artifact.slides : [];
  return {
    slides: slides.map((slide, index) => {
      const record = metaRecord(slide);
      return {
        slideNumber: record.slideNumber ?? index + 1,
        title: record.title ?? `Slide ${index + 1}`,
        bullets: record.bullets ?? [],
      };
    }),
  };
}

function htmlForDeck(deckJson: unknown, deckId: string): string {
  const artifact = metaRecord(deckJson);
  const title = String(artifact.deckTitle ?? deckId);
  const slides = Array.isArray(artifact.slides) ? artifact.slides : [];
  const sections = slides.length
    ? slides
        .map((slide, index) => {
          const s = metaRecord(slide);
          const preview = metaRecord(s.preview);
          if (typeof preview.html === 'string' && preview.html.trim())
            return preview.html;
          if (typeof s.previewHtml === 'string' && s.previewHtml.trim())
            return s.previewHtml;
          if (typeof s.html === 'string' && s.html.trim()) return s.html;
          return `<section class="ydeck-slide" data-slide-number="${
            s.slideNumber ?? index + 1
          }"><h1>${escapeHtml(
            String(s.title ?? `Slide ${index + 1}`)
          )}</h1></section>`;
        })
        .join('\n')
    : `<section class="ydeck-slide"><h1>${escapeHtml(title)}</h1></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title><style>body{margin:0;font-family:Arial,sans-serif}.ydeck-slide{width:1920px;height:1080px;box-sizing:border-box;padding:96px;border-bottom:1px solid #ddd}</style></head><body>${sections}</body></html>`;
}

function metaRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(value ?? fallback);
  return Math.max(
    min,
    Math.min(max, Number.isFinite(n) ? Math.floor(n) : fallback)
  );
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'deck';
}

function labelize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function initialsFor(value: string): string {
  const source = value.includes('@') ? value.split('@')[0] : value;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function maskKey(key: string): string | null {
  if (!key) return null;
  return key.length <= 8 ? '****' : `${key.slice(0, 3)}...${key.slice(-4)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
