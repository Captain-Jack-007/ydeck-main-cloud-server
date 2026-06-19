import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { MEMBER_ROLES } from "./enums";

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: MEMBER_ROLES, default: "editor" },
    invitedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export type WorkspaceMember = InferSchemaType<typeof workspaceMemberSchema>;
export type WorkspaceMemberDoc = HydratedDocument<WorkspaceMember>;
export const WorkspaceMemberModel = model("WorkspaceMember", workspaceMemberSchema);
