import { Router, type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireDevice, requireUser } from "../../middleware/auth";
import { requireWorkspaceRole } from "../../middleware/workspace";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import { randomNumericCode, randomToken, sha256Hex } from "../../lib/crypto";
import { env } from "../../config/env";
import { recordUsage } from "../usage/usage.service";
import {
  AuditLogModel,
  DeviceModel,
  PairingCodeModel,
  SubscriptionModel,
  UserModel,
  WorkspaceBrandingModel,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspacePreferenceModel,
} from "../../models";

export const deviceRouter: Router = Router();

const createCodeSchema = z.object({
  workspaceId: z.string().min(1).optional(),
});

const activateSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().max(120).optional(),
  platform: z.string().max(60).optional(),
  appVersion: z.string().max(40).optional(),
  fingerprint: z.string().max(255).optional(),
});

const heartbeatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
const activateLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });

// ---- USER-AUTHED: create pairing code ----
deviceRouter.post(
  "/pairing-codes",
  requireUser,
  validate(createCodeSchema),
  asyncHandler(async (req, res) => {
    const workspaceId = await resolvePairingWorkspaceId(req.auth!.userId, req.body.workspaceId);
    const membership = await WorkspaceMemberModel.findOne({ workspaceId, userId: req.auth!.userId });
    if (!membership) throw ApiError.forbidden("Not a member of that workspace");

    const code = randomNumericCode(6);
    await PairingCodeModel.create({
      userId: req.auth!.userId,
      workspaceId,
      codeHash: sha256Hex(code),
      expiresAt: new Date(Date.now() + env.pairingCodeTtl * 1000),
    });
    await auditDeviceEvent({
      userId: req.auth!.userId,
      workspaceId,
      action: "device.pairing_code.create",
      targetType: "pairing_code",
      req,
    });

    res.status(201).json({
      code,
      expiresInSeconds: env.pairingCodeTtl,
      workspaceId,
    });
  }),
);

// ---- PUBLIC (rate-limited): activate device with code ----
deviceRouter.post(
  "/activate",
  activateLimiter,
  validate(activateSchema),
  asyncHandler(async (req, res) => {
    const codeHash = sha256Hex(req.body.code);
    const pairing = await PairingCodeModel.findOneAndUpdate(
      { codeHash, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true },
    );
    if (!pairing) {
      await auditDeviceEvent({
        action: "device.activate.failed",
        targetType: "pairing_code",
        req,
        meta: { reason: "invalid_or_expired_code" },
      });
      throw new ApiError(401, "INVALID_PAIRING_CODE", "Invalid or expired pairing code");
    }

    const rawToken = randomToken(32);
    const device = await DeviceModel.create({
      workspaceId: pairing.workspaceId,
      userId: pairing.userId,
      name: req.body.deviceName ?? null,
      platform: req.body.platform ?? null,
      appVersion: req.body.appVersion ?? null,
      fingerprint: req.body.fingerprint ?? null,
      tokenPrefix: rawToken.slice(0, 8),
      tokenHash: sha256Hex(rawToken),
      status: "active",
      lastIp: req.ip,
      expiresAt: new Date(Date.now() + env.deviceTokenTtl * 1000),
    });
    await recordUsage(String(pairing.workspaceId), "device.activated", 1);
    await auditDeviceEvent({
      userId: String(pairing.userId),
      workspaceId: String(pairing.workspaceId),
      action: "device.activate",
      targetType: "device",
      targetId: device.id,
      req,
      meta: { platform: device.platform, appVersion: device.appVersion },
    });

    res.status(201).json({
      deviceId: device.id,
      deviceToken: rawToken,
      workspaceId: String(device.workspaceId),
      expiresAt: device.expiresAt,
    });
  }),
);

// ---- USER-AUTHED: list / revoke devices in a workspace ----
deviceRouter.get(
  "/workspaces/:workspaceId",
  requireUser,
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const devices = await DeviceModel.find({ workspaceId: req.params.workspaceId })
      .sort({ createdAt: -1 })
      .select("name platform appVersion fingerprint tokenPrefix status lastHeartbeatAt lastSeenAt pairedAt expiresAt revokedAt revokedBy createdAt");
    res.json(devices.map((d) => d.toJSON()));
  }),
);

deviceRouter.delete(
  "/workspaces/:workspaceId/:deviceId",
  requireUser,
  requireWorkspaceRole("admin"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.deviceId)) throw ApiError.notFound("Device not found");
    const device = await DeviceModel.findById(req.params.deviceId);
    if (!device || String(device.workspaceId) !== req.params.workspaceId) throw ApiError.notFound("Device not found");
    device.status = "revoked";
    device.revokedAt = new Date();
    device.set("revokedBy", req.auth!.userId);
    await device.save();
    await auditDeviceEvent({
      userId: req.auth!.userId,
      workspaceId: req.params.workspaceId,
      action: "device.revoke",
      targetType: "device",
      targetId: device.id,
      req,
    });
    res.json({ success: true });
  }),
);

// ---- DEVICE-AUTHED: heartbeat + license check ----
deviceRouter.post(
  "/heartbeat",
  heartbeatLimiter,
  requireDevice,
  asyncHandler(async (req, res) => {
    await DeviceModel.updateOne(
      { _id: req.device!.deviceId },
      { $set: { lastHeartbeatAt: new Date(), lastSeenAt: new Date(), lastIp: req.ip ?? null } },
    );
    res.json({ ok: true, serverTime: new Date().toISOString() });
  }),
);

deviceRouter.get(
  "/license-check",
  requireDevice,
  asyncHandler(async (req, res) => {
    const workspace = await WorkspaceModel.findById(req.device!.workspaceId);
    if (!workspace) throw ApiError.notFound("Workspace not found");
    const sub = await SubscriptionModel.findOne({ workspaceId: workspace.id });
    const validUntil = sub?.currentPeriodEnd ?? new Date(Date.now() + env.deviceTokenTtl * 1000);
    res.json({
      workspaceId: workspace.id,
      plan: "local",
      subscriptionStatus: sub?.status ?? "active",
      validUntil,
      features: featuresForPlan("local"),
    });
  }),
);

deviceRouter.get(
  "/context",
  requireDevice,
  asyncHandler(async (req, res) => {
    const device = await DeviceModel.findById(req.device!.deviceId);
    if (!device) throw ApiError.unauthorized("Invalid device token");

    const workspace = await WorkspaceModel.findById(req.device!.workspaceId);
    if (!workspace) throw ApiError.notFound("Workspace not found");

    const contextUserId = device.userId ?? workspace.ownerId;
    const [user, membership, preferences, branding, sub] = await Promise.all([
      UserModel.findById(contextUserId),
      WorkspaceMemberModel.findOne({ workspaceId: workspace.id, userId: contextUserId }),
      WorkspacePreferenceModel.findOne({ workspaceId: workspace.id }),
      WorkspaceBrandingModel.findOne({ workspaceId: workspace.id }),
      SubscriptionModel.findOne({ workspaceId: workspace.id }),
    ]);
    if (!user) throw ApiError.notFound("User not found");

    const validUntil = sub?.currentPeriodEnd ?? device.expiresAt;
    res.json({
      user: {
        id: user.id,
        fullName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        role: membership?.role ?? "owner",
      },
      preferences: {
        language: preferences?.language ?? user.locale ?? "en",
        defaultDeckType: preferences?.defaultDeckType ?? "general",
        defaultStyle: preferences?.defaultStyle ?? "modern",
        defaultSlideCount: preferences?.defaultSlideCount ?? 10,
      },
      branding: {
        companyName: branding?.companyName ?? null,
        productName: branding?.productName ?? workspace.name,
        primaryColor: branding?.primaryColor ?? null,
        accentColor: branding?.accentColor ?? null,
        logoUrl: branding?.logoUrl ?? null,
      },
      license: {
        plan: "local",
        subscriptionStatus: sub?.status ?? "active",
        validUntil,
        features: featuresForPlan("local"),
      },
    });
  }),
);

const desktopDeviceErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (!(err instanceof ApiError)) return next(err);
  res.status(err.status).json({
    success: false,
    error: err.code === "UNAUTHORIZED" ? "UNAUTHENTICATED" : err.code,
    message: err.message,
  });
};

deviceRouter.use(desktopDeviceErrorHandler);

function featuresForPlan(plan: string): Record<string, boolean> {
  if (plan === "local") {
    return {
      privateAgent: true,
      cloudDecks: true,
      advancedTemplates: true,
    };
  }
  return {
    privateAgent: plan === "pro" || plan === "team" || plan === "enterprise",
    cloudDecks: true,
    advancedTemplates: plan === "pro" || plan === "team" || plan === "enterprise",
    teamWorkspaces: plan === "team" || plan === "enterprise",
    sso: plan === "enterprise",
  };
}

async function resolvePairingWorkspaceId(userId: string, requested?: string): Promise<string> {
  if (requested) {
    if (!isObjectId(requested)) throw ApiError.badRequest("Invalid workspaceId");
    return requested;
  }
  const membership = await WorkspaceMemberModel.findOne({ userId }).sort({ createdAt: 1 });
  if (!membership) throw ApiError.badRequest("No workspace available for pairing");
  return String(membership.workspaceId);
}

async function auditDeviceEvent(input: {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  req: { ip?: string; headers: Record<string, unknown> };
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditLogModel.create({
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ip: input.req.ip ?? null,
    userAgent: typeof input.req.headers["user-agent"] === "string" ? input.req.headers["user-agent"] : null,
    meta: input.meta ?? null,
  });
}
