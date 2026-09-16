import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../services/auth/tokenService";
import { AuthUser } from "../types/auth";
import { AppError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Authentication required. Include an Authorization: Bearer <token> header.", 401);
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new AppError("Invalid or expired token. Please log in again.", 401);
  }
}
