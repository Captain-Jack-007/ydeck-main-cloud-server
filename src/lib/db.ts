import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

export async function connectDB(): Promise<void> {
  await mongoose.connect(env.databaseUrl, {
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ db: redact(env.databaseUrl) }, "mongo.connected");
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info("mongo.disconnected");
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}
