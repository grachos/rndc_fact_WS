import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio (cadena de conexión pooled de Supabase)"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET debe tener al menos 16 caracteres"),
  CREDENTIALS_ENC_KEY: z
    .string()
    .length(64, "CREDENTIALS_ENC_KEY debe ser una clave hex de 32 bytes (64 caracteres hex)"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
