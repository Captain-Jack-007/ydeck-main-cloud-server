import { Router } from "express";

import { asyncHandler } from "../../lib/asyncHandler";
import { requireUser } from "../../middleware/auth";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import { FileModel, WorkspaceMemberModel } from "../../models";

export const filesRouter: Router = Router();

filesRouter.use(requireUser);

/**
 * Stream a stored file (e.g. an exported .pptx) as a download. Files are stored
 * as base64 `data:` URLs on the File doc (see file.tools.ts / exportJob.ts);
 * external HTTP URLs are redirected.
 */
filesRouter.get(
  "/:fileId/download",
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.fileId)) throw ApiError.notFound("File not found");
    const file = await FileModel.findById(req.params.fileId);
    if (!file) throw ApiError.notFound("File not found");

    const member = await WorkspaceMemberModel.findOne({
      workspaceId: file.workspaceId,
      userId: req.auth!.userId,
    });
    if (!member) throw ApiError.forbidden("Not a member of this workspace");

    const url = file.storageUrl;
    const dataMatch = /^data:([^;]+);base64,(.*)$/s.exec(url);
    if (dataMatch) {
      const buf = Buffer.from(dataMatch[2], "base64");
      res.setHeader("Content-Type", file.mimeType ?? dataMatch[1]);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      res.setHeader("Content-Length", String(buf.byteLength));
      res.send(buf);
      return;
    }

    if (/^https?:\/\//.test(url)) {
      res.redirect(url);
      return;
    }

    throw ApiError.badRequest(`Unsupported storage URL for file ${file.id}`);
  }),
);
