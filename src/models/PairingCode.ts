import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const pairingCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    codeHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

export type PairingCode = InferSchemaType<typeof pairingCodeSchema>;
export type PairingCodeDoc = HydratedDocument<PairingCode>;
export const PairingCodeModel = model("PairingCode", pairingCodeSchema);
