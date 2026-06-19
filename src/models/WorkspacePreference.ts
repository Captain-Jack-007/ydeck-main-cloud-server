import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const workspacePreferenceSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true, index: true },
    language: { type: String, default: "en", maxlength: 20 },
    defaultDeckType: { type: String, default: "general", maxlength: 80 },
    defaultStyle: { type: String, default: "modern", maxlength: 80 },
    defaultSlideCount: { type: Number, default: 10, min: 1, max: 100 },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

export type WorkspacePreference = InferSchemaType<typeof workspacePreferenceSchema>;
export type WorkspacePreferenceDoc = HydratedDocument<WorkspacePreference>;
export const WorkspacePreferenceModel = model("WorkspacePreference", workspacePreferenceSchema);
