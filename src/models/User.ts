import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 255 },
    emailVerifiedAt: { type: Date, default: null },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: null, maxlength: 120 },
    avatarUrl: { type: String, default: null },
    locale: { type: String, default: null },
    isAdmin: { type: Boolean, default: false, index: true },
  },
  baseSchemaOptions,
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model("User", userSchema);
