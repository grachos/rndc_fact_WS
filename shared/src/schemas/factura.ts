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

/** Status of an invoice in the report: uploaded OK, rejected/blocked by the RNDC, or
 * generated in the app but never uploaded. */
export const estadoFacturaSchema = z.enum(["exitosa", "fallida", "sin_subir"]);
export type EstadoFactura = z.infer<typeof estadoFacturaSchema>;

/** One row of the "Reporte de cargas RNDC": either an upload attempt (`fuente: "carga"`)
 * or a generated invoice that was never uploaded (`fuente: "generada"`). */
export const cargaRndcReporteSchema = z.object({
  id: z.number().int(),
  /** Which table the row (and its XML) comes from. */
  fuente: z.enum(["carga", "generada"]),
  estado: estadoFacturaSchema,
  /** How the invoice was generated in the app, if it was ("manual" | "excel"); null = uploaded file from outside. */
  origen: z.enum(["manual", "excel"]).nullable(),
  perfilId: z.number().int(),
  perfilNombre: z.string(),
  usuarioId: z.number().int(),
  usuarioEmail: z.string(),
  archivo: z.string(),
  numeroFactura: z.string(),
  exito: z.boolean(),
  mensaje: z.string(),
  remesas: z.number().int(),
  /** Whether the uploaded XML is stored as evidence (downloadable from the report). */
  tieneXml: z.boolean(),
  createdAt: z.string(),
});
export type CargaRndcReporte = z.infer<typeof cargaRndcReporteSchema>;
