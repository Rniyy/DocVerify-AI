import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";

interface Options {
  /** Max requests per window, per client IP. */
  max: number;
  windowMs: number;
  message?: string;
}

/**
 * Tiny fixed-window, in-memory rate limiter — enough to slow down password
 * guessing on /auth without adding a dependency. State lives in this
 * process, so with several backend replicas each keeps its own counts; swap
 * for a shared store (e.g. Redis) if you scale out.
 */
export function rateLimit({ max, windowMs, message }: Options) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.resetAt <= now) hits.delete(key);
    });
  }, windowMs);
  sweep.unref(); // never keep the process alive just for cleanup

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new AppError(message ?? "Too many requests. Please try again later.", 429);
    }
    next();
  };
}
