import { Schema, model, Types, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { WORKSPACE_PLANS } from "./enums";

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    plan: { type: String, enum: WORKSPACE_PLANS, default: "free", index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isPersonal: { type: Boolean, default: false },
  },
  baseSchemaOptions,
);

export type Workspace = InferSchemaType<typeof workspaceSchema>;
export type WorkspaceDoc = HydratedDocument<Workspace>;
export const WorkspaceModel = model("Workspace", workspaceSchema);

export const toObjectId = (id: string): Types.ObjectId => new Types.ObjectId(id);
export const isValidObjectId = (id: string): boolean => Types.ObjectId.isValid(id);
