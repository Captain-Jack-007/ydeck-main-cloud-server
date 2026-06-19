import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { SOCIAL_PROVIDERS } from "./enums";

const socialAccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: SOCIAL_PROVIDERS, required: true },
    providerId: { type: String, required: true },
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
);

socialAccountSchema.index({ provider: 1, providerId: 1 }, { unique: true });

export type SocialAccount = InferSchemaType<typeof socialAccountSchema>;
export type SocialAccountDoc = HydratedDocument<SocialAccount>;
export const SocialAccountModel = model("SocialAccount", socialAccountSchema);
