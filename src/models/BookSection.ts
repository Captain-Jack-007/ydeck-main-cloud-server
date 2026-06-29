import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { BOOK_SECTION_TYPES } from "./enums";

/**
 * A detected chapter / lesson / unit within a SourceCollection, with the page
 * range it spans. Lets the agent resolve natural references like "Lesson 5" or
 * "the grammar section" to a concrete page range for retrieval.
 */
const bookSectionSchema = new Schema(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "SourceCollection", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },

    type: { type: String, enum: BOOK_SECTION_TYPES, default: "section" },
    title: { type: String, default: "" },
    number: { type: String, default: null },

    startPage: { type: Number, required: true },
    endPage: { type: Number, required: true },

    summary: { type: String, default: "" },
    keywords: { type: [String], default: [] },
    order: { type: Number, default: 0 },
  },
  baseSchemaOptions,
);

bookSectionSchema.index({ sourceId: 1, order: 1 });

export type BookSection = InferSchemaType<typeof bookSectionSchema>;
export type BookSectionDoc = HydratedDocument<BookSection>;
export const BookSectionModel = model("BookSection", bookSectionSchema);
