import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { ApiError } from "../../lib/errors";
import { requireUser } from "../../middleware/auth";
import {
  WorkspaceBrandingModel,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspacePreferenceModel,
} from "../../models";
import { isObjectId } from "../../lib/ids";

export const userRouter: Router = Router();

const settingsPatchSchema = z.object({
  workspaceId: z.string().optional(),
  language: z.string().min(2).max(20).optional(),
  defaultDeckType: z.string().min(1).max(80).optional(),
  defaultDesignStyle: z.string().min(1).max(80).optional(),
  defaultStyle: z.string().min(1).max(80).optional(),
  defaultSlideCount: z.number().int().min(1).max(100).optional(),
  branding: z
    .object({
      companyName: z.string().min(1).max(120).nullable().optional(),
      productName: z.string().min(1).max(120).nullable().optional(),
      logoUrl: z.string().url().max(2048).nullable().optional(),
      logoPath: z.string().max(2048).nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    })
    .optional(),
});

userRouter.use(requireUser);

userRouter.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const workspaceId = await resolveSettingsWorkspaceId(req.auth!.userId, req.query.workspaceId);
    res.json(await buildSettingsResponse(workspaceId));
  }),
);

userRouter.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const parsed = settingsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw ApiError.badRequest("Invalid settings payload", parsed.error.issues);

    const workspaceId = await resolveSettingsWorkspaceId(req.auth!.userId, parsed.data.workspaceId);
    const preferencePatch: Record<string, unknown> = {};
    if (parsed.data.language !== undefined) preferencePatch.language = parsed.data.language;
    if (parsed.data.defaultDeckType !== undefined) preferencePatch.defaultDeckType = parsed.data.defaultDeckType;
    if (parsed.data.defaultDesignStyle !== undefined) preferencePatch.defaultStyle = parsed.data.defaultDesignStyle;
    if (parsed.data.defaultStyle !== undefined) preferencePatch.defaultStyle = parsed.data.defaultStyle;
    if (parsed.data.defaultSlideCount !== undefined) preferencePatch.defaultSlideCount = parsed.data.defaultSlideCount;

    const brandingPatch = parsed.data.branding ? { ...parsed.data.branding } : undefined;
    if (brandingPatch) delete brandingPatch.logoPath;

    await Promise.all([
      Object.keys(preferencePatch).length
        ? WorkspacePreferenceModel.findOneAndUpdate(
            { workspaceId },
            { $set: preferencePatch },
            { new: true, upsert: true, setDefaultsOnInsert: true },
          )
        : Promise.resolve(null),
      brandingPatch && Object.keys(brandingPatch).length
        ? WorkspaceBrandingModel.findOneAndUpdate(
            { workspaceId },
            { $set: brandingPatch },
            { new: true, upsert: true, setDefaultsOnInsert: true },
          )
        : Promise.resolve(null),
    ]);

    res.json({ success: true, settings: await buildSettingsResponse(workspaceId) });
  }),
);

async function resolveSettingsWorkspaceId(userId: string, requested: unknown): Promise<string> {
  const requestedId = typeof requested === "string" && requested ? requested : undefined;
  if (requestedId) {
    if (!isObjectId(requestedId)) throw ApiError.badRequest("Invalid workspaceId");
    const membership = await WorkspaceMemberModel.findOne({ userId, workspaceId: requestedId });
    if (!membership) throw ApiError.forbidden("Not a member of this workspace");
    return requestedId;
  }

  const membership = await WorkspaceMemberModel.findOne({ userId }).sort({ createdAt: 1 });
  if (!membership) throw ApiError.badRequest("No workspace available");
  return String(membership.workspaceId);
}

async function buildSettingsResponse(workspaceId: string) {
  const [workspace, preferences, branding] = await Promise.all([
    WorkspaceModel.findById(workspaceId),
    WorkspacePreferenceModel.findOne({ workspaceId }),
    WorkspaceBrandingModel.findOne({ workspaceId }),
  ]);
  if (!workspace) throw ApiError.notFound("Workspace not found");

  return {
    workspaceId,
    language: preferences?.language ?? "en",
    defaultDeckType: preferences?.defaultDeckType ?? "general",
    defaultDesignStyle: preferences?.defaultStyle ?? "modern",
    defaultSlideCount: preferences?.defaultSlideCount ?? 10,
    branding: {
      companyName: branding?.companyName ?? null,
      productName: branding?.productName ?? null,
      logoPath: null,
      logoUrl: branding?.logoUrl ?? null,
      primaryColor: branding?.primaryColor ?? "#111827",
      accentColor: branding?.accentColor ?? "#2563eb",
    },
  };
}
