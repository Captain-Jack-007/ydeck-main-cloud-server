import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { DeviceModel } from '../models';
import { sha256Hex } from '../lib/crypto';
import { toIdString } from '../lib/ids';

export interface AuthContext {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export interface DeviceContext {
  deviceId: string;
  workspaceId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      device?: DeviceContext;
    }
  }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearer(req);
  if (!token) return next(ApiError.unauthorized('Missing bearer token'));
  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      isAdmin: payload.isAdmin,
    };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!req.auth.isAdmin) return next(ApiError.forbidden('Admin role required'));
  next();
}

/**
 * Device authentication: header `X-Device-Token: <token>`
 * The token is hashed and matched against Device.tokenHash; status must be active and not expired.
 */
export async function requireDevice(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.header('x-device-token');
  if (!token) return next(ApiError.unauthorized('Missing device token'));
  try {
    const device = await DeviceModel.findOne({ tokenHash: sha256Hex(token) });
    if (!device) return next(ApiError.unauthorized('Invalid device token'));
    if (device.status !== 'active')
      return next(ApiError.forbidden('Device not active'));
    if (device.expiresAt < new Date())
      return next(ApiError.unauthorized('Device token expired'));

    req.device = {
      deviceId: device.id,
      workspaceId: toIdString(device.workspaceId),
    };
    next();
  } catch (err) {
    next(err);
  }
}
