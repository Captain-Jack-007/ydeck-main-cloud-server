import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { baseSchemaOptions } from "./_base";
import { SUBSCRIPTION_STATUSES, WORKSPACE_PLANS } from "./enums";

const subscriptionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    plan: { type: String, enum: WORKSPACE_PLANS, default: "free" },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: "active" },
    provider: { type: String, default: null },
    providerCustomerId: { type: String, default: null },
    providerSubId: { type: String, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    seats: { type: Number, default: 1 },
  },
  baseSchemaOptions,
);

export type Subscription = InferSchemaType<typeof subscriptionSchema>;
export type SubscriptionDoc = HydratedDocument<Subscription>;
export const SubscriptionModel = model("Subscription", subscriptionSchema);
