import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/user/user.routes";
import { workspaceRouter } from "./modules/workspaces/workspace.routes";
import { deviceRouter } from "./modules/devices/device.routes";
import { decksRouter } from "./modules/decks/decks.routes";
import { packsRouter } from "./modules/packs/packs.routes";
import { billingRouter } from "./modules/billing/billing.routes";
import { integrationsRouter } from "./modules/integrations/integrations.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { cloudRouter } from "./modules/cloud/cloud.routes";
import { apiCompatRouter } from "./modules/compat/apiCompat.routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  // Global soft rate limit (per IP). Auth/pairing endpoints add stricter limiters locally.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use("/api", apiCompatRouter);

  app.use("/v1/auth", authRouter);
  app.use("/v1/user", userRouter);
  app.use("/v1/workspaces", workspaceRouter);
  app.use("/v1/devices", deviceRouter);
  app.use("/v1", decksRouter);          // /workspaces/:wsId/projects ... etc
  app.use("/v1", packsRouter);          // /templates, /plugins, /workspaces/:wsId/installed-packs
  app.use("/v1/billing", billingRouter);
  app.use("/v1/integrations", integrationsRouter);
  app.use("/v1/admin", adminRouter);
  app.use("/v1/cloud", cloudRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
