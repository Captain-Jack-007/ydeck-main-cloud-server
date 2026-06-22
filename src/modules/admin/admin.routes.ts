import { Router } from 'express';
import { Types } from 'mongoose';

import { asyncHandler } from '../../lib/asyncHandler';
import { requireAdmin, requireUser } from '../../middleware/auth';
import { ApiError } from '../../lib/errors';
import { isObjectId } from '../../lib/ids';
import {
  CLOUD_MODELS,
  CLOUD_PROVIDERS,
  effectiveCloudConfig,
  getCloudModelStatus,
  testCloudProvider,
  type CloudProviderName,
} from '../agents/cloudLlm';
import {
  DeckProjectModel,
  DeviceModel,
  SessionModel,
  SubscriptionModel,
  UsageRecordModel,
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from '../../models';
import { z } from 'zod';

export const adminRouter: Router = Router();

adminRouter.use(requireUser, requireAdmin);

function maskKey(key: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

const StoredCloudProviderSchema = z.enum([
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'openai-compatible',
]);

// ---- users ----
adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const users = await UserModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('email displayName isAdmin createdAt emailVerifiedAt');
    res.json(users.map((u) => u.toJSON()));
  })
);

adminRouter.post(
  '/users/:userId/disable',
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.userId))
      throw ApiError.notFound('User not found');
    const u = await UserModel.findById(req.params.userId);
    if (!u) throw ApiError.notFound('User not found');
    await SessionModel.updateMany(
      { userId: u.id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    res.json({ ok: true, revokedSessions: true });
  })
);

// ---- devices ----
adminRouter.get(
  '/devices',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const devices = await DeviceModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('workspaceId name platform status lastSeenAt pairedAt expiresAt');
    res.json(devices.map((d) => d.toJSON()));
  })
);

adminRouter.post(
  '/devices/:deviceId/revoke',
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.deviceId))
      throw ApiError.notFound('Device not found');
    const d = await DeviceModel.findById(req.params.deviceId);
    if (!d) throw ApiError.notFound('Device not found');
    d.status = 'revoked';
    await d.save();
    res.json({ ok: true });
  })
);

// ---- workspaces / usage ----
adminRouter.get(
  '/workspaces',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const workspaces = await WorkspaceModel.find()
      .sort({ createdAt: -1 })
      .limit(limit);
    const wsIds = workspaces.map((w) => w.id);

    const [subs, memberCounts, projectCounts, deviceCounts] = await Promise.all(
      [
        SubscriptionModel.find({ workspaceId: { $in: wsIds } }),
        WorkspaceMemberModel.aggregate([
          {
            $match: { workspaceId: { $in: wsIds.map((id) => toObjectId(id)) } },
          },
          { $group: { _id: '$workspaceId', n: { $sum: 1 } } },
        ]),
        DeckProjectModel.aggregate([
          {
            $match: { workspaceId: { $in: wsIds.map((id) => toObjectId(id)) } },
          },
          { $group: { _id: '$workspaceId', n: { $sum: 1 } } },
        ]),
        DeviceModel.aggregate([
          {
            $match: { workspaceId: { $in: wsIds.map((id) => toObjectId(id)) } },
          },
          { $group: { _id: '$workspaceId', n: { $sum: 1 } } },
        ]),
      ]
    );

    const subByWs = new Map(
      subs.map((s) => [String(s.workspaceId), s.toJSON()])
    );
    const toMap = (
      arr: Array<{ _id: unknown; n: number }>
    ): Map<string, number> => new Map(arr.map((r) => [String(r._id), r.n]));
    const mc = toMap(memberCounts);
    const pc = toMap(projectCounts);
    const dc = toMap(deviceCounts);

    res.json(
      workspaces.map((w) => ({
        ...w.toJSON(),
        subscription: subByWs.get(w.id) ?? null,
        _count: {
          members: mc.get(w.id) ?? 0,
          projects: pc.get(w.id) ?? 0,
          devices: dc.get(w.id) ?? 0,
        },
      }))
    );
  })
);

adminRouter.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const workspaceId = req.query.workspaceId as string | undefined;
    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const match: Record<string, unknown> = { occurredAt: { $gte: since } };
    if (workspaceId && isObjectId(workspaceId))
      match.workspaceId = toObjectId(workspaceId);

    const records = await UsageRecordModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { workspaceId: '$workspaceId', metric: '$metric' },
          sum: { $sum: '$quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          workspaceId: { $toString: '$_id.workspaceId' },
          metric: '$_id.metric',
          _sum: { quantity: '$sum' },
        },
      },
    ]);
    res.json(records);
  })
);

// ---- cloud mode / model providers ----
adminRouter.get(
  '/models/status',
  asyncHandler(async (_req, res) => {
    res.json(await getCloudModelStatus());
  })
);

adminRouter.get(
  '/models',
  asyncHandler(async (_req, res) => {
    const cfg = await effectiveCloudConfig();
    const status = await getCloudModelStatus();
    res.json({
      active: {
        provider: cfg.llmProvider,
        model:
          cfg.llmProvider === 'mock' ? 'mock' : cfg.models[cfg.llmProvider],
        mode: 'cloud',
        streamOutput: cfg.streamOutput,
        logOutput: cfg.logOutput,
      },
      status,
      availableProviders: CLOUD_PROVIDERS,
    });
  })
);

adminRouter.get(
  '/cloud-providers',
  asyncHandler(async (_req, res) => {
    const cfg = await effectiveCloudConfig();
    const providers = CLOUD_PROVIDERS.filter((p) => p !== 'mock').map((p) => {
      const provider = p as Exclude<CloudProviderName, 'mock'>;
      return {
        provider,
        hasKey: cfg.keys[provider].length > 0,
        maskedKey: maskKey(cfg.keys[provider]),
        model: cfg.models[provider],
        baseUrl:
          provider === 'openai-compatible'
            ? cfg.baseUrls['openai-compatible']
            : undefined,
        models: CLOUD_MODELS[provider],
      };
    });
    res.json({
      mode: 'cloud',
      activeProvider: cfg.llmProvider,
      streamOutput: cfg.streamOutput,
      logOutput: cfg.logOutput,
      providers,
    });
  })
);

const CloudTestSchema = z.object({
  provider: StoredCloudProviderSchema,
  model: z.string().min(1).max(200).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

adminRouter.post(
  '/cloud-providers/test',
  asyncHandler(async (req, res) => {
    const parsed = CloudTestSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw ApiError.badRequest(
        'Invalid cloud test payload',
        parsed.error.issues
      );
    const status = await testCloudProvider(parsed.data);
    res.json({
      ok: status.status === 'available' || status.status === 'unknown',
      status,
    });
  })
);

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
