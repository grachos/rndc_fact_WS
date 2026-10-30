import type { GenerarXmlInput } from "@fe-tool/shared";
import { getPerfilXmlTemplate } from "../../db/queries/perfiles.queries.js";
import { aplicarDatosXml, parseXmlTemplate, type RemesaEdicion } from "./templateEditor.js";
import { FacturaInvalidaError, validarFactura } from "./validarFactura.js";

export class SinPlantillaError extends Error {
  constructor(perfilId: number) {
    super(
      `Este perfil (id ${perfilId}) no tiene una plantilla XML cargada. Sube una factura real de ejemplo en Perfiles antes de generar.`
    );
  }
}

/** Generates one invoice by editing a template's header fields and remesa lines with
 * this invoice's data. All remesa lines are treated as new (built from the template's
 * first remesa line) since a generated invoice's remesas are never the template's own.
 * Throws FacturaInvalidaError instead of returning an XML that fails validation. */
export function generarFacturaConTemplate(
  templateContenido: string,
  datos: GenerarXmlInput
): { xml: string; filename: string; avisos: string[] } {
  const orig = parseXmlTemplate(templateContenido);
  const remesas: RemesaEdicion[] = datos.remesas.map((r) => ({
    radicado: r.radicado,
    consecutivo: r.consecutivo,
    valor: String(r.valor),
    peso: r.peso,
    descripcion: r.descripcionLinea,
    nuevo: true,
  }));

  const { xml, avisos } = aplicarDatosXml(
    templateContenido,
    orig,
    {
      numero: datos.numeroFactura,
      cufe: datos.cufe,
      fecha: datos.fecha,
      cliente: datos.nombreCliente,
      nit: datos.nitCliente,
      dig: datos.digitoCliente,
    },
    remesas
  );

  const errores = validarFactura(xml, {
    esperado: {
      remesas: datos.remesas.map((r) => ({ consecutivo: r.consecutivo, radicado: r.radicado, valor: r.valor })),
      valorTotal: datos.valorTotal,
    },
  });
  if (errores.length > 0) throw new FacturaInvalidaError(errores);

  return { xml, filename: `FACTURA_${datos.numeroFactura}.xml`, avisos };
}

/** Fetches the perfil's stored template, then generates. Use generarFacturaConTemplate
 * directly (with a pre-fetched template) when generating many invoices in a loop. */
export async function generarFacturaDesdeTemplate(
  datos: GenerarXmlInput
): Promise<{ xml: string; filename: string; avisos: string[] }> {
  const template = await getPerfilXmlTemplate(datos.perfilId);
  if (!template) throw new SinPlantillaError(datos.perfilId);
  return generarFacturaConTemplate(template.contenido, datos);
}
