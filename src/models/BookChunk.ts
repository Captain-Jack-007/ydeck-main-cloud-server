import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

/**
 * A retrievable chunk of a SourceCollection (roughly a page or two of text)
 * with its embedding vector, used for semantic "search this book" queries.
 * Stored separately from BookPage because chunks may span page boundaries and
 * carry a vector. Embeddings are optional — chunks without a vector fall back
 * to keyword scoring.
 */
const bookChunkSchema = new Schema(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "SourceCollection", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    chunkIndex: { type: Number, required: true },
    startPage: { type: Number, required: true },
    endPage: { type: Number, required: true },
    text: { type: String, default: "" },
    embedding: { type: [Number], default: undefined },
    dim: { type: Number, default: 0 },
  },
  baseSchemaOptions,
);

bookChunkSchema.index({ sourceId: 1, chunkIndex: 1 }, { unique: true });

export type BookChunk = InferSchemaType<typeof bookChunkSchema>;
export type BookChunkDoc = HydratedDocument<BookChunk>;
export const BookChunkModel = model("BookChunk", bookChunkSchema);
