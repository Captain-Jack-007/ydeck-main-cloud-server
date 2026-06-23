import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/asyncHandler';
import { ApiError } from '../../lib/errors';
import { randomToken, sha256Hex } from '../../lib/crypto';
import { requireUser } from '../../middleware/auth';
import {
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  WorkspaceMemberModel,
  type JobType,
} from '../../models';
import { effectiveCloudConfig, getCloudLlmProvider } from '../agents/cloudLlm';
import { buildChatReply, classifyAgentMessage } from '../agents/chatIntent';
import type { AgentMessageIntentResult } from '../agents/chatIntent';
import {
  advancedAgentRoleForCloudAgent,
  allAdvancedToolNames,
  bootstrapTools,
  listAdvancedToolSpecs,
  listTools,
  toolsForAdvancedAgent,
  toolsForCloudProductionAgent,
} from '../agents/tools';
import {
  cloudAgentNames,
  type CloudAgentName,
} from '../agents/cloudWorkflow.contract';
import type { AdvancedToolAgent } from '../agents/tools/advancedSystem.tools';
import { recordUsage } from '../usage/usage.service';
import { cascadeDeleteDeckProject } from '../decks/deckCleanup';
import { buildAgentSession } from '../decks/agentSession';

export const cloudRouter: Router = Router();

const generateCloudDeckSchema = z.object({
  prompt: z.string().min(1).max(10_000),
  fileId: z.string().optional(),
  deckType: z.string().min(1).max(80).optional(),
  designStyle: z.string().min(1).max(120).optional(),
  language: z.string().min(1).max(20).optional(),
  slideCount: z.number().int().min(1).max(100).optional(),
  workspaceId: z.string().optional(),
  title: z.string().min(1).max(255).optional(),
  generationMode: z.enum(['auto', 'outline_first']).optional(),
  researchMode: z.enum(['off', 'auto', 'required', 'file_only']).optional(),
});

const cloudAgentMessageSchema = z.object({
  message: z.string().min(1).max(10_000),
  workspaceId: z.string().optional(),
  projectId: z.string().optional(),
  deckType: z.string().min(1).max(80).optional(),
  designStyle: z.string().min(1).max(120).optional(),
  language: z.string().min(1).max(20).optional(),
  slideCount: z.number().int().min(1).max(100).optional(),
  generationMode: z.enum(['auto', 'outline_first']).optional(),
  researchMode: z.enum(['off', 'auto', 'required', 'file_only']).optional(),
});

const editCloudDeckSchema = z.object({
  instruction: z.string().min(1).max(10_000),
  target: z
    .object({
      type: z.enum(['deck', 'slide']).default('deck'),
      slideNumber: z.number().int().positive().optional(),
    })
    .optional(),
  generationMode: z.enum(['auto', 'outline_first']).optional(),
  researchMode: z.enum(['off', 'auto', 'required', 'file_only']).optional(),
});

const exportCloudDeckSchema = z.object({
  format: z.enum(['html', 'pptx']).default('html'),
});

cloudRouter.use(requireUser);

cloudRouter.get(
  '/agent/tools',
  asyncHandler(async (req, res) => {
    bootstrapTools();
    const role = parseAdvancedToolAgent(req.query.role);
    const cloudAgent = parseCloudAgentName(req.query.agent);
    const allowedNames = cloudAgent
      ? new Set(toolsForCloudProductionAgent(cloudAgent))
      : role
      ? new Set(toolsForAdvancedAgent(role))
      : new Set(allAdvancedToolNames());
    const all = listTools();
    const tools = all
      .filter((tool) => allowedNames.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        risk: tool.risk,
        group: tool.group ?? 'Other',
        agents: tool.agents ?? [],
        maturity: tool.maturity ?? 'implemented',
      }));
    const groups = tools.reduce<Record<string, number>>((acc, tool) => {
      acc[tool.group] = (acc[tool.group] ?? 0) + 1;
      return acc;
    }, {});
    res.json({
      success: true,
      mode: 'cloud',
      totalAdvancedTools: allAdvancedToolNames().length,
      returnedTools: tools.length,
      filter: {
        role: role ?? null,
        agent: cloudAgent ?? null,
        mappedRole: cloudAgent
          ? advancedAgentRoleForCloudAgent(cloudAgent)
          : role ?? null,
      },
      groups,
      tools,
      allAdvancedTools:
        role || cloudAgent ? undefined : listAdvancedToolSpecs(),
    });
  })
);

cloudRouter.post(
  '/agent/message',
  asyncHandler(async (req, res) => {
    const parsed = cloudAgentMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid cloud agent message payload',
        parsed.error.issues
      );

    const existingProject = parsed.data.projectId
      ? await DeckProjectModel.findById(parsed.data.projectId)
      : null;
    if (parsed.data.projectId && !existingProject)
      throw ApiError.notFound('Deck project not found');
    if (existingProject) {
      const membership = await WorkspaceMemberModel.findOne({
        userId: req.auth!.userId,
        workspaceId: existingProject.workspaceId,
      });
      if (!membership)
        throw ApiError.forbidden('Not a member of that workspace');
    }

    // Intent is always analyzed by the LLM so phrasing and language do not matter.
    // The regex pass only short-circuits trivially obvious greetings/thanks/help
    // (confidence >= 0.98) to avoid a model call on "hi", and otherwise provides
    // a deterministic fallback that classifyAgentMessageWithLlm uses if the LLM
    // request fails.
    const deterministicIntent = classifyAgentMessage(parsed.data.message, {
      hasProject: Boolean(existingProject),
    });
    const intent =
      deterministicIntent.confidence >= 0.98
        ? deterministicIntent
        : await classifyAgentMessageWithLlm(
            parsed.data.message,
            Boolean(existingProject),
            deterministicIntent
          );
    if (intent.intent === 'chat') {
      res.json({
        success: true,
        mode: 'cloud',
        type: 'chat',
        intent,
        message: buildChatReply(parsed.data.message),
        actions: [
          { type: 'create_deck', label: 'Create a deck' },
          ...(existingProject
            ? [{ type: 'edit_deck', label: 'Edit current deck' }]
            : []),
        ],
      });
      return;
    }

    const workspaceId = existingProject
      ? String(existingProject.workspaceId)
      : await resolveWorkspaceId(req.auth!.userId, parsed.data.workspaceId);
    const cloud = await effectiveCloudConfig();

    if (intent.intent === 'edit_deck' && existingProject) {
      const meta = isRecord(existingProject.meta) ? existingProject.meta : {};
      const artifact = isRecord(meta.deckArtifact) ? meta.deckArtifact : null;
      const job = await DeckJobModel.create({
        projectId: existingProject.id,
        workspaceId: existingProject.workspaceId,
        type: 'refine' as JobType,
        status: 'queued',
        progress: 0,
        inputParams: {
          prompt: parsed.data.message,
          userPrompt: parsed.data.message,
          editInstruction: parsed.data.message,
          editTarget: { type: 'deck' },
          generationMode: parsed.data.generationMode ?? 'auto',
          researchMode: parsed.data.researchMode ?? 'auto',
          deckType:
            artifact?.deckType ??
            meta.deckType ??
            parsed.data.deckType ??
            'general',
          designStyle:
            artifact?.designStyle ??
            meta.designStyle ??
            parsed.data.designStyle ??
            'modern',
          language:
            artifact?.language ?? meta.language ?? parsed.data.language ?? 'en',
          slideCount: Array.isArray(artifact?.slides)
            ? artifact.slides.length
            : parsed.data.slideCount ?? meta.slideCount ?? 10,
          pipeline: 'agentic',
          mode: 'cloud',
          cloudProvider: cloud.llmProvider,
          cloudModel:
            cloud.llmProvider === 'mock'
              ? 'mock'
              : cloud.models[cloud.llmProvider],
          messageIntent: intent,
        },
      });
      await recordUsage(
        String(existingProject.workspaceId),
        'deck.job.refine',
        1
      );
      res.status(201).json({
        success: true,
        mode: 'cloud',
        type: 'job',
        intent,
        projectId: existingProject.id,
        deckId: existingProject.id,
        jobId: job.id,
        status: 'processing',
        pipeline: 'agentic_edit',
        eventsUrl: `/v1/jobs/${job.id}/events`,
      });
      return;
    }

    const title = parsed.data.message.slice(0, 90) || 'Untitled cloud deck';
    const reusableProject = await findReusableFailedProject({
      ownerId: req.auth!.userId,
      workspaceId,
      description: parsed.data.message,
    });
    const project =
      reusableProject ??
      (await DeckProjectModel.create({
        workspaceId,
        ownerId: req.auth!.userId,
        title,
        description: parsed.data.message,
        templateId: null,
        meta: {
          mode: 'cloud',
          source: 'cloud_agent_message',
          messageIntent: intent,
        },
      }));
    const job = await DeckJobModel.create({
      projectId: project.id,
      workspaceId,
      type: 'generate' as JobType,
      status: 'queued',
      progress: 0,
      inputParams: {
        prompt: parsed.data.message,
        deckType: parsed.data.deckType ?? 'general',
        designStyle: parsed.data.designStyle ?? 'modern',
        language: parsed.data.language ?? intent.inferredLanguage ?? 'en',
        ...(parsed.data.slideCount ?? intent.inferredSlideCount
          ? { slideCount: parsed.data.slideCount ?? intent.inferredSlideCount }
          : {}),
        generationMode: parsed.data.generationMode ?? 'auto',
        researchMode: parsed.data.researchMode ?? 'auto',
        pipeline: 'agentic',
        mode: 'cloud',
        cloudProvider: cloud.llmProvider,
        cloudModel:
          cloud.llmProvider === 'mock'
            ? 'mock'
            : cloud.models[cloud.llmProvider],
        messageIntent: intent,
      },
    });
    await recordUsage(workspaceId, 'deck.job.generate', 1);
    res.status(201).json({
      success: true,
      mode: 'cloud',
      type: 'job',
      intent,
      projectId: project.id,
      deckId: job.id,
      jobId: job.id,
      status: 'processing',
      pipeline: 'agentic',
      eventsUrl: `/v1/jobs/${job.id}/events`,
    });
  })
);

cloudRouter.post(
  '/decks/generate',
  asyncHandler(async (req, res) => {
    const parsed = generateCloudDeckSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid cloud generation payload',
        parsed.error.issues
      );
    const workspaceId = await resolveWorkspaceId(
      req.auth!.userId,
      parsed.data.workspaceId
    );
    const cloud = await effectiveCloudConfig();
    const title =
      parsed.data.title ??
      (parsed.data.prompt.slice(0, 90) || 'Untitled cloud deck');
    const project = await DeckProjectModel.create({
      workspaceId,
      ownerId: req.auth!.userId,
      title,
      description: parsed.data.prompt,
      templateId: null,
      meta: { mode: 'cloud', source: 'cloud_generate' },
    });
    const job = await DeckJobModel.create({
      projectId: project.id,
      workspaceId,
      type: 'generate' as JobType,
      status: 'queued',
      progress: 0,
      inputParams: {
        prompt: parsed.data.prompt,
        fileId: parsed.data.fileId,
        deckType: parsed.data.deckType ?? 'general',
        designStyle: parsed.data.designStyle ?? 'modern',
        language: parsed.data.language ?? 'en',
        slideCount: parsed.data.slideCount ?? 10,
        generationMode: parsed.data.generationMode ?? 'auto',
        researchMode: parsed.data.researchMode ?? 'auto',
        pipeline: 'agentic',
        mode: 'cloud',
        cloudProvider: cloud.llmProvider,
        cloudModel:
          cloud.llmProvider === 'mock'
            ? 'mock'
            : cloud.models[cloud.llmProvider],
      },
    });
    await recordUsage(workspaceId, 'deck.job.generate', 1);
    res.status(201).json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      deckId: job.id,
      jobId: job.id,
      status: 'processing',
      pipeline: 'agentic',
      eventsUrl: `/v1/jobs/${job.id}/events`,
    });
  })
);

cloudRouter.post(
  '/decks/:projectId/edit',
  asyncHandler(async (req, res) => {
    const parsed = editCloudDeckSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid cloud edit payload',
        parsed.error.issues
      );
    const project = await DeckProjectModel.findById(req.params.projectId);
    if (!project) throw ApiError.notFound('Deck project not found');
    const membership = await WorkspaceMemberModel.findOne({
      userId: req.auth!.userId,
      workspaceId: project.workspaceId,
    });
    if (!membership) throw ApiError.forbidden('Not a member of that workspace');
    if (!['owner', 'admin', 'editor'].includes(membership.role)) {
      throw ApiError.forbidden('Editor role or higher required');
    }

    const cloud = await effectiveCloudConfig();
    const meta = isRecord(project.meta) ? project.meta : {};
    const artifact = isRecord(meta.deckArtifact) ? meta.deckArtifact : null;
    const job = await DeckJobModel.create({
      projectId: project.id,
      workspaceId: project.workspaceId,
      type: 'refine' as JobType,
      status: 'queued',
      progress: 0,
      inputParams: {
        prompt: parsed.data.instruction,
        userPrompt: parsed.data.instruction,
        editInstruction: parsed.data.instruction,
        editTarget: parsed.data.target ?? { type: 'deck' },
        generationMode: parsed.data.generationMode ?? 'auto',
        researchMode: parsed.data.researchMode ?? 'auto',
        deckType: artifact?.deckType ?? meta.deckType ?? 'general',
        designStyle: artifact?.designStyle ?? meta.designStyle ?? 'modern',
        language: artifact?.language ?? meta.language ?? 'en',
        slideCount: Array.isArray(artifact?.slides)
          ? artifact.slides.length
          : meta.slideCount ?? 10,
        pipeline: 'agentic',
        mode: 'cloud',
        cloudProvider: cloud.llmProvider,
        cloudModel:
          cloud.llmProvider === 'mock'
            ? 'mock'
            : cloud.models[cloud.llmProvider],
      },
    });
    await recordUsage(String(project.workspaceId), 'deck.job.refine', 1);
    res.status(201).json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      deckId: project.id,
      jobId: job.id,
      status: 'processing',
      pipeline: 'agentic_edit',
      eventsUrl: `/v1/jobs/${job.id}/events`,
    });
  })
);

cloudRouter.post(
  '/jobs/:jobId/continue',
  asyncHandler(async (req, res) => {
    const job = await loadCloudJobForUser(
      req.params.jobId,
      req.auth!.userId,
      'editor'
    );
    if (job.status !== 'canceled') {
      throw ApiError.badRequest('Only canceled jobs can be continued');
    }
    const resultMeta = isRecord(job.resultMeta) ? job.resultMeta : {};
    if (resultMeta.stoppedBy && resultMeta.stoppedBy !== 'user') {
      throw ApiError.badRequest('Only user-stopped jobs can be continued');
    }
    job.status = 'queued';
    job.progress = Math.min(job.progress ?? 0, 95);
    job.errorMessage = null;
    job.finishedAt = null;
    job.resultMeta = {
      ...resultMeta,
      continuedFromJobId: job.id,
      continuedAt: new Date().toISOString(),
      canContinue: false,
      retryType: 'continue',
    };
    await job.save();
    res.status(202).json({
      success: true,
      mode: 'cloud',
      action: 'continue',
      projectId: String(job.projectId),
      jobId: job.id,
      status: 'processing',
      eventsUrl: `/v1/jobs/${job.id}/events`,
    });
  })
);

cloudRouter.post(
  '/jobs/:jobId/retry',
  asyncHandler(async (req, res) => {
    const job = await loadCloudJobForUser(
      req.params.jobId,
      req.auth!.userId,
      'editor'
    );
    if (job.status !== 'error') {
      throw ApiError.badRequest('Only error jobs can be retried');
    }
    const input = isRecord(job.inputParams) ? job.inputParams : {};
    const retryJob = await DeckJobModel.create({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      type: job.type,
      status: 'queued',
      progress: 0,
      inputParams: {
        ...input,
        retryOfJobId: job.id,
        retryReason: job.errorMessage,
        retryAttempt: Number(input.retryAttempt ?? 0) + 1,
        pipeline: input.pipeline ?? 'agentic',
        mode: input.mode ?? 'cloud',
      },
      resultMeta: {
        retryOfJobId: job.id,
        retryCreatedAt: new Date().toISOString(),
        previousErrorMessage: job.errorMessage,
      },
    });
    res.status(201).json({
      success: true,
      mode: 'cloud',
      action: 'retry',
      projectId: String(job.projectId),
      previousJobId: job.id,
      jobId: retryJob.id,
      status: 'processing',
      eventsUrl: `/v1/jobs/${retryJob.id}/events`,
    });
  })
);

cloudRouter.delete(
  '/decks/:projectId',
  asyncHandler(async (req, res) => {
    const project = await loadCloudProjectForUser(
      req.params.projectId,
      req.auth!.userId,
      'editor'
    );
    const result = await cascadeDeleteDeckProject(project);
    res.status(200).json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      ...result,
    });
  })
);

cloudRouter.get(
  '/decks/:projectId',
  asyncHandler(async (req, res) => {
    const project = await loadCloudProjectForUser(
      req.params.projectId,
      req.auth!.userId
    );
    const latestJob = await DeckJobModel.findOne({ projectId: project.id })
      .sort({ updatedAt: -1 })
      .lean();
    const meta = isRecord(project.meta) ? project.meta : {};
    res.json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      deckId: project.id,
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        templateId: project.templateId,
      },
      latestJob,
      deckArtifact: meta.deckArtifact ?? null,
    });
  })
);

cloudRouter.get(
  '/decks/:projectId/agent-session',
  asyncHandler(async (req, res) => {
    const project = await loadCloudProjectForUser(
      req.params.projectId,
      req.auth!.userId
    );
    const includeArtifacts = String(req.query.include ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes('artifacts');
    const session = await buildAgentSession(project, { includeArtifacts });
    res.json({ success: true, mode: 'cloud', ...session });
  })
);

cloudRouter.get(
  '/decks/:projectId/versions',
  asyncHandler(async (req, res) => {
    const project = await loadCloudProjectForUser(
      req.params.projectId,
      req.auth!.userId
    );
    const meta = isRecord(project.meta) ? project.meta : {};
    const current =
      isRecord(meta.deckArtifact) && isRecord(meta.deckArtifact.version)
        ? meta.deckArtifact.version
        : null;
    const jobs = await DeckJobModel.find({ projectId: project.id })
      .sort({ createdAt: -1 })
      .select('type status progress resultMeta createdAt finishedAt')
      .lean();
    const versions = jobs
      .map((job) => {
        const resultMeta = isRecord(job.resultMeta) ? job.resultMeta : {};
        const artifact = isRecord(resultMeta.deckArtifact)
          ? resultMeta.deckArtifact
          : null;
        const version = isRecord(artifact?.version) ? artifact.version : null;
        return version
          ? {
              ...version,
              jobId: String(job._id),
              status: job.status,
              source: resultMeta.source ?? artifact?.source ?? null,
            }
          : null;
      })
      .filter(Boolean);
    res.json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      currentVersion: current,
      versions,
    });
  })
);

cloudRouter.post(
  '/decks/:projectId/export',
  asyncHandler(async (req, res) => {
    const parsed = exportCloudDeckSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid cloud export payload',
        parsed.error.issues
      );
    const project = await loadCloudProjectForUser(
      req.params.projectId,
      req.auth!.userId,
      'editor'
    );
    const meta = isRecord(project.meta) ? project.meta : {};
    const artifact = isRecord(meta.deckArtifact) ? meta.deckArtifact : null;
    if (!artifact)
      throw ApiError.badRequest('Deck has no artifact to export yet');

    const exportFile =
      parsed.data.format === 'pptx'
        ? buildPptxExport(project.title, artifact)
        : buildHtmlExport(project.title, artifact);
    const file = await FileModel.create({
      workspaceId: project.workspaceId,
      projectId: project.id,
      scope: 'job',
      kind: 'deck_export',
      filename: exportFile.filename,
      mimeType: exportFile.mimeType,
      sizeBytes: exportFile.buffer.byteLength,
      storageUrl: `data:${
        exportFile.mimeType
      };base64,${exportFile.buffer.toString('base64')}`,
      checksum: sha256Hex(exportFile.buffer.toString('base64')),
      meta: {
        source: 'cloud_export',
        format: parsed.data.format,
        deckVersion: isRecord(artifact.version) ? artifact.version : null,
      },
    });
    await recordUsage(
      String(project.workspaceId),
      `deck.export.${parsed.data.format}`,
      1
    );
    res.status(201).json({
      success: true,
      mode: 'cloud',
      projectId: project.id,
      deckId: project.id,
      exportId: file.id,
      format: parsed.data.format,
      fileId: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      downloadUrl: `/v1/cloud/exports/${file.id}/download`,
    });
  })
);

cloudRouter.get(
  '/exports/:fileId/download',
  asyncHandler(async (req, res) => {
    const file = await FileModel.findById(req.params.fileId);
    if (!file) throw ApiError.notFound('Export not found');
    const membership = await WorkspaceMemberModel.findOne({
      userId: req.auth!.userId,
      workspaceId: file.workspaceId,
    });
    if (!membership) throw ApiError.forbidden('Not a member of this workspace');
    if (!file.storageUrl.startsWith('data:'))
      throw ApiError.badRequest('Export storage is not directly downloadable');
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(file.storageUrl);
    if (!match) throw ApiError.badRequest('Export storage is invalid');
    const buffer = match[2]
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName(file.filename)}"`
    );
    res.send(buffer);
  })
);

async function resolveWorkspaceId(
  userId: string,
  requested?: string
): Promise<string> {
  if (requested) {
    const membership = await WorkspaceMemberModel.findOne({
      userId,
      workspaceId: requested,
    });
    if (!membership) throw ApiError.forbidden('Not a member of that workspace');
    return requested;
  }
  const membership = await WorkspaceMemberModel.findOne({ userId }).sort({
    createdAt: 1,
  });
  if (!membership)
    throw ApiError.badRequest('No workspace available for cloud mode');
  return String(membership.workspaceId);
}

const REUSABLE_FAILED_PROJECT_WINDOW_MS = 30 * 60 * 1000;

async function findReusableFailedProject(params: {
  ownerId: string;
  workspaceId: string;
  description: string;
}) {
  const since = new Date(Date.now() - REUSABLE_FAILED_PROJECT_WINDOW_MS);
  const candidates = await DeckProjectModel.find({
    ownerId: params.ownerId,
    workspaceId: params.workspaceId,
    description: params.description,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(5);
  for (const candidate of candidates) {
    const latestJob = await DeckJobModel.findOne({ projectId: candidate.id })
      .sort({ createdAt: -1 })
      .select('status')
      .lean();
    if (!latestJob) return candidate;
    if (latestJob.status === 'error' || latestJob.status === 'canceled')
      return candidate;
  }
  return null;
}

async function loadCloudProjectForUser(
  projectId: string,
  userId: string,
  minRole: 'viewer' | 'editor' = 'viewer'
) {
  const project = await DeckProjectModel.findById(projectId);
  if (!project) throw ApiError.notFound('Deck project not found');
  const membership = await WorkspaceMemberModel.findOne({
    userId,
    workspaceId: project.workspaceId,
  });
  if (!membership) throw ApiError.forbidden('Not a member of that workspace');
  if (
    minRole === 'editor' &&
    !['owner', 'admin', 'editor'].includes(membership.role)
  ) {
    throw ApiError.forbidden('Editor role or higher required');
  }
  return project;
}

async function loadCloudJobForUser(
  jobId: string,
  userId: string,
  minRole: 'viewer' | 'editor' = 'viewer'
) {
  const job = await DeckJobModel.findById(jobId);
  if (!job) throw ApiError.notFound('Deck job not found');
  const membership = await WorkspaceMemberModel.findOne({
    userId,
    workspaceId: job.workspaceId,
  });
  if (!membership) throw ApiError.forbidden('Not a member of that workspace');
  if (
    minRole === 'editor' &&
    !['owner', 'admin', 'editor'].includes(membership.role)
  ) {
    throw ApiError.forbidden('Editor role or higher required');
  }
  return job;
}

function parseAdvancedToolAgent(value: unknown): AdvancedToolAgent | null {
  const raw =
    typeof value === 'string'
      ? value
      : Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : '';
  const normalized = raw.trim();
  const allowed: AdvancedToolAgent[] = [
    'orchestrator',
    'context',
    'file',
    'research',
    'outline',
    'content',
    'design',
    'visual_asset',
    'qa',
    'export',
    'memory',
  ];
  return allowed.includes(normalized as AdvancedToolAgent)
    ? (normalized as AdvancedToolAgent)
    : null;
}

function parseCloudAgentName(value: unknown): CloudAgentName | null {
  const raw =
    typeof value === 'string'
      ? value
      : Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : '';
  const normalized = raw.trim();
  return (cloudAgentNames as readonly string[]).includes(normalized)
    ? (normalized as CloudAgentName)
    : null;
}

async function classifyAgentMessageWithLlm(
  message: string,
  hasProject: boolean,
  fallback: AgentMessageIntentResult
): Promise<AgentMessageIntentResult> {
  try {
    const provider = await getCloudLlmProvider();
    const prompt = [
      'Classify this YDeck user message. The user may write in any language.',
      'Return only JSON with: intent, confidence, reason, inferredSlideCount, inferredLanguage, refinementKind.',
      'intent must be one of: "chat", "create_deck", "edit_deck".',
      'refinementKind can be "design", "content", "general", or null.',
      'inferredLanguage should be a short BCP-47 language code like "en", "zh", "ru", "uz", "es", "ar", or null.',
      'Use create_deck when the user asks for PPT, PPTX, deck, presentation, slides, or a slide about a topic in any language.',
      'Use edit_deck only if there is an existing project and the user asks to change/refine/edit/regenerate/design the current deck.',
      'Use chat for greetings, thanks, help questions, or general conversation.',
      'Only infer slideCount 1 if the user explicitly asks for one/single/1 slide.',
      '',
      JSON.stringify({ message, hasProject }, null, 2),
    ].join('\n');
    const text = await provider.generate(prompt, {
      temperature: 0,
      maxTokens: 500,
    });
    const parsed = extractJsonObject(text);
    const intent =
      parsed.intent === 'create_deck' ||
      parsed.intent === 'edit_deck' ||
      parsed.intent === 'chat'
        ? parsed.intent
        : fallback.intent;
    return {
      intent,
      confidence: clampConfidence(Number(parsed.confidence ?? 0.75)),
      reason:
        typeof parsed.reason === 'string'
          ? `llm:${parsed.reason}`
          : 'llm_intent_classifier',
      normalizedMessage: message.replace(/\s+/g, ' ').trim(),
      inferredSlideCount:
        parseOptionalSlideCount(parsed.inferredSlideCount) ??
        fallback.inferredSlideCount,
      inferredLanguage:
        parseOptionalLanguage(parsed.inferredLanguage) ??
        fallback.inferredLanguage,
      refinementKind:
        parsed.refinementKind === 'design' ||
        parsed.refinementKind === 'content' ||
        parsed.refinementKind === 'general'
          ? parsed.refinementKind
          : fallback.refinementKind,
    };
  } catch {
    return fallback;
  }
}

function parseOptionalSlideCount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value.trim())
      : NaN;
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined;
  return Math.max(1, Math.min(100, Math.round(numberValue)));
}

function parseOptionalLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(normalized)) return undefined;
  return normalized.slice(0, 20);
}

function extractJsonObject(text: string): Record<string, unknown> {
  const raw =
    /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim() ?? text.trim();
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return isRecord(parsed) ? parsed : {};
    }
    return {};
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.max(0, Math.min(1, value));
}

function buildHtmlExport(
  title: string,
  artifact: Record<string, unknown>
): { filename: string; mimeType: string; buffer: Buffer } {
  const slides = Array.isArray(artifact.slides)
    ? artifact.slides.filter(isRecord)
    : [];
  const body = slides
    .map((slide) => {
      const html =
        (isRecord(slide.preview) && typeof slide.preview.html === 'string'
          ? slide.preview.html
          : null) ??
        (typeof slide.previewHtml === 'string' ? slide.previewHtml : null) ??
        (typeof slide.html === 'string'
          ? slide.html
          : `<section><h1>${escapeXml(
              String(slide.title ?? 'Slide')
            )}</h1></section>`);
      return `<article class="slide-frame">${html}</article>`;
    })
    .join('\n');
  const doc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeXml(title)}</title>
  <style>
    body{margin:0;background:#0f172a;font-family:Arial,sans-serif}
    .slide-frame{width:1920px;height:1080px;margin:0 auto 32px;overflow:hidden;background:#111827}
  </style>
</head>
<body>${body}</body>
</html>`;
  return {
    filename: `${safeFileName(title)}-${randomToken(4)}.html`,
    mimeType: 'text/html',
    buffer: Buffer.from(doc, 'utf8'),
  };
}

function buildPptxExport(
  title: string,
  artifact: Record<string, unknown>
): { filename: string; mimeType: string; buffer: Buffer } {
  const slides = (
    Array.isArray(artifact.slides) ? artifact.slides.filter(isRecord) : []
  ).slice(0, 100);
  const files: Record<string, string | Buffer> = {
    '[Content_Types].xml': contentTypesXml(slides.length),
    '_rels/.rels': rootRelsXml(),
    'ppt/presentation.xml': presentationXml(slides.length),
    'ppt/_rels/presentation.xml.rels': presentationRelsXml(slides.length),
    'ppt/theme/theme1.xml': themeXml(),
    'ppt/slideMasters/slideMaster1.xml': slideMasterXml(),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': slideMasterRelsXml(),
    'ppt/slideLayouts/slideLayout1.xml': slideLayoutXml(),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': slideLayoutRelsXml(),
    'docProps/core.xml': corePropsXml(title),
    'docProps/app.xml': appPropsXml(slides.length),
  };
  slides.forEach((slide, index) => {
    files[`ppt/slides/slide${index + 1}.xml`] = slideXml(slide, index + 1);
    files[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = slideRelsXml();
  });
  return {
    filename: `${safeFileName(title)}-${randomToken(4)}.pptx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: zipStore(files),
  };
}

function zipStore(files: Record<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const entries = Object.entries(files);
  for (const [name, value] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, end]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function contentTypesXml(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${
        i + 1
      }.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slides}
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function presentationXml(slideCount: number): string {
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${ids}</p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000" type="wide"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function presentationRelsXml(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Relationship Id="rId${
        i + 2
      }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${
        i + 1
      }.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slides}
</Relationships>`;
}

function slideXml(slide: Record<string, unknown>, slideNumber: number): string {
  const title = escapeXml(String(slide.title ?? `Slide ${slideNumber}`));
  const bullets = Array.isArray(slide.bullets)
    ? slide.bullets.map((b) => escapeXml(String(b))).slice(0, 6)
    : [];
  const bulletText = bullets.length
    ? bullets.join('\n')
    : escapeXml(String(slide.subtitle ?? slide.body ?? ''));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${pptTextShape(2, 'Title', title, 700000, 650000, 10800000, 900000, 4200, true)}
${pptTextShape(
  3,
  'Body',
  bulletText,
  900000,
  1800000,
  10400000,
  4200000,
  2400,
  false
)}
${pptTextShape(
  4,
  'Footer',
  `YDeck Cloud · ${slideNumber}`,
  900000,
  6200000,
  10400000,
  350000,
  1200,
  false
)}
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function pptTextShape(
  id: number,
  name: string,
  text: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  size: number,
  bold: boolean
): string {
  const paragraphs = text
    .split(/\n+/)
    .filter(Boolean)
    .map(
      (line) =>
        `<a:p><a:r><a:rPr lang="en-US" sz="${size}"${
          bold ? ' b="1"' : ''
        }/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
    )
    .join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(
    name
  )}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${
    paragraphs || '<a:p/>'
  }</p:txBody></p:sp>`;
}

function slideRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="YDeck"><a:themeElements><a:clrScheme name="YDeck"><a:dk1><a:srgbClr val="111827"/></a:dk1><a:lt1><a:srgbClr val="F8FAFC"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="E5E7EB"/></a:lt2><a:accent1><a:srgbClr val="4F46E5"/></a:accent1><a:accent2><a:srgbClr val="06B6D4"/></a:accent2><a:accent3><a:srgbClr val="22C55E"/></a:accent3><a:accent4><a:srgbClr val="F97316"/></a:accent4><a:accent5><a:srgbClr val="64748B"/></a:accent5><a:accent6><a:srgbClr val="0F172A"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="YDeck"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="YDeck"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle/></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function slideMasterRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function slideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function slideLayoutRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function corePropsXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(
    title
  )}</dc:title><dc:creator>YDeck Cloud</dc:creator><cp:lastModifiedBy>YDeck Cloud</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appPropsXml(slideCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>YDeck Cloud</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides></Properties>`;
}

function safeFileName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'ydeck'
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
