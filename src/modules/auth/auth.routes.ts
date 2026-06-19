import { Router } from "express";
import rateLimit from "express-rate-limit";

import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../lib/validate";
import { requireUser } from "../../middleware/auth";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  updateMeSchema,
  verifyEmailSchema,
} from "./auth.schemas";
import {
  getMe,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  updateMe,
} from "./auth.service";
import { ApiError } from "../../lib/errors";

export const authRouter: Router = Router();

const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

authRouter.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body, {
      ua: req.headers["user-agent"] as string | undefined,
      ip: req.ip,
    });
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body, {
      ua: req.headers["user-agent"] as string | undefined,
      ip: req.ip,
    });
    res.json(result);
  }),
);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const tokens = await refreshSession(req.body.refreshToken);
    res.json(tokens);
  }),
);

authRouter.post(
  "/logout",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await logoutSession(req.body.refreshToken);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw ApiError.unauthorized();
    res.json(await getMe(req.auth.userId));
  }),
);

authRouter.patch(
  "/me",
  requireUser,
  validate(updateMeSchema),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw ApiError.unauthorized();
    res.json(await updateMe(req.auth.userId, req.body));
  }),
);

// --- Password reset (stubbed – email delivery out of scope for MVP server) ---
authRouter.post(
  "/password/forgot",
  authLimiter,
  validate(requestPasswordResetSchema),
  asyncHandler(async (_req, res) => {
    // Always 202 to avoid email enumeration; real impl issues a signed token via email.
    res.status(202).json({ status: "accepted" });
  }),
);

authRouter.post(
  "/password/reset",
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (_req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Password reset delivery is not configured" } });
  }),
);

authRouter.post(
  "/email/verify",
  validate(verifyEmailSchema),
  asyncHandler(async (_req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Email verification delivery is not configured" } });
  }),
);
