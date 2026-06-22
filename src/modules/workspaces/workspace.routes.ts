import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { requireWorkspaceRole } from "../../middleware/workspace";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import {
  SubscriptionModel,
  UserModel,
  WorkspaceBrandingModel,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspacePreferenceModel,
  type MemberRole,
} from "../../models";

export const workspaceRouter: Router = Router();

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
});

const updateRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

const brandingSchema = z.object({
  companyName: z.string().min(1).max(120).nullable().optional(),
  productName: z.string().min(1).max(120).nullable().optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

const preferencesSchema = z.object({
  language: z.string().min(2).max(20).optional(),
  defaultDeckType: z.string().min(1).max(80).optional(),
  defaultStyle: z.string().min(1).max(80).optional(),
  defaultSlideCount: z.number().int().min(1).max(100).optional(),
});

workspaceRouter.use(requireUser);

// List workspaces I'm a member of
workspaceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const memberships = await WorkspaceMemberModel.find({ userId: req.auth!.userId })
      .sort({ createdAt: 1 })
      .populate("workspaceId");

    const wsIds = memberships
      .map((m) => (m.workspaceId as unknown as { id?: string }).id)
      .filter((v): v is string => !!v);
    const subs = await SubscriptionModel.find({ workspaceId: { $in: wsIds } });
    const subByWs = new Map(subs.map((s) => [String(s.workspaceId), s.toJSON()]));

    res.json(
      memberships.map((m) => {
        const ws = m.workspaceId as unknown as { id: string; name: string; plan: string; isPersonal: boolean };
        return {
          id: ws.id,
          name: ws.name,
          plan: ws.plan,
          isPersonal: ws.isPersonal,
          role: m.role,
          subscription: subByWs.get(ws.id) ?? null,
        };
      }),
    );
  }),
);

workspaceRouter.post(
  "/",
  validate(createWorkspaceSchema),
  asyncHandler(async (req, res) => {
    const ws = await WorkspaceModel.create({
      name: req.body.name,
      ownerId: req.auth!.userId,
      isPersonal: false,
    });
    await WorkspaceMemberModel.create({
      workspaceId: ws.id,
      userId: req.auth!.userId,
      role: "owner",
      acceptedAt: new Date(),
    });
    await SubscriptionModel.create({ workspaceId: ws.id, plan: "free", status: "active" });
    await WorkspacePreferenceModel.create({ workspaceId: ws.id });
    await WorkspaceBrandingModel.create({
      workspaceId: ws.id,
      companyName: req.body.name,
      productName: "YDeck",
      primaryColor: "#6d28d9",
      accentColor: "#2563eb",
    });
    res.status(201).json(ws.toJSON());
  }),
);

workspaceRouter.get(
  "/:workspaceId",
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const ws = await WorkspaceModel.findById(req.params.workspaceId);
    if (!ws) throw ApiError.notFound("Workspace not found");
    const [sub, branding, preferences] = await Promise.all([
      SubscriptionModel.findOne({ workspaceId: ws.id }),
      WorkspaceBrandingModel.findOne({ workspaceId: ws.id }),
      WorkspacePreferenceModel.findOne({ workspaceId: ws.id }),
    ]);
    res.json({
      ...ws.toJSON(),
      branding: branding ? branding.toJSON() : defaultBranding(ws.id, ws.name),
      preferences: preferences ? preferences.toJSON() : defaultPreferences(ws.id),
      subscription: sub ? sub.toJSON() : null,
    });
  }),
);

workspaceRouter.get(
  "/:workspaceId/branding",
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const branding = await WorkspaceBrandingModel.findOne({ workspaceId: req.params.workspaceId });
    res.json(branding ? branding.toJSON() : defaultBranding(req.params.workspaceId));
  }),
);

workspaceRouter.patch(
  "/:workspaceId/branding",
  requireWorkspaceRole("admin"),
  validate(brandingSchema),
  asyncHandler(async (req, res) => {
    const branding = await WorkspaceBrandingModel.findOneAndUpdate(
      { workspaceId: req.params.workspaceId },
      { $set: req.body },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json(branding.toJSON());
  }),
);

workspaceRouter.get(
  "/:workspaceId/preferences",
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const preferences = await WorkspacePreferenceModel.findOne({ workspaceId: req.params.workspaceId });
    res.json(preferences ? preferences.toJSON() : defaultPreferences(req.params.workspaceId));
  }),
);

workspaceRouter.patch(
  "/:workspaceId/preferences",
  requireWorkspaceRole("admin"),
  validate(preferencesSchema),
  asyncHandler(async (req, res) => {
    const preferences = await WorkspacePreferenceModel.findOneAndUpdate(
      { workspaceId: req.params.workspaceId },
      { $set: req.body },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json(preferences.toJSON());
  }),
);

// Members
workspaceRouter.get(
  "/:workspaceId/members",
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const members = await WorkspaceMemberModel.find({ workspaceId: req.params.workspaceId })
      .sort({ createdAt: 1 })
      .populate("userId", "email displayName avatarUrl");
    res.json(
      members.map((m) => {
        const u = m.userId as unknown as { id: string; email: string; displayName: string | null; avatarUrl: string | null };
        return {
          id: m.id,
          workspaceId: String(m.workspaceId),
          role: m.role,
          invitedAt: m.invitedAt,
          acceptedAt: m.acceptedAt,
          user: { id: u.id, email: u.email, displayName: u.displayName, avatarUrl: u.avatarUrl },
        };
      }),
    );
  }),
);

workspaceRouter.post(
  "/:workspaceId/members",
  requireWorkspaceRole("admin"),
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const target = await UserModel.findOne({ email: req.body.email.toLowerCase() });
    if (!target) throw ApiError.notFound("User with that email does not exist");

    const existing = await WorkspaceMemberModel.findOne({
      workspaceId: req.params.workspaceId,
      userId: target.id,
    });
    if (existing) throw ApiError.conflict("User is already a member");

    const member = await WorkspaceMemberModel.create({
      workspaceId: req.params.workspaceId,
      userId: target.id,
      role: req.body.role as MemberRole,
      invitedAt: new Date(),
      acceptedAt: new Date(), // MVP: auto-accept; full impl would email an invite token
    });
    res.status(201).json(member.toJSON());
  }),
);

workspaceRouter.patch(
  "/:workspaceId/members/:userId",
  requireWorkspaceRole("admin"),
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.userId)) throw ApiError.notFound("Member not found");
    const member = await WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId: req.params.workspaceId, userId: req.params.userId },
      { $set: { role: req.body.role as MemberRole } },
      { new: true },
    );
    if (!member) throw ApiError.notFound("Member not found");
    res.json(member.toJSON());
  }),
);

workspaceRouter.delete(
  "/:workspaceId/members/:userId",
  requireWorkspaceRole("admin"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.userId)) throw ApiError.notFound("Member not found");
    const target = await WorkspaceMemberModel.findOne({
      workspaceId: req.params.workspaceId,
      userId: req.params.userId,
    });
    if (!target) throw ApiError.notFound("Member not found");
    if (target.role === "owner") throw ApiError.forbidden("Cannot remove owner");

    await target.deleteOne();
    res.status(204).end();
  }),
);

function defaultBranding(workspaceId: string, workspaceName?: string) {
  return {
    workspaceId,
    companyName: null,
    productName: workspaceName ?? null,
    logoUrl: null,
    primaryColor: "#6d28d9",
    accentColor: "#2563eb",
  };
}

function defaultPreferences(workspaceId: string) {
  return {
    workspaceId,
    language: "en",
    defaultDeckType: "general",
    defaultStyle: "modern",
    defaultSlideCount: 10,
  };
}
