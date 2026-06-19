import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { requireWorkspaceRole } from "../../middleware/workspace";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import {
  InstalledPackModel,
  PluginPackModel,
  TemplatePackModel,
  WorkspaceModel,
  type PackType,
  type WorkspacePlan,
} from "../../models";

export const packsRouter: Router = Router();

const PLAN_RANK: Record<WorkspacePlan, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

function ensurePlanAtLeast(workspacePlan: WorkspacePlan, minPlan: WorkspacePlan): void {
  if (PLAN_RANK[workspacePlan] < PLAN_RANK[minPlan]) {
    throw ApiError.forbidden(`Requires '${minPlan}' plan or higher`);
  }
}

// ---- public catalogue ----
packsRouter.get(
  "/templates",
  asyncHandler(async (_req, res) => {
    const items = await TemplatePackModel.find().sort({ name: 1 });
    res.json(items.map((i) => i.toJSON()));
  }),
);

packsRouter.get(
  "/templates/:slug",
  asyncHandler(async (req, res) => {
    const item = await TemplatePackModel.findOne({ slug: req.params.slug });
    if (!item) throw ApiError.notFound("Template not found");
    res.json(item.toJSON());
  }),
);

packsRouter.get(
  "/plugins",
  asyncHandler(async (_req, res) => {
    const items = await PluginPackModel.find().sort({ name: 1 });
    res.json(items.map((i) => i.toJSON()));
  }),
);

packsRouter.get(
  "/plugins/:slug",
  asyncHandler(async (req, res) => {
    const item = await PluginPackModel.findOne({ slug: req.params.slug });
    if (!item) throw ApiError.notFound("Plugin not found");
    res.json(item.toJSON());
  }),
);

// ---- installed packs (per workspace) ----
const installSchema = z.object({
  packType: z.enum(["template", "plugin"]),
  packSlug: z.string().min(1),
});

packsRouter.get(
  "/workspaces/:workspaceId/installed-packs",
  requireUser,
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const items = await InstalledPackModel.find({ workspaceId: req.params.workspaceId })
      .sort({ installedAt: -1 });
    res.json(items.map((i) => i.toJSON()));
  }),
);

packsRouter.post(
  "/workspaces/:workspaceId/installed-packs",
  requireUser,
  requireWorkspaceRole("editor"),
  validate(installSchema),
  asyncHandler(async (req, res) => {
    const workspace = await WorkspaceModel.findById(req.params.workspaceId);
    if (!workspace) throw ApiError.notFound("Workspace not found");

    const packType = req.body.packType as PackType;
    const pack = packType === "template"
      ? await TemplatePackModel.findOne({ slug: req.body.packSlug })
      : await PluginPackModel.findOne({ slug: req.body.packSlug });
    if (!pack) throw ApiError.notFound("Pack not found");
    ensurePlanAtLeast(workspace.plan as WorkspacePlan, pack.minPlan as WorkspacePlan);

    const installed = await InstalledPackModel.findOneAndUpdate(
      { workspaceId: workspace.id, packType, packSlug: pack.slug },
      { $set: { packVersion: pack.version, enabled: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.status(201).json(installed!.toJSON());
  }),
);

packsRouter.delete(
  "/workspaces/:workspaceId/installed-packs/:installedId",
  requireUser,
  requireWorkspaceRole("editor"),
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.installedId)) throw ApiError.notFound("Installed pack not found");
    const installed = await InstalledPackModel.findById(req.params.installedId);
    if (!installed || String(installed.workspaceId) !== req.params.workspaceId) {
      throw ApiError.notFound("Installed pack not found");
    }
    await installed.deleteOne();
    res.status(204).end();
  }),
);
