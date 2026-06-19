import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const usageRecordSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    metric: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    meta: { type: Schema.Types.Mixed, default: null },
    occurredAt: { type: Date, default: () => new Date() },
  },
  baseSchemaOptions,
);

usageRecordSchema.index({ workspaceId: 1, metric: 1, occurredAt: -1 });

export type UsageRecord = InferSchemaType<typeof usageRecordSchema>;
export type UsageRecordDoc = HydratedDocument<UsageRecord>;
export const UsageRecordModel = model("UsageRecord", usageRecordSchema);
