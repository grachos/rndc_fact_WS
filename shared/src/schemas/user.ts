import { z } from "zod";

export const roleSchema = z.enum(["admin", "operador"]);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: roleSchema,
  createdAt: z.string(),
  /** Empresas (perfiles) assigned to the user; only enforced for operadores — admins use all. */
  perfilIds: z.array(z.number().int()).optional(),
  perfilPredeterminadoId: z.number().int().nullable().optional(),
});
export type User = z.infer<typeof userSchema>;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: roleSchema,
  perfilIds: z.array(z.number().int()).default([]),
  perfilPredeterminadoId: z.number().int().nullable().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  password: z.string().min(8).optional(),
  perfilIds: z.array(z.number().int()).optional(),
  perfilPredeterminadoId: z.number().int().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
