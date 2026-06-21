import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { DEVICE_STATUSES } from "./enums";

const deviceSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, default: null, maxlength: 120 },
    platform: { type: String, default: null, maxlength: 60 },
    appVersion: { type: String, default: null, maxlength: 40 },
    fingerprint: { type: String, default: null, maxlength: 255 },
    tokenPrefix: { type: String, default: null, index: true, maxlength: 16 },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: DEVICE_STATUSES, default: "active", index: true },
    lastHeartbeatAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastIp: { type: String, default: null },
    pairedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseSchemaOptions,
);

deviceSchema.index({ expiresAt: 1 });

export type Device = InferSchemaType<typeof deviceSchema>;
export type DeviceDoc = HydratedDocument<Device>;
export const DeviceModel = model("Device", deviceSchema);
