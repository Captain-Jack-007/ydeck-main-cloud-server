import { z } from "zod";

import { registerTool } from "./registry";
import {
  listImageAssets,
  searchImages,
  selectImage,
  uploadUserImageAsset,
} from "../../assets/imageAsset.service";

const SearchImagesArgsSchema = z.object({
  query: z.string().min(1).max(500),
  orientation: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  style: z.string().max(200).optional(),
  count: z.number().int().min(1).max(12).default(8),
  sources: z.array(z.enum(["pexels", "user_upload"])).default(["pexels"]),
});

const SelectImageArgsSchema = z.object({
  assetCandidateId: z.string().min(1).max(200),
  deckId: z.string().max(200).optional(),
  slideNumber: z.number().int().positive().optional(),
  reason: z.string().max(1000).optional(),
});

const UploadUserImageArgsSchema = z.object({
  fileId: z.string().min(1),
  deckId: z.string().max(200).optional(),
  purpose: z.string().max(200).optional(),
});

const ListImageAssetsArgsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

export function registerImageAssetTools(): void {
  registerTool({
    name: "search_images",
    description:
      "Search licensed stock images for deck slides. MVP source is Pexels. Returns candidates only; call select_image before using an image in slide HTML.",
    risk: "external",
    schema: SearchImagesArgsSchema,
    execute: async (args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
      try {
        const results = await searchImages({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
          deckId: ctx.projectId,
          query: args.query,
          orientation: args.orientation,
          style: args.style,
          count: args.count,
          sources: args.sources,
        });
        ctx.publish?.({
          channel: "deck.asset",
          payload: {
            stage: "image_candidates",
            type: "image_candidates",
            query: args.query,
            layout: "grid_3x4",
            carousel: true,
            candidates: results,
          },
        });
        return {
          ok: true,
          content: `Found ${results.length} image candidates.`,
          data: { results },
        };
      } catch (err) {
        return { ok: false, content: `search_images failed: ${(err as Error).message}`, error: "IMAGE_SEARCH_FAILED" };
      }
    },
  });

  registerTool({
    name: "select_image",
    description:
      "Download, store, and attach a selected image candidate. Use this before placing any stock image in slide HTML.",
    risk: "external",
    schema: SelectImageArgsSchema,
    execute: async (args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
      try {
        const imageAsset = await selectImage({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
          deckId: args.deckId ?? ctx.projectId,
          assetCandidateId: args.assetCandidateId,
          slideNumber: args.slideNumber,
          reason: args.reason,
        });
        ctx.publish?.({
          channel: "deck.asset",
          payload: {
            stage: "image_selected",
            type: "image",
            slideNumber: args.slideNumber,
            imageAsset,
          },
        });
        return {
          ok: true,
          content: `Stored image asset ${imageAsset.id}.`,
          data: { imageAsset },
        };
      } catch (err) {
        return { ok: false, content: `select_image failed: ${(err as Error).message}`, error: "IMAGE_SELECT_FAILED" };
      }
    },
  });

  registerTool({
    name: "upload_user_image",
    description:
      "Attach an already uploaded user image file as a safe deck image asset, such as a logo or product photo.",
    risk: "write",
    schema: UploadUserImageArgsSchema,
    execute: async (args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
      try {
        const imageAsset = await uploadUserImageAsset({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
          deckId: args.deckId ?? ctx.projectId,
          fileId: args.fileId,
          purpose: args.purpose,
        });
        ctx.publish?.({
          channel: "deck.asset",
          payload: {
            stage: "image_selected",
            type: "image",
            imageAsset,
          },
        });
        return {
          ok: true,
          content: `Attached user image asset ${imageAsset.id}.`,
          data: { imageAsset },
        };
      } catch (err) {
        return { ok: false, content: `upload_user_image failed: ${(err as Error).message}`, error: "IMAGE_UPLOAD_FAILED" };
      }
    },
  });

  registerTool({
    name: "list_image_assets",
    description: "List safe stored image assets available for this deck/workspace.",
    risk: "read",
    schema: ListImageAssetsArgsSchema,
    execute: async (args, ctx) => {
      if (!ctx.workspaceId) return { ok: false, content: "workspaceId required", error: "BAD_ARGS" };
      const assets = await listImageAssets({
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        limit: args.limit,
      });
      return {
        ok: true,
        content: `${assets.length} image assets.`,
        data: { assets },
      };
    },
  });
}
