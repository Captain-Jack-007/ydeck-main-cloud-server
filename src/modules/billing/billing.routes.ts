import { Router } from "express";

import { asyncHandler } from "../../lib/asyncHandler";
import { requireUser } from "../../middleware/auth";
import { requireWorkspaceRole } from "../../middleware/workspace";
import { ApiError } from "../../lib/errors";
import { SubscriptionModel, type WorkspacePlan } from "../../models";

export const billingRouter: Router = Router();

interface PlanDef {
  id: WorkspacePlan;
  name: string;
  priceMonthlyUsd: number;
  features: string[];
  limits: { decksPerMonth: number; seats: number; cloudStorageMb: number };
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    features: ["Local generation", "Basic templates", "1 device"],
    limits: { decksPerMonth: 10, seats: 1, cloudStorageMb: 100 },
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 12,
    features: ["Cloud generation", "Advanced templates", "Unlimited devices", "Email support"],
    limits: { decksPerMonth: 200, seats: 1, cloudStorageMb: 5_000 },
  },
  {
    id: "team",
    name: "Team",
    priceMonthlyUsd: 29,
    features: ["Everything in Pro", "Team workspaces", "Shared template library", "Priority support"],
    limits: { decksPerMonth: 1000, seats: 10, cloudStorageMb: 50_000 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthlyUsd: 0, // contact sales
    features: ["Everything in Team", "SSO", "Audit logs export", "Custom contract"],
    limits: { decksPerMonth: 999_999, seats: 999, cloudStorageMb: 1_000_000 },
  },
];

billingRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json(PLANS);
  }),
);

billingRouter.get(
  "/workspaces/:workspaceId/subscription",
  requireUser,
  requireWorkspaceRole("viewer"),
  asyncHandler(async (req, res) => {
    const sub = await SubscriptionModel.findOne({ workspaceId: req.params.workspaceId });
    if (!sub) throw ApiError.notFound("Subscription not found");
    res.json(sub.toJSON());
  }),
);
