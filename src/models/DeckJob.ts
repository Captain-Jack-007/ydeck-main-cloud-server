import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { JOB_STATUSES, JOB_TYPES } from "./enums";

const deckJobSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "DeckProject", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    type: { type: String, enum: JOB_TYPES, required: true },
    status: { type: String, enum: JOB_STATUSES, default: "queued", index: true },
    progress: { type: Number, default: 0 },
    inputParams: { type: Schema.Types.Mixed, default: null },
    resultMeta: { type: Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

deckJobSchema.index({ workspaceId: 1, status: 1 });

export type DeckJob = InferSchemaType<typeof deckJobSchema>;
export type DeckJobDoc = HydratedDocument<DeckJob>;
export const DeckJobModel = model("DeckJob", deckJobSchema);
