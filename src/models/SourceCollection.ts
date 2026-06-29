import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { SOURCE_COLLECTION_STATUSES, SOURCE_COLLECTION_TYPES } from "./enums";

/**
 * A persistent uploaded source (a book, course pack, report, manual...).
 *
 * Uploaded once, indexed page-by-page (BookPage) and section-by-section
 * (BookSection), then reused to generate many decks from any page range,
 * lesson, or chapter. This is the "Source Library" entity the user manages in
 * the Sources area — the frontend never sees the physical page storage.
 */
const sourceCollectionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    originalFileId: { type: Schema.Types.ObjectId, ref: "File", default: null, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "DeckProject", default: null, index: true },

    type: { type: String, enum: SOURCE_COLLECTION_TYPES, default: "book" },
    title: { type: String, required: true },
    language: { type: String, default: "en" },

    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    pageCount: { type: Number, default: 0 },

    status: { type: String, enum: SOURCE_COLLECTION_STATUSES, default: "processing", index: true },
    // Set when the background index worker claims this source; lets a stalled
    // claim (e.g. a crash mid-index) be re-claimed after a timeout.
    indexingStartedAt: { type: Date, default: null },
    tocDetected: { type: Boolean, default: false },
    sectionsDetected: { type: Boolean, default: false },
    sectionCount: { type: Number, default: 0 },
    imageCount: { type: Number, default: 0 },

    // Free-form: warnings, detection notes, summary text, etc.
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

export type SourceCollection = InferSchemaType<typeof sourceCollectionSchema>;
export type SourceCollectionDoc = HydratedDocument<SourceCollection>;
export const SourceCollectionModel = model("SourceCollection", sourceCollectionSchema);
