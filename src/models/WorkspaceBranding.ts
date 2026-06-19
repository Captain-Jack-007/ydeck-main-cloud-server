import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const workspaceBrandingSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true, index: true },
    companyName: { type: String, default: null, maxlength: 120 },
    productName: { type: String, default: null, maxlength: 120 },
    logoUrl: { type: String, default: null, maxlength: 2048 },
    primaryColor: { type: String, default: null, maxlength: 32 },
    accentColor: { type: String, default: null, maxlength: 32 },
  },
  baseSchemaOptions,
);

export type WorkspaceBranding = InferSchemaType<typeof workspaceBrandingSchema>;
export type WorkspaceBrandingDoc = HydratedDocument<WorkspaceBranding>;
export const WorkspaceBrandingModel = model("WorkspaceBranding", workspaceBrandingSchema);
