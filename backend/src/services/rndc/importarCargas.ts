import type { CargaImportada } from "../../db/queries/cargas.queries.js";

type Campos = Record<string, string>;

function campo(doc: Campos, nombre: string): string {
  const clave = Object.keys(doc).find((k) => k.toLowerCase() === nombre.toLowerCase());
  const valor = (clave ? doc[clave] : "")?.trim() ?? "";
  // The RNDC uses "." as an empty marker in some fields.
  return valor === "." ? "" : valor;
}

/** Normalizes the RNDC's date/time (YYYY-MM-DD, YYYY/MM/DD or DD/MM/YYYY, optional time,
 * optional AM/PM) to "YYYY-MM-DD HH:MM:SS"; null if it can't be read. */
export function normalizarFechaRndc(texto: string): string | null {
  const m = /^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp]\.?\s*[Mm]\.?)?)?/.exec(
    texto.trim()
  );
  if (!m) return null;
  let [, a, b, c] = m as unknown as string[];
  let anio: string, mes: string, dia: string;
  if (a!.length === 4) [anio, mes, dia] = [a!, b!, c!];
  else if (c!.length === 4) [anio, mes, dia] = [c!, b!, a!];
  else return null;
  let hora = Number(m[4] ?? 12);
  const ampm = m[7]?.toLowerCase().replace(/[^ap]/g, "");
  if (ampm === "p" && hora < 12) hora += 12;
  if (ampm === "a" && hora === 12) hora = 0;
  const d = Number(dia), mo = Number(mes);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hora > 23) return null;
  const p2 = (n: number | string) => String(n).padStart(2, "0");
  return `${anio}-${p2(mo)}-${p2(d)} ${p2(hora)}:${p2(m[5] ?? "00")}:${p2(m[6] ?? "00")}`;
}

const ESTADOS: Record<string, string> = { CE: "Cumplida electrónicamente", AC: "No aprobada / rechazada" };

/** Maps an invoice from the RNDC's proceso 86 query to a report row. Returns null for
 * documents without an invoice number. */
export function cargaDesdeRndc(doc: Campos): CargaImportada | null {
  const numeroFactura = campo(doc, "numerofactura");
  if (!numeroFactura) return null;
  const radicado = campo(doc, "ingresoid");
  const estadoCod = campo(doc, "estado").toUpperCase();
  const estado = ESTADOS[estadoCod] ?? (estadoCod || "sin estado");
  const remesas = Number(campo(doc, "remesas"));
  return {
    numeroFactura,
    fecha: normalizarFechaRndc(campo(doc, "fechacrea")) ?? normalizarFechaRndc(campo(doc, "fechafactura")),
    exito: Boolean(radicado),
    mensaje: `${radicado ? `Radicado RNDC: ${radicado}` : "Sin radicado"} · Estado: ${estado} · Importada del RNDC (no se registró qué usuario la envió)`,
    remesas: Number.isInteger(remesas) && remesas >= 0 ? remesas : 0,
  };
}
