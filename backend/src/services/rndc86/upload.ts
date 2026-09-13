import { XMLParser } from "fast-xml-parser";

const ENDPOINTS = {
  pruebas: "http://rndcpruebas.mintransporte.gov.co:8080",
  produccion: "http://rndcws.mintransporte.gov.co:8080",
};
const SOAP_PATH = "/soap/IBPMServices";
const PROCESO = "86";
const SOAP_ACTION = "urn:BPMServicesIntf-IBPMServices#AtenderMensajeRNDC";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

// The RNDC WS sometimes returns bare "Error FACxxx" codes without a description even
// though the portal shows one — append the known description when it's missing.
const FAC_DESCRIPCIONES: Record<string, string> = {
  FAC038:
    "El xml reportado tiene un numero de factura que ya está reportado previamente por la empresa de transporte (factura duplicada).",
  FAC080: "El xml reportado tiene una remesa sin cumplir.",
  FAC081: "El xml reportado no tiene numero de factura de referencia en la remesa.",
};
const CODIGOS_NIVEL_FACTURA = new Set(["FAC038"]);

function enriquecerCodigos(msg: string): string {
  if (!msg) return msg;
  return msg.replace(/Error\s+(FAC\d+)(?!\s*:)/g, (full, cod: string) => {
    const desc = FAC_DESCRIPCIONES[cod];
    return desc ? `Error ${cod}: ${desc}` : full;
  });
}

export interface DetalleError {
  codigo: string;
  mensaje: string;
  linea: number | null;
  radicado: string | null;
  nivel: "factura" | "remesa";
}

/** Extracts per-line/per-remesa errors from the RNDC's raw <ErrorMSG> text. Port of parse_detalle_errores. */
export function parseDetalleErrores(respText: string): DetalleError[] {
  if (!respText) return [];
  const m = /<[^>]*:?return[^>]*>([\s\S]*?)<\/[^>]*:?return>/i.exec(respText);
  const inner = htmlUnescape(m ? m[1]! : respText);
  const me = /<ErrorMSG>([\s\S]*)<\/ErrorMSG>/i.exec(inner);
  let texto = me ? me[1]! : inner;
  texto = texto.replace(/<\/?ErrorMSG>/g, " ");

  const detalle: DetalleError[] = [];
  const patron = /Error\s+([A-Z]{2,}\d+)\s*:\s*([\s\S]*?)(?=(?:Error\s+[A-Z]{2,}\d+\s*:)|$)/g;
  let seg: RegExpExecArray | null;
  while ((seg = patron.exec(texto))) {
    const codigo = seg[1]!;
    let cuerpo = seg[2]!.trim();
    const ml = /;?\s*Linea:\s*(\d+)/i.exec(cuerpo);
    const linea = ml ? Number(ml[1]) : null;
    const mr = /sin\s+cumplir\s*:\s*(\d+)/i.exec(cuerpo);
    const radicado = mr ? mr[1]! : null;
    let desc = cuerpo.replace(/;?\s*Linea:\s*\d+/gi, "").trim();
    desc = desc.replace(/\s{2,}/g, " ").trim().replace(/^[.\s;]+|[.\s;]+$/g, "");
    const nivel = CODIGOS_NIVEL_FACTURA.has(codigo) ? "factura" : "remesa";
    detalle.push({ codigo, mensaje: `Error ${codigo}: ${desc}`, linea, radicado, nivel });
  }
  return detalle;
}

function parseXmlTolerant(texto: string): Record<string, unknown> | null {
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  for (const intento of [texto, texto.replace(/<\?xml[^?]*\?>/, "").trim()]) {
    try {
      return parser.parse(intento);
    } catch {
      continue;
    }
  }
  return null;
}

function limpiarMsg(texto: string): string {
  texto = texto.replace(/Paso\s*\d+\s*[Ee]jecutando\s+solicitud\.?\s*ProcesoId:\s*\d+\s*/g, "").trim();
  const mErr = /(Error\s+[A-Z]{2,}\d+\s*:[\s\S]*)/.exec(texto);
  if (mErr) texto = mErr[1]!.trim();
  texto = texto.replace(/\s*;Linea:\d+\s*/g, "").trim();
  texto = texto.replace(/ {2,}/g, " ").trim();
  const partes = texto
    .split(/(?=Error\s+[A-Z]{2,}\d+\s*:)/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length > 1) {
    const vistos: string[] = [];
    for (const p of partes) {
      const clean = p.replace(/\s+/g, " ").trim().replace(/\.+$/, "");
      if (!vistos.includes(clean)) vistos.push(clean);
    }
    texto = vistos.join("  |  ");
  }
  return texto;
}

function findDeep(obj: any, tagLower: string): string | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object") return undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === tagLower) {
      if (typeof value === "string") return value.trim() || undefined;
      if (typeof value === "object") {
        const nested = findDeep(value, tagLower);
        if (nested) return nested;
      }
    }
  }
  for (const value of Object.values(obj)) {
    if (typeof value === "object") {
      const nested = findDeep(value, tagLower);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Parses the RNDC's SOAP response. Port of _parsear_respuesta. */
export function parsearRespuesta(respText: string): { exito: boolean; mensaje: string } {
  const m = /<[^>]*:?return[^>]*>([\s\S]*?)<\/[^>]*:?return>/i.exec(respText);
  const inner = htmlUnescape(m ? m[1]!.trim() : (/(<root[^>]*>[\s\S]*?<\/root>)/i.exec(respText)?.[1] ?? "").trim());
  if (!inner) {
    return { exito: false, mensaje: `Respuesta no reconocida: ${respText.trim().slice(0, 200)}` };
  }

  const parsed = parseXmlTolerant(inner);
  if (!parsed) {
    const textoPlano = inner.trim().slice(0, 250);
    const exito = ["INGRESOID", "EXITOSO", "CORRECTO", "ACEPTADO"].some((p) =>
      textoPlano.toUpperCase().includes(p)
    );
    return { exito, mensaje: textoPlano };
  }

  const ingresoId = findDeep(parsed, "ingresoid");
  if (ingresoId) {
    const esPrueba = /^\d+$/.test(ingresoId) && Number(ingresoId) > 900_000_000;
    return { exito: true, mensaje: `Radicado RNDC: ${ingresoId}${esPrueba ? " · Ambiente de pruebas" : ""}` };
  }

  for (const tag of ["errormsg", "error", "mensaje", "message", "respuesta"]) {
    const texto = findDeep(parsed, tag);
    if (texto) return { exito: false, mensaje: limpiarMsg(texto).slice(0, 280) };
  }

  return { exito: false, mensaje: limpiarMsg(inner).slice(0, 280) };
}

export interface EnviarFacturaResultado {
  exito: boolean;
  mensaje: string;
  detalle?: DetalleError[];
}

/** Uploads one invoice XML to the RNDC as Factura Electrónica — proceso 86. Port of enviar_factura_rndc. */
export async function enviarFacturaRndc(
  contenido: Buffer,
  usuario: string,
  password: string,
  nitEmpresa: string,
  opts: { produccion?: boolean; timeoutMs?: number } = {}
): Promise<EnviarFacturaResultado> {
  const endpoint = opts.produccion === false ? ENDPOINTS.pruebas : ENDPOINTS.produccion;
  const timeoutMs = opts.timeoutMs ?? 45000;

  const base64 = contenido.toString("base64");
  const rndcXml = `<?xml version='1.0' encoding='ISO-8859-1' ?>
<root>
  <acceso>
    <username>${escapeXml(usuario)}</username>
    <password>${escapeXml(password)}</password>
  </acceso>
  <solicitud>
    <tipo>1</tipo>
    <procesoid>${PROCESO}</procesoid>
  </solicitud>
  <variables>
    <NUMNITEMPRESATRANSPORTE>${escapeXml(nitEmpresa)}</NUMNITEMPRESATRANSPORTE>
    <ARCHIVOBASE64>${base64}</ARCHIVOBASE64>
  </variables>
</root>`;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let respText: string;
  try {
    const res = await fetch(endpoint + SOAP_PATH, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: SOAP_ACTION },
      body: soapBody,
      signal: controller.signal,
    });
    respText = await res.text();
  } catch (err: any) {
    const mensaje =
      err?.name === "AbortError"
        ? `Tiempo de espera agotado (${timeoutMs / 1000}s)`
        : `Sin conexión a ${endpoint}`;
    return { exito: false, mensaje: enriquecerCodigos(mensaje) };
  } finally {
    clearTimeout(timer);
  }

  const { exito, mensaje } = parsearRespuesta(respText);
  return { exito, mensaje: enriquecerCodigos(mensaje), detalle: parseDetalleErrores(respText) };
}

export interface FacturaXmlPreview {
  archivo: string;
  nf: string;
  cufe: string;
  cliente: string;
  clienteNit: string;
  remesas: { consecutivo: string; radicado: string; valor: string }[];
  error?: string;
}

/** Extracts invoice number/CUFE/client/remesas from an invoice XML for the pre-upload
 * preview table. Port of parse_factura_xml. */
export function parseFacturaXml(nombre: string, contenido: Buffer): FacturaXmlPreview {
  const info: FacturaXmlPreview = { archivo: nombre, nf: "", cufe: "", cliente: "", clienteNit: "", remesas: [] };
  try {
    const texto = contenido.toString("utf-8");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
    const root = parser.parse(texto);
    const rootTagKey = Object.keys(root).find((k) => k !== "?xml") ?? "";
    const isAttached = rootTagKey.toLowerCase().includes("attacheddocument");

    info.nf = findDeep(root, "parentdocumentid") ?? findDeep(root, "id") ?? "";
    info.cufe = findDeep(root, "uuid") ?? "";
    info.cliente = "";
    info.clienteNit = findDeep(root, "companyid") ?? "";

    let invoiceXml: string | null = null;
    if (isAttached) {
      const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(texto);
      if (cdataMatch) invoiceXml = cdataMatch[1]!.trim();
    } else if (rootTagKey.toLowerCase().includes("invoice")) {
      invoiceXml = texto;
    }

    if (invoiceXml) {
      const invRoot = parser.parse(invoiceXml);
      const customerParty = findObjectByTag(invRoot, "accountingcustomerparty");
      info.cliente = (customerParty && findDeep(customerParty, "registrationname")) || info.cliente;

      const lineas = collectByTag(invRoot, "invoiceline");
      for (const linea of lineas) {
        const props = collectByTag(linea, "additionalitemproperty");
        const propMap: Record<string, string> = {};
        for (const p of props) {
          const name = findDeep(p, "name");
          const value = findDeep(p, "value");
          if (name) propMap[name] = value ?? "";
        }
        const radicado = propMap["01"] ?? "";
        const consecutivo = propMap["02"] ?? "";
        const valorRaw = propMap["03"] ?? findDeep(linea, "lineextensionamount") ?? "0";
        let valor = valorRaw;
        const num = Number(valorRaw);
        if (!Number.isNaN(num)) {
          valor = `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        info.remesas.push({ consecutivo, radicado, valor });
      }
    }
  } catch (err: any) {
    info.error = String(err?.message ?? err);
  }
  return info;
}

function findObjectByTag(obj: any, tagLower: string): any {
  if (obj === null || typeof obj !== "object") return undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase().endsWith(tagLower)) return value;
    if (typeof value === "object") {
      const nested = findObjectByTag(value, tagLower);
      if (nested) return nested;
    }
  }
  return undefined;
}

function collectByTag(obj: any, tagLower: string): any[] {
  const out: any[] = [];
  function walk(node: any) {
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key.toLowerCase().endsWith(tagLower)) {
        if (Array.isArray(value)) out.push(...value);
        else out.push(value);
      } else if (typeof value === "object") {
        walk(value);
      }
    }
  }
  walk(obj);
  return out;
}
