import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { WORKSPACE_PLANS } from "./enums";

const pluginPackSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    version: { type: String, required: true },
    authorName: { type: String, default: null },
    isFree: { type: Boolean, default: true },
    minPlan: { type: String, enum: WORKSPACE_PLANS, default: "free" },
    manifest: { type: Schema.Types.Mixed, required: true },
  },
  baseSchemaOptions,
);

export type PluginPack = InferSchemaType<typeof pluginPackSchema>;
export type PluginPackDoc = HydratedDocument<PluginPack>;
export const PluginPackModel = model("PluginPack", pluginPackSchema);
