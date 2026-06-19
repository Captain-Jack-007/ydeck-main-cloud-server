import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from './errors';

type Source = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodType<T>, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const target = req[source];
      const data = schema.parse(target);
      (req as unknown as Record<Source, unknown>)[source] = data;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest('Validation failed', err.issues));
      } else {
        next(err);
      }
    }
  };
}
