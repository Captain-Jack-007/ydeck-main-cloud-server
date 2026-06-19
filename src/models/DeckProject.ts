import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const deckProjectSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 255 },
    description: { type: String, default: null, maxlength: 2000 },
    templateId: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

export type DeckProject = InferSchemaType<typeof deckProjectSchema>;
export type DeckProjectDoc = HydratedDocument<DeckProject>;
export const DeckProjectModel = model("DeckProject", deckProjectSchema);
