import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";
import { baseSchemaOptions } from "./_base";

const deckJobEventSchema = new Schema(
  {
    jobId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "DeckProject", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    seq: { type: Number, required: true },
    channel: { type: String, default: null },
    status: { type: String, required: true },
    progress: { type: Number, default: 0 },
    errorMessage: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
    emittedAt: { type: Date, required: true },
  },
  baseSchemaOptions,
);

deckJobEventSchema.index({ jobId: 1, seq: 1 }, { unique: true });
deckJobEventSchema.index({ workspaceId: 1, emittedAt: -1 });

const deckJobEventCounterSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "DeckProject", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    seq: { type: Number, default: 0 },
  },
  baseSchemaOptions,
);

export type DeckJobEvent = InferSchemaType<typeof deckJobEventSchema>;
export type DeckJobEventDoc = HydratedDocument<DeckJobEvent>;
export const DeckJobEventModel = model("DeckJobEvent", deckJobEventSchema);

export type DeckJobEventCounter = InferSchemaType<typeof deckJobEventCounterSchema>;
export type DeckJobEventCounterDoc = HydratedDocument<DeckJobEventCounter>;
export const DeckJobEventCounterModel = model(
  "DeckJobEventCounter",
  deckJobEventCounterSchema,
);
