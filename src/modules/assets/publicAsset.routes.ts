import { Router } from "express";

import { asyncHandler } from "../../lib/asyncHandler";
import { ApiError } from "../../lib/errors";
import { FileModel } from "../../models";

export const publicAssetRouter: Router = Router();

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

publicAssetRouter.get(
  "/images/:fileId",
  asyncHandler(async (req, res) => {
    const file = await FileModel.findById(req.params.fileId).lean();
    if (!file) throw ApiError.notFound("Image asset not found");
    if (file.kind !== "image_asset") throw ApiError.notFound("Not an image asset");
    const storageUrl = String(file.storageUrl ?? "");
    const match = DATA_URL_RE.exec(storageUrl);
    if (!match) throw ApiError.badRequest("Image asset storage is not directly servable");
    const mimeType = file.mimeType || match[1] || "image/jpeg";
    const buffer = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "utf8");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.send(buffer);
  }),
);
