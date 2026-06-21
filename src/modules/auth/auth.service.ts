import bcrypt from "bcryptjs";
import { ApiError } from "../../lib/errors";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { sha256Hex } from "../../lib/crypto";
import { env } from "../../config/env";
import {
  SessionModel,
  SubscriptionModel,
  UserModel,
  WorkspaceBrandingModel,
  WorkspaceMemberModel,
  WorkspaceModel,
  WorkspacePreferenceModel,
  type UserDoc,
} from "../../models";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function issueSession(
  userId: string,
  email: string,
  isAdmin: boolean,
  ctx: { ua?: string; ip?: string },
): Promise<AuthTokens> {
  // Create session first to get the session id, then sign refresh with that sid.
  const session = await SessionModel.create({
    userId,
    refreshTokenHash: `pending-${Date.now()}-${Math.random()}`,
    userAgent: ctx.ua ?? null,
    ip: ctx.ip ?? null,
    expiresAt: new Date(Date.now() + env.jwtRefreshTtl * 1000),
  });

  const refreshToken = signRefreshToken({ sub: userId, sid: session.id });
  session.refreshTokenHash = sha256Hex(refreshToken);
  await session.save();

  const accessToken = signAccessToken({ sub: userId, email, isAdmin });
  return { accessToken, refreshToken, expiresIn: env.jwtAccessTtl };
}

export async function registerUser(
  input: { email: string; password: string; displayName?: string },
  ctx: { ua?: string; ip?: string },
) {
  const email = input.email.toLowerCase();
  const existing = await UserModel.findOne({ email });
  if (existing) throw ApiError.conflict("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await UserModel.create({
    email,
    passwordHash,
    displayName: input.displayName ?? null,
  });

  // Auto-create personal workspace + owner membership + subscription.
  const workspace = await WorkspaceModel.create({
    name: `${user.displayName ?? user.email}'s workspace`,
    ownerId: user.id,
    isPersonal: true,
    plan: "free",
  });
  await WorkspaceMemberModel.create({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
    acceptedAt: new Date(),
  });
  await SubscriptionModel.create({
    workspaceId: workspace.id,
    plan: "free",
    status: "active",
  });
  await WorkspacePreferenceModel.create({ workspaceId: workspace.id });
  await WorkspaceBrandingModel.create({
    workspaceId: workspace.id,
    companyName: workspace.name,
    productName: "YDeck",
    primaryColor: "#6d28d9",
    accentColor: "#2563eb",
  });

  const tokens = await issueSession(user.id, user.email, user.isAdmin, ctx);
  return { user: publicUser(user), workspace: workspace.toJSON(), ...tokens };
}

export async function loginUser(
  input: { email: string; password: string },
  ctx: { ua?: string; ip?: string },
) {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (!user) throw ApiError.unauthorized("Invalid email or password");
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  const tokens = await issueSession(user.id, user.email, user.isAdmin, ctx);
  return { user: publicUser(user), ...tokens };
}

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const session = await SessionModel.findById(payload.sid);
  if (!session || session.revokedAt) throw ApiError.unauthorized("Session revoked");
  if (session.refreshTokenHash !== sha256Hex(refreshToken)) throw ApiError.unauthorized("Refresh token mismatch");
  if (session.expiresAt < new Date()) throw ApiError.unauthorized("Session expired");

  const user = await UserModel.findById(session.userId);
  if (!user) throw ApiError.unauthorized("User not found");

  // Rotate refresh token
  const newRefresh = signRefreshToken({ sub: user.id, sid: session.id });
  session.refreshTokenHash = sha256Hex(newRefresh);
  session.expiresAt = new Date(Date.now() + env.jwtRefreshTtl * 1000);
  await session.save();

  const accessToken = signAccessToken({ sub: user.id, email: user.email, isAdmin: user.isAdmin });
  return { accessToken, refreshToken: newRefresh, expiresIn: env.jwtAccessTtl };
}

export async function logoutSession(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await SessionModel.updateMany(
      { _id: payload.sid, refreshTokenHash: sha256Hex(refreshToken) },
      { $set: { revokedAt: new Date() } },
    );
  } catch {
    // swallow – logout is idempotent
  }
}

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw ApiError.notFound("User not found");

  const memberships = await WorkspaceMemberModel.find({ userId }).populate("workspaceId");
  return {
    user: publicUser(user),
    workspaces: memberships.map((m) => {
      const ws = m.workspaceId as unknown as { id: string; name: string; plan: string; isPersonal: boolean };
      return { id: ws.id, name: ws.name, plan: ws.plan, role: m.role, isPersonal: ws.isPersonal };
    }),
  };
}

export async function updateMe(
  userId: string,
  input: { name?: string | null; displayName?: string | null; avatarUrl?: string | null; locale?: string | null },
) {
  const updates: Partial<Pick<UserDoc, "displayName" | "avatarUrl" | "locale">> = {};
  if ("name" in input) updates.displayName = input.name ?? null;
  if ("displayName" in input) updates.displayName = input.displayName ?? null;
  if ("avatarUrl" in input) updates.avatarUrl = input.avatarUrl ?? null;
  if ("locale" in input) updates.locale = input.locale ?? null;

  const user = await UserModel.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  if (!user) throw ApiError.notFound("User not found");
  return { success: true, user: webUser(user) };
}

function publicUser(u: UserDoc) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    locale: u.locale,
    isAdmin: u.isAdmin,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: (u as unknown as { createdAt: Date }).createdAt,
  };
}

function webUser(u: UserDoc) {
  const name = u.displayName ?? "";
  return {
    ...publicUser(u),
    authenticated: true,
    userId: u.id,
    name,
    initials: initialsFor(name || u.email),
    role: u.isAdmin ? "admin" : "user",
  };
}

function initialsFor(value: string): string {
  const source = value.includes("@") ? value.split("@")[0] : value;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
