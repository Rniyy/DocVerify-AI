import jwt from "jsonwebtoken";
import { config } from "../../config/env";
import { JwtPayload } from "../../types/auth";

const TOKEN_EXPIRY = "7d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
}
