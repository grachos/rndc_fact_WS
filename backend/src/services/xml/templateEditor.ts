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

function tieneProp(linea: string, name: string): boolean {
  return new RegExp(`<cac:AdditionalItemProperty>\\s*<cbc:Name>\\s*${escapeRegex(name)}\\s*</cbc:Name>`).test(linea);
}

/** A remesa line is one carrying the RNDC properties 01 (radicado), 02 (consecutivo)
 * and 03 (valor + peso). Templates can also contain other lines (extra charges,
 * "ADICIONALES", IVA-bearing items) that must never be used as the model. */
export function esLineaRemesa(linea: string): boolean {
  return tieneProp(linea, "01") && tieneProp(linea, "02") && tieneProp(linea, "03");
}

export class PlantillaSinLineaRemesaError extends Error {
  constructor() {
    super(
      "La plantilla XML de esta empresa no tiene ninguna línea de remesa válida (con radicado, consecutivo y valor en las propiedades 01, 02 y 03). Sube como plantilla una factura real que incluya al menos una remesa."
    );
  }
}

function num(texto: string | undefined): number {
  const n = Number((texto ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/** Formats `n` with the same number of decimals the template used for that field,
 * so each empresa keeps its own format ("3648001.0160" vs "8679000.00" vs "8679000"). */
function fmtComo(textoPlantilla: string | undefined, n: number): string {
  const decimales = /\.(\d+)\s*$/.exec(textoPlantilla ?? "")?.[1]?.length ?? 0;
  return n.toFixed(decimales);
}

function leer(linea: string, re: RegExp): string | undefined {
  return re.exec(linea)?.[1];
}

function setTag(linea: string, tag: string, valor: string): string {
  return linea.replace(new RegExp(`(<cbc:${tag}[^>]*>)[^<]*(</cbc:${tag}>)`), `$1${valor}$2`);
}

/** Sets the cbc:ID inside an Item identification block, also when the template has it empty (`<cbc:ID />`). */
function setItemId(linea: string, bloque: string, valor: string): string {
  const re = new RegExp(`(<cac:${bloque}>\\s*<cbc:ID)([^>]*?)(?:\\s*/>|>[^<]*</cbc:ID>)`);
  return linea.replace(re, (_m, inicio: string, attrs: string) => `${inicio}${attrs}>${valor}</cbc:ID>`);
}

/**
 * Builds one remesa InvoiceLine from a template remesa line, overwriting every
 * remesa-specific field so nothing from the template's own remesa survives. Quantity
 * and price follow the template's convention: some empresas bill per kilogram
 * (InvoicedQuantity = peso, PriceAmount = valor / peso), others per trip (quantity 1).
 */
function construirLineaRemesa(base: string, r: RemesaEdicion, pos: number): string {
  const valor = parseValor(r.valor);
  const peso = num(r.peso);

  const qtyTexto = leer(base, /<cbc:InvoicedQuantity[^>]*>([^<]*)</);
  const pesoTexto = leer(base, /<cbc:ValueQuantity[^>]*>([^<]*)</);
  const baseTexto = leer(base, /<cbc:BaseQuantity[^>]*>([^<]*)</);
  const factPorPeso = num(qtyTexto) > 0 && num(qtyTexto) === num(pesoTexto);
  const cantidad = factPorPeso ? peso : num(qtyTexto);
  const baseIgualCantidad = num(baseTexto) === num(qtyTexto);

  let linea = base.replace(/<cbc:ID[^>]*>[^<]*<\/cbc:ID>/, `<cbc:ID schemeID="1">${pos + 1}</cbc:ID>`);
  linea = setTag(linea, "Note", r.descripcion);
  linea = setTag(linea, "InvoicedQuantity", fmtComo(qtyTexto, cantidad));
  linea = setTag(linea, "LineExtensionAmount", fmtComo(leer(base, /<cbc:LineExtensionAmount[^>]*>([^<]*)</), valor));
  if (baseIgualCantidad) linea = setTag(linea, "BaseQuantity", fmtComo(baseTexto, cantidad));
  linea = setTag(linea, "PriceAmount", fmtComo(leer(base, /<cbc:PriceAmount[^>]*>([^<]*)</), cantidad > 0 ? valor / cantidad : valor));

  // Line-level tax (e.g. Sotracar's IVA 0%): keep the template's rate, recompute on the new value.
  linea = linea.replace(/<cac:TaxTotal\b[^>]*>[\s\S]*?<\/cac:TaxTotal>/, (bloque) => {
    const pct = num(leer(bloque, /<cbc:Percent>([^<]*)</));
    const impuesto = Number.isFinite(pct) ? (valor * pct) / 100 : 0;
    return bloque
      .replace(/(<cbc:TaxableAmount[^>]*>)([^<]*)(<\/cbc:TaxableAmount>)/g, (_m, a, v, c) => `${a}${fmtComo(v, valor)}${c}`)
      .replace(/(<cbc:TaxAmount[^>]*>)([^<]*)(<\/cbc:TaxAmount>)/g, (_m, a, v, c) => `${a}${fmtComo(v, impuesto)}${c}`);
  });

  const valorPlantilla = num(leer(base, /<cbc:LineExtensionAmount[^>]*>([^<]*)</)) || num(leer(base, /<cbc:Name>\s*03\s*<\/cbc:Name>\s*<cbc:Value>([^<]*)</));
  linea = recalcularRetenciones(linea, valor, valorPlantilla);

  linea = setDescripcion(linea, r.descripcion);
  // Same placement as the original FE-Tool generator: radicado → Sellers, consecutivo → Standard (schemeID 999).
  linea = setItemId(linea, "SellersItemIdentification", r.radicado);
  linea = setItemId(linea, "StandardItemIdentification", r.consecutivo);
  linea = setProp(linea, "01", r.radicado);
  linea = setProp(linea, "02", r.consecutivo);
  linea = setProp03(linea, fmtComo(leer(base, /<cbc:Name>\s*03\s*<\/cbc:Name>\s*<cbc:Value>([^<]*)</), valor), r.peso);
  return linea;
}

interface Impuesto {
  esquema: string;
  porcentaje: number;
  base: number;
  valor: number;
}

function bloques(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<cac:${tag}\\b[^>]*>[\\s\\S]*?</cac:${tag}>`, "g")) ?? [];
}

function subtotales(bloque: string): Impuesto[] {
  return bloques(bloque, "TaxSubtotal").map((st) => ({
    esquema: leer(st, /<cac:TaxScheme>\s*<cbc:ID>([^<]*)</)?.trim() ?? "",
    porcentaje: num(leer(st, /<cbc:Percent>([^<]*)</)),
    base: num(leer(st, /<cbc:TaxableAmount[^>]*>([^<]*)</)),
    valor: num(leer(st, /<cbc:TaxAmount[^>]*>([^<]*)</)),
  }));
}

/** Rewrites a tax/withholding block so each TaxSubtotal gets `nuevo(subtotal)`
 * (or is dropped when it returns null), and the block total is their sum.
 * Returns "" when no subtotal is left. */
function reescribirImpuesto(bloque: string, nuevo: (st: Impuesto) => { base: number; valor: number } | null): string {
  let total = 0;
  let quedan = 0;
  let out = bloque.replace(/<cac:TaxSubtotal\b[^>]*>[\s\S]*?<\/cac:TaxSubtotal>/g, (st) => {
    const [actual] = subtotales(st);
    const r = actual ? nuevo(actual) : null;
    if (!r) return "";
    quedan++;
    total += r.valor;
    return st
      .replace(/(<cbc:TaxableAmount[^>]*>)([^<]*)(<\/cbc:TaxableAmount>)/, (_m, a, v, c) => `${a}${fmtComo(v, r.base)}${c}`)
      .replace(/(<cbc:TaxAmount[^>]*>)([^<]*)(<\/cbc:TaxAmount>)/, (_m, a, v, c) => `${a}${fmtComo(v, r.valor)}${c}`);
  });
  if (quedan === 0) return "";
  // The block's own TaxAmount is the first one before any TaxSubtotal.
  out = out.replace(/^([\s\S]*?)(<cbc:TaxAmount[^>]*>)([^<]*)(<\/cbc:TaxAmount>)/, (_m, pre, a, v, c) => `${pre}${a}${fmtComo(v, total)}${c}`);
  return out;
}

/** Template rate of a withholding subtotal: its Percent, or else amount / base. */
function tasaRetencion(st: Impuesto, basePlantilla: number): number {
  if (st.porcentaje > 0) return st.porcentaje / 100;
  const base = st.base > 0 ? st.base : basePlantilla;
  return base > 0 && st.valor >= 0 ? st.valor / base : 0;
}

/** Withholdings (e.g. retención en la fuente) keep the template's own rate, applied to `base`. */
function recalcularRetenciones(xml: string, base: number, basePlantilla: number): string {
  return xml.replace(/<cac:WithholdingTaxTotal\b[^>]*>[\s\S]*?<\/cac:WithholdingTaxTotal>/g, (bloque) => {
    if (!/<cac:TaxSubtotal\b/.test(bloque)) {
      // No breakdown: derive the rate from the block's own amount.
      const valor = num(leer(bloque, /<cbc:TaxAmount[^>]*>([^<]*)</));
      const tasa = basePlantilla > 0 ? valor / basePlantilla : 0;
      return bloque.replace(/(<cbc:TaxAmount[^>]*>)([^<]*)(<\/cbc:TaxAmount>)/, (_m, a, v, c) => `${a}${fmtComo(v, base * tasa)}${c}`);
    }
    return reescribirImpuesto(bloque, (st) => ({ base, valor: base * tasaRetencion(st, basePlantilla) }));
  });
}

/**
 * Makes the invoice-level totals consistent with the generated remesa lines:
 * - LegalMonetaryTotal from the lines (subtotal, taxable base, taxes; no allowances/charges/prepaid).
 * - Invoice-level TaxTotal (IVA…) = sum of the same tax on the lines; dropped when no line has it
 *   (e.g. the IVA of an extra charge that only existed in the template).
 * - Invoice-level withholdings at the template's own rate over the new subtotal.
 */
function recalcularTotales(inv: string, invPlantilla: string, lineas: string[]): string {
  const valorLinea = (l: string) =>
    num(leer(l, /<cbc:LineExtensionAmount[^>]*>([^<]*)</)) ||
    num(leer(l, /<cbc:Name>\s*03\s*<\/cbc:Name>\s*<cbc:Value>([^<]*)</)) ||
    0;
  const subtotal = lineas.reduce((s, l) => s + valorLinea(l), 0);
  const impuestosLineas = new Map<string, { base: number; valor: number }>();
  for (const l of lineas) {
    for (const bloque of bloques(l, "TaxTotal")) {
      for (const st of subtotales(bloque)) {
        const k = `${st.esquema}|${st.porcentaje}`;
        const acc = impuestosLineas.get(k) ?? { base: 0, valor: 0 };
        acc.base += st.base || 0;
        acc.valor += st.valor || 0;
        impuestosLineas.set(k, acc);
      }
    }
  }
  const baseGravable = [...impuestosLineas.values()].reduce((s, i) => s + i.base, 0);
  const totalImpuestos = [...impuestosLineas.values()].reduce((s, i) => s + i.valor, 0);
  const subtotalPlantilla = num(leer(invPlantilla, /<cac:LegalMonetaryTotal\b[^>]*>[\s\S]*?<cbc:LineExtensionAmount[^>]*>([^<]*)</));

  return fueraDeLineas(inv, (xml) => {
    xml = xml.replace(/<cac:TaxTotal\b[^>]*>[\s\S]*?<\/cac:TaxTotal>\s*/g, (bloque) => {
      const nuevo = reescribirImpuesto(bloque, (st) => impuestosLineas.get(`${st.esquema}|${st.porcentaje}`) ?? null);
      return nuevo ? nuevo + bloque.slice(bloque.trimEnd().length) : "";
    });
    xml = recalcularRetenciones(xml, subtotal, subtotalPlantilla);
    return xml.replace(/<cac:LegalMonetaryTotal\b[^>]*>[\s\S]*?<\/cac:LegalMonetaryTotal>/, (lmt) => {
      const valores: Record<string, number> = {
        LineExtensionAmount: subtotal,
        TaxExclusiveAmount: baseGravable,
        TaxInclusiveAmount: subtotal + totalImpuestos,
        AllowanceTotalAmount: 0,
        ChargeTotalAmount: 0,
        PrepaidAmount: 0,
        PayableAmount: subtotal + totalImpuestos,
      };
      for (const [tag, n] of Object.entries(valores)) {
        lmt = lmt.replace(new RegExp(`(<cbc:${tag}[^>]*>)([^<]*)(</cbc:${tag}>)`), (_m, a, v, c) => `${a}${fmtComo(v, n)}${c}`);
      }
      return lmt;
    });
  });
}

/** Applies `fn` to everything except the InvoiceLine blocks, which are left untouched. */
function fueraDeLineas(xml: string, fn: (fragmento: string) => string): string {
  return xml
    .split(/(<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>)/)
    .map((parte) => (parte.startsWith("<cac:InvoiceLine") ? parte : fn(parte)))
    .join("");
}

export interface RemesaEdicion {
  radicado: string;
  consecutivo: string;
  valor: string;
  peso: string;
  descripcion: string;
  /** true for a line that doesn't exist in the template yet — built from the template's first remesa line. */
  nuevo: boolean;
}

export interface NuevosValores {
  numero: string;
  cufe: string;
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
  const plantillaLine = lineasOrig.find(esLineaRemesa);
  if (remesas.some((r) => r.nuevo) && !plantillaLine) throw new PlantillaSinLineaRemesaError();

  const lineasResultado: string[] = [];
  remesas.forEach((r, pos) => {
    const base = r.nuevo ? plantillaLine : lineasOrig[pos];
    if (base) lineasResultado.push(construirLineaRemesa(base, r, pos));
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
  if (lineasResultado.length > 0) invNuevo = recalcularTotales(invNuevo, inv, lineasResultado);

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
