import { z } from "zod";
import { userSchema } from "./user.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "La contraseña es obligatoria"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const jwtPayloadSchema = z.object({
  sub: z.number().int(),
  email: z.string().email(),
  role: userSchema.shape.role,
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
