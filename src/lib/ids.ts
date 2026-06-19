import { Types } from "mongoose";

export const isObjectId = (s: unknown): s is string =>
  typeof s === "string" && Types.ObjectId.isValid(s) && String(new Types.ObjectId(s)) === s;

export const toIdString = (v: unknown): string => String(v);
