import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { FILE_SCOPES } from "./enums";

const fileSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "DeckProject", default: null, index: true },
    scope: { type: String, enum: FILE_SCOPES, default: "workspace" },
    kind: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    storageUrl: { type: String, required: true },
    checksum: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

export type File = InferSchemaType<typeof fileSchema>;
export type FileDoc = HydratedDocument<File>;
export const FileModel = model("File", fileSchema);
