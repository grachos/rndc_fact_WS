import jwt from "jsonwebtoken";
import type { JwtPayload as AppJwtPayload, User } from "@fe-tool/shared";
import { env } from "../../config/env.js";

const EXPIRES_IN = "12h";

export function signToken(user: User): string {
  const payload: AppJwtPayload = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): AppJwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as unknown as AppJwtPayload;
}
