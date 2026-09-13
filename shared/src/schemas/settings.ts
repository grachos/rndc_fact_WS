import { z } from "zod";

export const settingsSchema = z.object({
  fopatFechaInicio: z.string(), // ISO date, e.g. "2026-04-01"
  maxFacturasGenerar: z.number().int().positive(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsInputSchema = settingsSchema.partial();
export type SettingsInput = z.infer<typeof settingsInputSchema>;
