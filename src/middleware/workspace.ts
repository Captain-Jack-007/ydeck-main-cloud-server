import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { WorkspaceMemberModel, type MemberRole } from "../models";
import { isObjectId } from "../lib/ids";

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

/**
 * Loads the workspace id from req.params.workspaceId and confirms the authed user
 * has at least `minRole` permission. Attaches resolved role to req.workspaceRole.
 */
export function requireWorkspaceRole(minRole: MemberRole = "viewer") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) return next(ApiError.unauthorized());
    const workspaceId = req.params.workspaceId;
    if (!workspaceId || !isObjectId(workspaceId)) return next(ApiError.badRequest("Missing or invalid workspaceId"));

    try {
      const membership = await WorkspaceMemberModel.findOne({
        workspaceId,
        userId: req.auth.userId,
      });
      if (!membership) return next(ApiError.forbidden("Not a member of this workspace"));
      const role = membership.role as MemberRole;
      if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return next(ApiError.forbidden(`Role '${minRole}' or higher required`));
      }
      (req as Request & { workspaceRole?: MemberRole }).workspaceRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
