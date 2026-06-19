import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { PACK_TYPES } from "./enums";

const installedPackSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    packType: { type: String, enum: PACK_TYPES, required: true },
    packSlug: { type: String, required: true },
    packVersion: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    installedAt: { type: Date, default: () => new Date() },
  },
  baseSchemaOptions,
);

installedPackSchema.index({ workspaceId: 1, packType: 1, packSlug: 1 }, { unique: true });

export type InstalledPack = InferSchemaType<typeof installedPackSchema>;
export type InstalledPackDoc = HydratedDocument<InstalledPack>;
export const InstalledPackModel = model("InstalledPack", installedPackSchema);
