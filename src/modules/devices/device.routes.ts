import { Router } from "express";
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
  workspaceId: z.string().min(1),
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
    if (!isObjectId(req.body.workspaceId)) throw ApiError.badRequest("Invalid workspaceId");
    const membership = await WorkspaceMemberModel.findOne({
      workspaceId: req.body.workspaceId,
      userId: req.auth!.userId,
    });
    if (!membership) throw ApiError.forbidden("Not a member of that workspace");

    const code = randomNumericCode(6);
    await PairingCodeModel.create({
      userId: req.auth!.userId,
      workspaceId: req.body.workspaceId,
      codeHash: sha256Hex(code),
      expiresAt: new Date(Date.now() + env.pairingCodeTtl * 1000),
    });

    res.status(201).json({
      code,
      expiresInSeconds: env.pairingCodeTtl,
      workspaceId: req.body.workspaceId,
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
    const pairing = await PairingCodeModel.findOne({ codeHash });
    if (!pairing) throw ApiError.unauthorized("Invalid code");
    if (pairing.usedAt) throw ApiError.unauthorized("Code already used");
    if (pairing.expiresAt < new Date()) throw ApiError.unauthorized("Code expired");

    const rawToken = randomToken(32);
    const device = await DeviceModel.create({
      workspaceId: pairing.workspaceId,
      userId: pairing.userId,
      name: req.body.deviceName ?? null,
      platform: req.body.platform ?? null,
      appVersion: req.body.appVersion ?? null,
      fingerprint: req.body.fingerprint ?? null,
      tokenHash: sha256Hex(rawToken),
      status: "active",
      lastIp: req.ip,
      expiresAt: new Date(Date.now() + env.deviceTokenTtl * 1000),
    });

    pairing.usedAt = new Date();
    await pairing.save();
    await recordUsage(String(pairing.workspaceId), "device.activated", 1);

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
      .select("name platform appVersion status lastSeenAt pairedAt expiresAt");
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
    await device.save();
    res.status(204).end();
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
      { $set: { lastSeenAt: new Date(), lastIp: req.ip ?? null } },
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
    const validUntil = sub?.currentPeriodEnd ?? new Date(Date.now() + 24 * 3600 * 1000);
    res.json({
      workspaceId: workspace.id,
      plan: workspace.plan,
      subscriptionStatus: sub?.status ?? "active",
      validUntil,
      features: featuresForPlan(workspace.plan),
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

    const validUntil = sub?.currentPeriodEnd ?? new Date(Date.now() + 24 * 3600 * 1000);
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
        plan: workspace.plan,
        subscriptionStatus: sub?.status ?? "active",
        validUntil,
        features: featuresForPlan(workspace.plan),
      },
    });
  }),
);

function featuresForPlan(plan: string): Record<string, boolean> {
  return {
    privateAgent: plan === "pro" || plan === "team" || plan === "enterprise",
    cloudDecks: true,
    advancedTemplates: plan === "pro" || plan === "team" || plan === "enterprise",
    teamWorkspaces: plan === "team" || plan === "enterprise",
    sso: plan === "enterprise",
  };
}
