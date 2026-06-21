import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  displayName: z.string().min(1).max(120).nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  locale: z.string().min(2).max(20).nullable().optional(),
});
