import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import { ApiError } from "../../lib/errors";
import { isObjectId } from "../../lib/ids";
import { randomNumericCode } from "../../lib/crypto";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { SocialAccountModel } from "../../models";

export const integrationsRouter: Router = Router();

// In-memory short-lived link codes for Telegram (MVP). For production move to Redis.
interface LinkCode { code: string; userId: string; expiresAt: number }
const telegramLinkCodes = new Map<string, LinkCode>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of telegramLinkCodes) if (v.expiresAt < now) telegramLinkCodes.delete(k);
}, 60_000).unref();

// ---- Telegram linking ----
integrationsRouter.post(
  "/telegram/link-code",
  requireUser,
  asyncHandler(async (req, res) => {
    const code = randomNumericCode(6);
    telegramLinkCodes.set(code, {
      code,
      userId: req.auth!.userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.status(201).json({ code, expiresInSeconds: 600 });
  }),
);

integrationsRouter.get(
  "/telegram/accounts",
  requireUser,
  asyncHandler(async (req, res) => {
    const accounts = await SocialAccountModel.find({ userId: req.auth!.userId, provider: "telegram" })
      .select("providerId meta createdAt");
    res.json(accounts.map((a) => a.toJSON()));
  }),
);

integrationsRouter.delete(
  "/telegram/accounts/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw ApiError.notFound("Account not linked");
    const acct = await SocialAccountModel.findOne({
      _id: req.params.id,
      userId: req.auth!.userId,
      provider: "telegram",
    });
    if (!acct) throw ApiError.notFound("Account not linked");
    await acct.deleteOne();
    res.status(204).end();
  }),
);

// ---- Telegram webhook (called by Telegram Bot API) ----
const webhookUpdateSchema = z.object({
  update_id: z.number().optional(),
  message: z
    .object({
      from: z.object({ id: z.number(), username: z.string().optional(), first_name: z.string().optional() }).optional(),
      text: z.string().optional(),
      chat: z.object({ id: z.number() }).optional(),
    })
    .optional(),
}).passthrough();

integrationsRouter.post(
  "/telegram/webhook",
  validate(webhookUpdateSchema),
  asyncHandler(async (req, res) => {
    // Authenticate webhook via Telegram secret token header.
    if (env.telegramWebhookSecret) {
      const provided = req.header("x-telegram-bot-api-secret-token");
      if (provided !== env.telegramWebhookSecret) throw ApiError.unauthorized("Invalid webhook secret");
    }

    const msg = req.body.message;
    if (msg?.text && msg.from) {
      const match = /\b(\d{6})\b/.exec(msg.text);
      if (match) {
        const linkCode = telegramLinkCodes.get(match[1]);
        if (linkCode && linkCode.expiresAt > Date.now()) {
          telegramLinkCodes.delete(match[1]);
          await SocialAccountModel.findOneAndUpdate(
            { provider: "telegram", providerId: String(msg.from.id) },
            {
              $set: {
                userId: linkCode.userId,
                meta: { username: msg.from.username, firstName: msg.from.first_name },
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
          logger.info({ userId: linkCode.userId, tgId: msg.from.id }, "telegram.linked");
        }
      }
    }

    // Telegram expects a 200 OK quickly.
    res.json({ ok: true });
  }),
);
