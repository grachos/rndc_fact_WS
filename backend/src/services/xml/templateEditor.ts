import { fmtValor, parseValor } from "../../utils/numeros.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizarValor(texto: string): string {
  try {
    return fmtValor(parseValor(texto));
  } catch {
    return texto;
  }
}

function toIso(fechaStr: string): string {
  const s = fechaStr.trim();
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^(\d{2})-(\d{2})-(\d{4})$/, (m) => `${m[3]}-${m[2]}-${m[1]}`],
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
    [/^(\d{2})\/(\d{2})\/(\d{4})$/, (m) => `${m[3]}-${m[2]}-${m[1]}`],
    [/^(\d{4})\/(\d{2})\/(\d{2})$/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
  ];
  for (const [re, fmt] of patterns) {
    const m = re.exec(s);
    if (m) return fmt(m);
  }
  return s;
}

function prop(linea: string, name: string): string {
  const re = new RegExp(
    `<cac:AdditionalItemProperty>\\s*<cbc:Name>\\s*${escapeRegex(name)}\\s*</cbc:Name>\\s*<cbc:Value>([^<]*)</cbc:Value>`
  );
  return re.exec(linea)?.[1] ?? "";
}

function invoicedQty(linea: string): string {
  const m1 =
    /<cac:AdditionalItemProperty>\s*<cbc:Name>\s*03\s*<\/cbc:Name>\s*<cbc:Value>[^<]*<\/cbc:Value>\s*<cbc:ValueQuantity[^>]*>([^<]+)<\/cbc:ValueQuantity>/.exec(
      linea
    );
  if (m1?.[1]?.trim()) return m1[1].trim();
  const m2 = /<cbc:InvoicedQuantity[^>]*>([^<]+)<\/cbc:InvoicedQuantity>/.exec(linea);
  return m2?.[1]?.trim() ?? "";
}

function descripcion(linea: string): string {
  const m = /<cac:Item>\s*<cbc:Description>([^<]*)<\/cbc:Description>/.exec(linea);
  return m?.[1]?.trim() ?? "";
}

export interface RemesaOriginal {
  idx: number;
  radicado: string;
  consecutivo: string;
  valor: string;
  peso: string;
  descripcion: string;
}

export interface ParsedXmlTemplate {
  numero: string;
  cufe: string;
  cliente: string;
  fecha: string;
  fechaIso: string;
  total: string;
  totalOrig: string;
  nit: string;
  dig: string;
  remesas: RemesaOriginal[];
}

/** Extracts the header fields + remesa lines currently baked into a template invoice.
 * Port of webapp/lib_editar.py's parse_xml. */
export function parseXmlTemplate(contenido: string): ParsedXmlTemplate {
  const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(contenido);
  const inv = cdataMatch ? cdataMatch[1]! : contenido;
  const invNorm = inv.replace(/<cac:InvoiceLine\s+xmlns="[^"]*"(?:\s+xmlns:[^=]+="[^"]*")*\s*>/g, "<cac:InvoiceLine>");

  const lineas = invNorm.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) ?? [];
  const remesas: RemesaOriginal[] = lineas.map((linea, i) => ({
    idx: i,
    radicado: prop(linea, "01"),
    consecutivo: prop(linea, "02"),
    valor: normalizarValor(prop(linea, "03")),
    peso: invoicedQty(linea),
    descripcion: descripcion(linea),
  }));

  const mNum = /<cbc:ID>([^<]+)<\/cbc:ID>/.exec(invNorm);
  const mCufe = /<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/.exec(contenido);
  const numero = mNum?.[1]?.trim() ?? "";
  const cufe = mCufe?.[1]?.trim() ?? "";

  const mFecha = /<cbc:IssueDate>(\d{2,4}[-/]\d{2}[-/]\d{2,4})<\/cbc:IssueDate>/.exec(invNorm);
  const fechaRaw = mFecha?.[1]?.trim() ?? "";
  const fechaIso = toIso(fechaRaw);

  const custStart = invNorm.indexOf("<cac:AccountingCustomerParty");
  const custEnd = invNorm.indexOf("</cac:AccountingCustomerParty>", custStart);
  let nombreCli = "";
  let nitCli = "";
  let digCli = "";
  if (custStart !== -1) {
    const bloque = invNorm.slice(custStart, custEnd === -1 ? undefined : custEnd);
    const mc =
      /<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/.exec(bloque) ??
      /<cac:PartyName>\s*<cbc:Name>([^<]+)<\/cbc:Name>/.exec(bloque);
    nombreCli = mc?.[1]?.trim() ?? "";

    const mNit =
      /<cac:PartyIdentification>\s*<cbc:ID[^>]*schemeID="([^"]*)"[^>]*>([^<]+)<\/cbc:ID>/.exec(bloque) ??
      /<cac:PartyTaxScheme>[\s\S]*?<cbc:CompanyID[^>]*schemeID="([^"]*)"[^>]*>([^<]+)<\/cbc:CompanyID>/.exec(bloque) ??
      /<cac:PartyLegalEntity>[\s\S]*?<cbc:CompanyID[^>]*schemeID="([^"]*)"[^>]*>([^<]+)<\/cbc:CompanyID>/.exec(bloque);
    if (mNit) {
      digCli = mNit[1]!.trim();
      nitCli = mNit[2]!.trim();
    }
  }

  const mTotal = /<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/.exec(invNorm);
  const totalRaw = mTotal?.[1]?.trim() ?? "";
  const totalFmt = normalizarValor(totalRaw);

  return {
    numero,
    cufe,
    cliente: nombreCli,
    fecha: fechaRaw,
    fechaIso,
    total: totalFmt,
    totalOrig: totalRaw,
    nit: nitCli,
    dig: digCli,
    remesas,
  };
}

function setDescripcion(linea: string, valor: string): string {
  return linea.replace(/(<cac:Item>\s*<cbc:Description>)[^<]*(<\/cbc:Description>)/, `$1${valor}$2`);
}

function setProp(linea: string, name: string, valor: string): string {
  const re = new RegExp(
    `(<cac:AdditionalItemProperty>\\s*<cbc:Name>\\s*${escapeRegex(name)}\\s*</cbc:Name>\\s*<cbc:Value>)[^<]*(</cbc:Value>)`
  );
  return linea.replace(re, `$1${valor}$2`);
}

function setProp03(linea: string, valor: string, peso: string): string {
  const re =
    /(<cac:AdditionalItemProperty>\s*<cbc:Name>\s*03\s*<\/cbc:Name>\s*<cbc:Value>)[^<]*(<\/cbc:Value>\s*<cbc:ValueQuantity[^>]*>)[^<]*(<\/cbc:ValueQuantity>)/;
  return linea.replace(re, `$1${valor}$2${peso}$3`);
}

function setInvoicedQty(linea: string, peso: string): string {
  return linea.replace(/(<cbc:InvoicedQuantity[^>]*>)[^<]*(<\/cbc:InvoicedQuantity>)/, `$1${peso}$2`);
}

export interface RemesaEdicion {
  radicado: string;
  consecutivo: string;
  valor: string;
  peso: string;
  descripcion: string;
  /** true for a line that doesn't exist in the template yet — cloned from the template's first line. */
  nuevo: boolean;
}

export interface NuevosValores {
  numero: string;
  cufe: string;
  total: string;
  fecha: string; // YYYY-MM-DD
  cliente: string;
  nit: string;
  dig: string;
}

/**
 * Produces a new invoice XML by editing the header fields and remesa lines of a
 * template XML in place — everything else (signature, certificate, DIAN authorization,
 * supplier address) is copied verbatim from the template. Port of webapp/lib_editar.py's
 * guardar_xml, which is exactly what "Editar XML" already does to an existing invoice;
 * here it's the core mechanism for generating a brand new one from a per-perfil template.
 */
export function aplicarDatosXml(
  contenido: string,
  orig: ParsedXmlTemplate,
  nuevos: NuevosValores,
  remesas: RemesaEdicion[]
): { xml: string; avisos: string[] } {
  const avisos: string[] = [];

  const mCdata = /(<!\[CDATA\[)([\s\S]*?)(\]\]>)/.exec(contenido);
  if (!mCdata) throw new Error("No se encontró bloque CDATA en el XML.");

  const inv = mCdata[2]!;
  const lineasOrig = inv.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) ?? [];
  const plantillaLine = lineasOrig[0];

  const lineasResultado: string[] = [];
  remesas.forEach((r, pos) => {
    let valFmt: string;
    try {
      valFmt = fmtValor(parseValor(r.valor));
    } catch {
      valFmt = r.valor;
    }

    let linea: string;
    if (r.nuevo && plantillaLine) {
      linea = plantillaLine.replace(/(<cbc:ID[^>]*>)\d+(<\/cbc:ID>)/, `$1${pos + 1}$2`);
      linea = setProp(linea, "01", r.radicado);
      linea = setProp(linea, "02", r.consecutivo);
      linea = setProp03(linea, valFmt || "0", r.peso || "0");
      linea = setInvoicedQty(linea, r.peso || "0");
      linea = setDescripcion(linea, r.descripcion ?? "");
    } else if (pos < lineasOrig.length) {
      linea = lineasOrig[pos]!.replace(/(<cbc:ID[^>]*>)\d+(<\/cbc:ID>)/, `$1${pos + 1}$2`);
      linea = setProp(linea, "01", r.radicado);
      linea = setProp(linea, "02", r.consecutivo);
      linea = setProp03(linea, valFmt, r.peso);
      linea = setInvoicedQty(linea, r.peso);
      linea = setDescripcion(linea, r.descripcion ?? "");
    } else {
      return;
    }
    lineasResultado.push(linea);
  });

  let invNuevo: string;
  if (lineasOrig.length > 0) {
    const primerInicio = inv.indexOf(lineasOrig[0]!);
    const ultimoFin = inv.lastIndexOf(lineasOrig[lineasOrig.length - 1]!) + lineasOrig[lineasOrig.length - 1]!.length;
    invNuevo = inv.slice(0, primerInicio) + lineasResultado.join("\n") + inv.slice(ultimoFin);
  } else {
    invNuevo = inv;
  }

  invNuevo = invNuevo.replace(/(<cbc:LineCountNumeric>)\d+(<\/cbc:LineCountNumeric>)/, `$1${lineasResultado.length}$2`);

  let contenidoNuevo = contenido.slice(0, mCdata.index + mCdata[1]!.length) + invNuevo + contenido.slice(mCdata.index + mCdata[1]!.length + mCdata[2]!.length);

  // N° Factura
  const numNuevo = nuevos.numero.trim();
  if (numNuevo && orig.numero && numNuevo !== orig.numero) {
    contenidoNuevo = contenidoNuevo.replace(
      new RegExp(`(<cbc:ID>)${escapeRegex(orig.numero)}(</cbc:ID>)`, "g"),
      `$1${numNuevo}$2`
    );
    contenidoNuevo = contenidoNuevo.replace(
      new RegExp(`(<cbc:ParentDocumentID>)${escapeRegex(orig.numero)}(</cbc:ParentDocumentID>)`, "g"),
      `$1${numNuevo}$2`
    );
  }

  // CUFE
  const cufeNuevo = nuevos.cufe.trim();
  if (cufeNuevo && orig.cufe && cufeNuevo !== orig.cufe) {
    contenidoNuevo = contenidoNuevo.replace(
      new RegExp(`(<cbc:UUID[^>]*>)${escapeRegex(orig.cufe)}(</cbc:UUID>)`, "g"),
      `$1${cufeNuevo}$2`
    );
    contenidoNuevo = contenidoNuevo.split(`documentkey=${orig.cufe}`).join(`documentkey=${cufeNuevo}`);
  }

  // Valor total factura (note: retention is applied uniformly to every <TaxAmount> tag
  // found, invoice-level and per-line — a known simplification inherited from the
  // original Editar XML tool; correct for the common single/uniform-value-remesa case).
  const totalNuevoRaw = nuevos.total.trim();
  if (totalNuevoRaw && orig.totalOrig) {
    try {
      const totalNuevo = fmtValor(parseValor(totalNuevoRaw));
      const retencionNueva = fmtValor(Math.round(parseValor(totalNuevoRaw) * 0.01 * 100) / 100);
      for (const tag of ["LineExtensionAmount", "TaxInclusiveAmount", "PayableAmount"]) {
        contenidoNuevo = contenidoNuevo.replace(
          new RegExp(`(<cbc:${tag}[^>]*>)${escapeRegex(orig.totalOrig)}(</cbc:${tag}>)`, "g"),
          `$1${totalNuevo}$2`
        );
      }
      contenidoNuevo = contenidoNuevo.replace(
        new RegExp(`(<cbc:TaxableAmount[^>]*>)${escapeRegex(orig.totalOrig)}(</cbc:TaxableAmount>)`, "g"),
        `$1${totalNuevo}$2`
      );
      contenidoNuevo = contenidoNuevo.replace(/(<cbc:TaxAmount[^>]*>)[^<]+(<\/cbc:TaxAmount>)/g, `$1${retencionNueva}$2`);
    } catch (err: any) {
      avisos.push(`No se pudo parsear el valor total '${totalNuevoRaw}': ${err?.message ?? err}`);
    }
  }

  // Fecha de generación + Vencimiento (+30 días)
  const fechaNueva = nuevos.fecha.trim();
  const fechaOrigXml = orig.fecha;
  const fechaOrigIso = orig.fechaIso;
  if (fechaNueva && fechaOrigXml && fechaNueva !== fechaOrigIso && fechaNueva !== fechaOrigXml) {
    const dtNueva = new Date(toIso(fechaNueva) + "T00:00:00");
    if (Number.isNaN(dtNueva.getTime())) {
      avisos.push(`La fecha '${fechaNueva}' no tiene formato válido; no se actualizó.`);
    } else {
      const vencNueva = new Date(dtNueva);
      vencNueva.setDate(vencNueva.getDate() + 30);
      const vencStr = vencNueva.toISOString().slice(0, 10);
      contenidoNuevo = contenidoNuevo.replace(
        new RegExp(`(<cbc:IssueDate>)${escapeRegex(fechaOrigXml)}(</cbc:IssueDate>)`, "g"),
        `$1${fechaNueva}$2`
      );
      contenidoNuevo = contenidoNuevo.replace(
        new RegExp(`(<xades:SigningTime>)${escapeRegex(fechaOrigIso)}(T)`, "g"),
        `$1${fechaNueva}$2`
      );
      contenidoNuevo = contenidoNuevo.replace(
        new RegExp(`(<cbc:ValidationDate>)${escapeRegex(fechaOrigIso)}(</cbc:ValidationDate>)`, "g"),
        `$1${fechaNueva}$2`
      );
      contenidoNuevo = contenidoNuevo.replace(/(<cbc:DueDate>)[\d/-]+(<\/cbc:DueDate>)/g, `$1${vencStr}$2`);
      contenidoNuevo = contenidoNuevo.replace(/(<cbc:PaymentDueDate>)[\d/-]+(<\/cbc:PaymentDueDate>)/g, `$1${vencStr}$2`);
    }
  }

  // Nombre cliente
  const clienteNuevo = nuevos.cliente.trim();
  if (clienteNuevo && orig.cliente && clienteNuevo !== orig.cliente) {
    const co = orig.cliente;
    const custStartC = contenidoNuevo.indexOf("<cac:AccountingCustomerParty");
    const custEndTagC = contenidoNuevo.indexOf("</cac:AccountingCustomerParty>", custStartC);
    if (custStartC !== -1 && custEndTagC !== -1) {
      const custEndC = custEndTagC + "</cac:AccountingCustomerParty>".length;
      let bloqueC = contenidoNuevo.slice(custStartC, custEndC);
      bloqueC = bloqueC.split(`<cbc:Name>${co}</cbc:Name>`).join(`<cbc:Name>${clienteNuevo}</cbc:Name>`);
      bloqueC = bloqueC
        .split(`<cbc:RegistrationName>${co}</cbc:RegistrationName>`)
        .join(`<cbc:RegistrationName>${clienteNuevo}</cbc:RegistrationName>`);
      contenidoNuevo = contenidoNuevo.slice(0, custStartC) + bloqueC + contenidoNuevo.slice(custEndC);
    }
    const firstCdataC = contenidoNuevo.indexOf("<![CDATA[");
    const outerLimC = firstCdataC !== -1 ? firstCdataC : contenidoNuevo.length;
    const recvS = contenidoNuevo.indexOf("<cac:ReceiverParty", 0);
    if (recvS !== -1 && recvS < outerLimC) {
      const recvETag = contenidoNuevo.indexOf("</cac:ReceiverParty>", recvS);
      if (recvETag !== -1) {
        const recvE = recvETag + "</cac:ReceiverParty>".length;
        let bloqueR = contenidoNuevo.slice(recvS, recvE);
        bloqueR = bloqueR
          .split(`<cbc:RegistrationName>${co}</cbc:RegistrationName>`)
          .join(`<cbc:RegistrationName>${clienteNuevo}</cbc:RegistrationName>`);
        contenidoNuevo = contenidoNuevo.slice(0, recvS) + bloqueR + contenidoNuevo.slice(recvE);
      }
    }
  }

  // NIT cliente + dígito de verificación (evita FAC025)
  const nitNuevo = nuevos.nit.trim();
  const digNuevo = nuevos.dig.trim();
  const { nit: nitOrig, dig: digOrig } = orig;
  if (nitNuevo && digNuevo && (nitNuevo !== nitOrig || digNuevo !== digOrig)) {
    const custStart = contenidoNuevo.indexOf("<cac:AccountingCustomerParty");
    const custEndTag = contenidoNuevo.indexOf("</cac:AccountingCustomerParty>", custStart);
    if (custStart !== -1 && custEndTag !== -1) {
      const custEnd = custEndTag + "</cac:AccountingCustomerParty>".length;
      let bloque = contenidoNuevo.slice(custStart, custEnd);
      if (digOrig) bloque = bloque.split(`schemeID="${digOrig}"`).join(`schemeID="${digNuevo}"`);
      if (nitOrig) bloque = bloque.split(`>${nitOrig}<`).join(`>${nitNuevo}<`);
      contenidoNuevo = contenidoNuevo.slice(0, custStart) + bloque + contenidoNuevo.slice(custEnd);
    }
    const firstCdata = contenidoNuevo.indexOf("<![CDATA[");
    const outerLimit = firstCdata !== -1 ? firstCdata : contenidoNuevo.length;
    const recvStart = contenidoNuevo.indexOf("<cac:ReceiverParty", 0);
    if (recvStart !== -1 && recvStart < outerLimit) {
      const recvEndTag = contenidoNuevo.indexOf("</cac:ReceiverParty>", recvStart);
      if (recvEndTag !== -1) {
        const recvEnd = recvEndTag + "</cac:ReceiverParty>".length;
        let bloqueRecv = contenidoNuevo.slice(recvStart, recvEnd);
        if (digOrig) bloqueRecv = bloqueRecv.split(`schemeID="${digOrig}"`).join(`schemeID="${digNuevo}"`);
        if (nitOrig) bloqueRecv = bloqueRecv.split(`>${nitOrig}<`).join(`>${nitNuevo}<`);
        contenidoNuevo = contenidoNuevo.slice(0, recvStart) + bloqueRecv + contenidoNuevo.slice(recvEnd);
      }
    }
  }

  return { xml: contenidoNuevo, avisos };
}
