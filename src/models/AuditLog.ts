import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
    action: { type: String, required: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export type AuditLogDoc = HydratedDocument<AuditLog>;
export const AuditLogModel = model("AuditLog", auditLogSchema);
