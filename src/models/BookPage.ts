import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

/**
 * One page of a SourceCollection, stored separately so page-range requests
 * ("slides from pages 23-45") retrieve exactly the right pages without loading
 * the whole book. One document per page.
 */
const bookPageSchema = new Schema(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "SourceCollection", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    pageNumber: { type: Number, required: true },
    text: { type: String, default: "" },
    charCount: { type: Number, default: 0 },
    imageRefs: { type: [String], default: [] },
    ocrConfidence: { type: Number, default: null },
  },
  baseSchemaOptions,
);

// Fast page-range lookups, and one row per (source, page).
bookPageSchema.index({ sourceId: 1, pageNumber: 1 }, { unique: true });

export type BookPage = InferSchemaType<typeof bookPageSchema>;
export type BookPageDoc = HydratedDocument<BookPage>;
export const BookPageModel = model("BookPage", bookPageSchema);
