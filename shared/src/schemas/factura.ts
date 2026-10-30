import { z } from "zod";

export const remesaLineaSchema = z.object({
  consecutivo: z.string().min(1),
  radicado: z.string().default(""),
  peso: z.string().default("1"),
  valor: z.number(),
  descripcionLinea: z.string().default("Servicio de transporte"),
});
export type RemesaLinea = z.infer<typeof remesaLineaSchema>;

/**
 * Data for one invoice. Generation edits these fields into the perfil's stored XML
 * template (see services/xml/templateEditor.ts) — everything else (signature,
 * certificate, DIAN authorization, supplier/customer address) comes from whatever
 * that template already has, since it's a real previously-valid document for that profile.
 */
export const generarXmlInputSchema = z.object({
  perfilId: z.number().int(),
  numeroFactura: z.string().min(1),
  cufe: z.string().min(1),
  fecha: z.string().min(1), // YYYY-MM-DD
  nitCliente: z.string().min(1),
  digitoCliente: z.string().min(1),
  nombreCliente: z.string().min(1),
  valorTotal: z.number(),
  remesas: z.array(remesaLineaSchema).min(1),
});
export type GenerarXmlInput = z.infer<typeof generarXmlInputSchema>;

export const generarXmlResultSchema = z.object({
  filename: z.string(),
  xml: z.string(),
  avisos: z.array(z.string()),
});
export type GenerarXmlResult = z.infer<typeof generarXmlResultSchema>;

export const cargarRndcResultadoRemesaSchema = z.object({
  consecutivo: z.string(),
  radicado: z.string().optional(),
  mensaje: z.string().optional(),
});

export const cargarRndcResultadoSchema = z.object({
  archivo: z.string(),
  numeroFactura: z.string(),
  exito: z.boolean(),
  mensaje: z.string(),
  remesas: z.array(cargarRndcResultadoRemesaSchema),
});
export type CargarRndcResultado = z.infer<typeof cargarRndcResultadoSchema>;

/** One row of the "Reporte de cargas RNDC" — a persisted record of a past
 * `/cargar-rndc/enviar` upload attempt, for the interactive report + CSV export. */
export const cargaRndcReporteSchema = z.object({
  id: z.number().int(),
  perfilId: z.number().int(),
  perfilNombre: z.string(),
  usuarioId: z.number().int(),
  usuarioEmail: z.string(),
  archivo: z.string(),
  numeroFactura: z.string(),
  exito: z.boolean(),
  mensaje: z.string(),
  remesas: z.number().int(),
  createdAt: z.string(),
});
export type CargaRndcReporte = z.infer<typeof cargaRndcReporteSchema>;
