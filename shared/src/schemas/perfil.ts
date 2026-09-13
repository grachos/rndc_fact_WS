import { z } from "zod";

/** Perfil as returned to the frontend — never includes decrypted RNDC passwords, and
 * never embeds the full XML template (that's fetched separately, it can be tens of KB). */
export const perfilSchema = z.object({
  id: z.number().int(),
  nombre: z.string().min(1),
  nitSocio: z.string().min(1),
  prefijoRemesa: z.boolean(),
  nitMonitoreo: z.string().optional().nullable(),
  rndcUsuario: z.string().min(1),
  hasRndcCredenciales: z.boolean(),
  rndcUsuarioCorregir: z.string().optional().nullable(),
  hasCorregirCredenciales: z.boolean(),
  rndcUsuarioMonitoreo: z.string().optional().nullable(),
  hasMonitoreoCredenciales: z.boolean(),
  hasXmlTemplate: z.boolean(),
  xmlTemplateNombre: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Perfil = z.infer<typeof perfilSchema>;

/** Input for create/update. Passwords are plaintext here — encrypted before storage,
 * and only replaced when a non-empty value is supplied (so editing a perfil doesn't
 * force re-entering every credential). The XML template is uploaded via a separate
 * endpoint, not part of this input. */
export const perfilInputSchema = z.object({
  nombre: z.string().min(1),
  nitSocio: z.string().min(1),
  prefijoRemesa: z.boolean().default(false),
  nitMonitoreo: z.string().optional().nullable(),
  rndcUsuario: z.string().min(1),
  rndcPassword: z.string().optional(),
  rndcUsuarioCorregir: z.string().optional().nullable(),
  rndcPasswordCorregir: z.string().optional(),
  rndcUsuarioMonitoreo: z.string().optional().nullable(),
  rndcPasswordMonitoreo: z.string().optional(),
});
export type PerfilInput = z.infer<typeof perfilInputSchema>;
