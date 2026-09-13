const CONSULTA_ENDPOINT = "http://rndcws2.mintransporte.gov.co:8080";
const CONSULTA_SOAP_PATH = "/soap/IBPMServices";
const CONSULTA_ACTION = "urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC";

const ENVIO_ENDPOINT = "http://rndcws.mintransporte.gov.co:8080";
const ENVIO_SOAP_PATH = "/soap/IBPMServices";
const ENVIO_ACTION = "urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC";

/** RNDC quotes every scalar value inside its XML tags — a quirk of its own format, not XML escaping. */
export function q(value: string | number): string {
  return `'${escapeXml(String(value))}'`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function soapEnvelope(rndcXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:tns="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tns:AtenderMensajeRNDC>
      <Request>${escapeXml(rndcXml)}</Request>
    </tns:AtenderMensajeRNDC>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function htmlUnescape(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

async function postSoap(endpoint: string, path: string, action: string, rndcXml: string, timeoutMs: number) {
  const soapBody = soapEnvelope(rndcXml);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint + path, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        SOAPAction: action,
      },
      body: soapBody,
      signal: controller.signal,
    });
    return await res.text();
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new RndcError(`Tiempo de espera agotado (${timeoutMs / 1000}s)`);
    }
    throw new RndcError(`Sin conexión a ${endpoint}: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

export class RndcError extends Error {}

function extractInner(respText: string): string | null {
  const returnMatch = /<[^>]*:?return[^>]*>([\s\S]*?)<\/[^>]*:?return>/i.exec(respText);
  if (returnMatch) return htmlUnescape(returnMatch[1]!.trim());
  const rootMatch = /(<root[^>]*>[\s\S]*?<\/root>)/i.exec(respText);
  if (rootMatch) return htmlUnescape(rootMatch[1]!.trim());
  return null;
}

/** Extracts `<tag>value</tag>` pairs from a `<documento>...</documento>` block by
 * regex — tolerant of malformed XML (an unescaped `&` in a name/address is enough
 * to break strict parsing). Mirrors _campos_documento_regex / the inline fallback
 * used throughout rndc_service.py. */
function documentoFieldsByRegex(body: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const re = /<([A-Za-z_][\w.]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    campos[m[1]!] = (m[2] ?? "").trim();
  }
  return campos;
}

/** One consulta (tipo=3), expecting a single `<documento>`. Returns the flat field
 * map from that documento, or an error message. Faithful to consultar_factura /
 * consultar_remesa_completa / consultar_manifiesto_completo's parse-then-regex-fallback shape. */
export async function postConsultaUno(
  rndcXml: string,
  timeoutMs = 20000
): Promise<{ ok: true; campos: Record<string, string> } | { ok: false; error: string }> {
  let respText: string;
  try {
    respText = await postSoap(CONSULTA_ENDPOINT, CONSULTA_SOAP_PATH, CONSULTA_ACTION, rndcXml, timeoutMs);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const inner = extractInner(respText);
  if (!inner) {
    return { ok: false, error: `Respuesta no reconocida: ${respText.trim().slice(0, 200)}` };
  }

  const errorMatch = /<ErrorMSG>([\s\S]*?)<\/ErrorMSG>/i.exec(inner) ?? /<error>([\s\S]*?)<\/error>/i.exec(inner);
  if (errorMatch && errorMatch[1]?.trim()) {
    return { ok: false, error: errorMatch[1].trim() };
  }

  const docMatch = /<documento>([\s\S]*?)<\/documento>/i.exec(inner);
  if (!docMatch) {
    const campos = documentoFieldsByRegex(inner);
    if (Object.keys(campos).length > 0) return { ok: true, campos };
    return { ok: false, error: `Sin <documento> en la respuesta: ${inner.trim().slice(0, 200)}` };
  }

  const campos = documentoFieldsByRegex(docMatch[1]!);
  if (Object.keys(campos).length === 0) {
    return { ok: false, error: "El <documento> no trajo campos." };
  }
  return { ok: true, campos };
}

/** One consulta (tipo=3), expecting zero or more `<documento>` blocks. Mirrors
 * _post_consulta_multi — regex-tolerant, returns (ok, []) when nothing matched but
 * there was no error either. */
export async function postConsultaMulti(
  rndcXml: string,
  timeoutMs = 20000
): Promise<{ ok: true; docs: Record<string, string>[] } | { ok: false; error: string }> {
  let respText: string;
  try {
    respText = await postSoap(CONSULTA_ENDPOINT, CONSULTA_SOAP_PATH, CONSULTA_ACTION, rndcXml, timeoutMs);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const inner = extractInner(respText);
  if (!inner) {
    return { ok: false, error: `Respuesta no reconocida: ${respText.trim().slice(0, 200)}` };
  }

  const errorMatch = /<ErrorMSG>([\s\S]*?)<\/ErrorMSG>/i.exec(inner);
  if (errorMatch && errorMatch[1]?.trim()) {
    return { ok: false, error: errorMatch[1].trim() };
  }

  const docs: Record<string, string>[] = [];
  const re = /<documento>([\s\S]*?)<\/documento>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const campos = documentoFieldsByRegex(m[1]!);
    if (Object.keys(campos).length > 0) docs.push(campos);
  }
  return { ok: true, docs };
}

/** Generic write (tipo=1) sender — the shared engine behind all mutating RNDC calls
 * (corregir/anular/cumplir). Port of _enviar_proceso_rndc. Builds `<variables>` from
 * an ordered map, no `<documento>` element. */
export async function postEnvio(
  procesoId: number,
  variables: Record<string, string | number>,
  usuario: string,
  password: string,
  timeoutMs = 20000
): Promise<{ ok: true; ingresoId: string; respuesta: string } | { ok: false; error: string }> {
  const varsXml = Object.entries(variables)
    .map(([k, v]) => `    <${k}>${q(v)}</${k}>`)
    .join("\n");

  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${escapeXml(usuario)}</username>
    <password>${escapeXml(password)}</password>
  </acceso>
  <solicitud>
    <tipo>1</tipo>
    <procesoid>${procesoId}</procesoid>
  </solicitud>
  <variables>
${varsXml}
  </variables>
</root>`;

  let respText: string;
  try {
    respText = await postSoap(ENVIO_ENDPOINT, ENVIO_SOAP_PATH, ENVIO_ACTION, rndcXml, timeoutMs);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }

  const inner = extractInner(respText);
  if (!inner) {
    return { ok: false, error: `Respuesta no reconocida: ${respText.trim().slice(0, 200)}` };
  }

  const ingresoMatch = /<ingresoid>([\s\S]*?)<\/ingresoid>/i.exec(inner);
  if (ingresoMatch && ingresoMatch[1]?.trim()) {
    return { ok: true, ingresoId: ingresoMatch[1].trim(), respuesta: inner };
  }

  const errorMatch = /<ErrorMSG>([\s\S]*?)<\/ErrorMSG>/i.exec(inner) ?? /<error>([\s\S]*?)<\/error>/i.exec(inner);
  if (errorMatch && errorMatch[1]?.trim()) {
    return { ok: false, error: errorMatch[1].trim() };
  }

  return { ok: false, error: inner.trim().slice(0, 280) };
}

export { CONSULTA_ENDPOINT, ENVIO_ENDPOINT };
