import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

const cloudConfigSchema = new Schema(
  {
    singleton: { type: String, default: "global", unique: true, index: true },
    llmProvider: {
      type: String,
      enum: ["mock", "openai", "anthropic", "gemini", "deepseek", "openai-compatible"],
      default: undefined,
    },
    models: {
      openai: { type: String, default: undefined },
      anthropic: { type: String, default: undefined },
      gemini: { type: String, default: undefined },
      deepseek: { type: String, default: undefined },
      "openai-compatible": { type: String, default: undefined },
    },
    keys: {
      openai: { type: String, default: undefined },
      anthropic: { type: String, default: undefined },
      gemini: { type: String, default: undefined },
      deepseek: { type: String, default: undefined },
      "openai-compatible": { type: String, default: undefined },
    },
    baseUrls: {
      "openai-compatible": { type: String, default: undefined },
    },
    streamOutput: { type: Boolean, default: undefined },
    logOutput: { type: Boolean, default: undefined },
  },
  { timestamps: true },
);

export type CloudConfig = InferSchemaType<typeof cloudConfigSchema>;
export type CloudConfigDoc = HydratedDocument<CloudConfig>;
export const CloudConfigModel = model("CloudConfig", cloudConfigSchema);
