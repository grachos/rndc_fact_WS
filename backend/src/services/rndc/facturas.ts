import { postConsultaMulti, postConsultaUno, q } from "./client.js";
import type { PerfilCredenciales } from "../../db/queries/perfiles.queries.js";

type Campos = Record<string, string>;
type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

/** Consults an already-uploaded electronic invoice's status — proceso 86, tipo 3.
 * Does NOT upload anything, only reads. Port of consultar_factura. */
export async function consultarFactura(
  numFactura: string,
  perfil: PerfilCredenciales
): Promise<Resultado<Campos>> {
  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${perfil.rndcUsuario}</username>
    <password>${perfil.rndcPassword}</password>
  </acceso>
  <solicitud>
    <tipo>3</tipo>
    <procesoid>86</procesoid>
  </solicitud>
  <variables>*</variables>
  <documento>
    <NUMNITEMPRESATRANSPORTE>${q(perfil.nitSocio)}</NUMNITEMPRESATRANSPORTE>
    <NUMEROFACTURA>${q(numFactura.trim())}</NUMEROFACTURA>
  </documento>
</root>`;

  const res = await postConsultaUno(rndcXml);
  if (!res.ok) {
    return { ok: false, error: `No se encontró la factura ${numFactura} (${res.error})` };
  }
  return { ok: true, data: res.campos };
}

/** Tariff record for a remesa (proceso 34), including the linked `facturaelectronica`.
 * When a remesa has several records (re-tarifada), returns the most recent (highest ingresoid).
 * Port of consultar_factura_por_remesa. */
export async function consultarFacturaPorRemesa(
  consecutivoRemesa: string,
  numIdGenerador: string,
  perfil: PerfilCredenciales
): Promise<Resultado<Campos>> {
  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${perfil.rndcUsuario}</username>
    <password>${perfil.rndcPassword}</password>
  </acceso>
  <solicitud>
    <tipo>3</tipo>
    <procesoid>34</procesoid>
  </solicitud>
  <variables>*</variables>
  <documento>
    <NUMIDEMPRESA>${q(perfil.nitSocio)}</NUMIDEMPRESA>
    <NUMIDGENERADOR>${q(numIdGenerador.trim())}</NUMIDGENERADOR>
    <CONSECUTIVOREMESA>${q(consecutivoRemesa.trim())}</CONSECUTIVOREMESA>
  </documento>
</root>`;

  const res = await postConsultaMulti(rndcXml);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.docs.length === 0) {
    return {
      ok: false,
      error: `No se encontró tarifa para la remesa ${consecutivoRemesa} (¿generador/NIT y perfil correctos?)`,
    };
  }
  const masReciente = res.docs.reduce((max, d) =>
    Number(d.ingresoid ?? 0) > Number(max.ingresoid ?? 0) ? d : max
  );
  return { ok: true, data: masReciente };
}

/** All remesas of one invoice (proceso 34, filtered by FACTURAELECTRONICA) — one
 * documento per remesa. Port of consultar_remesas_por_factura. */
export async function consultarRemesasPorFactura(
  numFactura: string,
  numIdGenerador: string,
  perfil: PerfilCredenciales
): Promise<Resultado<Campos[]>> {
  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${perfil.rndcUsuario}</username>
    <password>${perfil.rndcPassword}</password>
  </acceso>
  <solicitud>
    <tipo>3</tipo>
    <procesoid>34</procesoid>
  </solicitud>
  <variables>*</variables>
  <documento>
    <NUMIDEMPRESA>${q(perfil.nitSocio)}</NUMIDEMPRESA>
    <NUMIDGENERADOR>${q(numIdGenerador.trim())}</NUMIDGENERADOR>
    <FACTURAELECTRONICA>${q(numFactura.trim())}</FACTURAELECTRONICA>
  </documento>
</root>`;

  const res = await postConsultaMulti(rndcXml);
  if (!res.ok) return { ok: false, error: res.error };
  if (res.docs.length === 0) {
    return {
      ok: false,
      error: `No se encontraron remesas para la factura ${numFactura} (¿generador/NIT y perfil correctos?)`,
    };
  }
  return { ok: true, data: res.docs };
}

function toDateOrNull(input: string): Date | null {
  const s = input.trim();
  const formats: Array<(s: string) => Date | null> = [
    (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : null),
    (s) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
      return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`) : null;
    },
    (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : null;
    },
    (s) => {
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
      return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) : null;
    },
  ];
  for (const fmt of formats) {
    const d = fmt(s);
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Lists invoices whose FECHAFACTURA falls in [fechaInicial, fechaFinal] — proceso 86,
 * tipo 3. The RNDC WS only supports an exact-date filter, so this queries day by day
 * and aggregates. Port of consultar_facturas_por_fecha.
 */
export async function consultarFacturasPorFecha(
  perfil: PerfilCredenciales,
  fechaInicial: string,
  fechaFinal: string,
  maxDias = 93
): Promise<Resultado<Campos[]>> {
  const d0raw = toDateOrNull(fechaInicial);
  const d1raw = toDateOrNull(fechaFinal);
  if (!d0raw || !d1raw) return { ok: false, error: "Fechas inválidas (usa AAAA-MM-DD)." };

  let d0 = d0raw;
  let d1 = d1raw;
  if (d1 < d0) [d0, d1] = [d1, d0];

  const dias = Math.round((d1.getTime() - d0.getTime()) / 86_400_000) + 1;
  if (dias > maxDias) {
    return { ok: false, error: `El rango es de ${dias} días; el máximo es ${maxDias}. Acorta el rango de fechas.` };
  }

  const todos: Campos[] = [];
  const errores: string[] = [];
  const cursor = new Date(d0);
  while (cursor <= d1) {
    const fecha = ymd(cursor);
    const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${perfil.rndcUsuario}</username>
    <password>${perfil.rndcPassword}</password>
  </acceso>
  <solicitud>
    <tipo>3</tipo>
    <procesoid>86</procesoid>
  </solicitud>
  <variables>*</variables>
  <documento>
    <NUMNITEMPRESATRANSPORTE>${q(perfil.nitSocio)}</NUMNITEMPRESATRANSPORTE>
    <FECHAFACTURA>${q(fecha)}</FECHAFACTURA>
  </documento>
</root>`;
    const res = await postConsultaMulti(rndcXml);
    if (res.ok) todos.push(...res.docs);
    else errores.push(`${fecha}: ${res.error}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  if (todos.length === 0 && errores.length > 0) {
    return { ok: false, error: errores.slice(0, 3).join("; ") };
  }
  return { ok: true, data: todos };
}
