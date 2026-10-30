/**
 * Pre-download / pre-upload checks on an invoice XML's remesa lines, so a broken
 * invoice is blocked with a clear message instead of reaching the operator or the RNDC.
 */

export interface RemesaEsperada {
  consecutivo: string;
  radicado: string;
  valor: number;
}

export interface OpcionesValidacion {
  /** Generated invoices: every line must be a remesa line, and lines must match these remesas/total. */
  esperado?: { remesas: RemesaEsperada[]; valorTotal: number };
  /** Uploaded invoices (real ones may carry non-remesa lines like "ADICIONALES"): only remesa
   * lines are checked, but at least one must exist. */
  permitirLineasSinRemesa?: boolean;
}

function prop(linea: string, name: string): string | undefined {
  return new RegExp(
    `<cac:AdditionalItemProperty>\\s*<cbc:Name>\\s*${name}\\s*</cbc:Name>\\s*<cbc:Value>([^<]*)</cbc:Value>`
  ).exec(linea)?.[1]?.trim();
}

function tieneAlgunaProp(linea: string): boolean {
  return /<cac:AdditionalItemProperty>\s*<cbc:Name>\s*0[123]\s*<\/cbc:Name>/.test(linea);
}

function numero(texto: string | undefined): number {
  const n = Number((texto ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export function validarFactura(xml: string, opciones: OpcionesValidacion = {}): string[] {
  const errores: string[] = [];
  const inv = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(xml)?.[1] ?? xml;
  const lineas = inv.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) ?? [];

  const conteo = /<cbc:LineCountNumeric>\s*(\d+)\s*</.exec(inv)?.[1];
  if (conteo !== undefined && Number(conteo) !== lineas.length) {
    errores.push(`El XML declara ${conteo} líneas (LineCountNumeric) pero tiene ${lineas.length}.`);
  }

  const lineasRemesa: { n: number; linea: string }[] = [];
  lineas.forEach((linea, i) => {
    const n = i + 1;
    if (!tieneAlgunaProp(linea)) {
      if (!opciones.permitirLineasSinRemesa) {
        errores.push(`Línea ${n}: no es una línea de remesa (le faltan radicado, consecutivo y valor).`);
      }
      return;
    }
    lineasRemesa.push({ n, linea });
  });

  if (lineasRemesa.length === 0) {
    errores.push("La factura no tiene ninguna línea de remesa.");
    return errores;
  }

  let suma = 0;
  for (const { n, linea } of lineasRemesa) {
    const consecutivo = prop(linea, "02");
    const etiqueta = `Línea ${n}${consecutivo ? ` (remesa ${consecutivo})` : ""}`;
    const scheme = /<cbc:ID\s+schemeID="([^"]*)"/.exec(linea)?.[1];
    if (scheme !== "1") errores.push(`${etiqueta}: el ID de la línea debe tener schemeID="1" (tiene "${scheme ?? "ninguno"}").`);

    const radicado = prop(linea, "01");
    if (!radicado) errores.push(`${etiqueta}: falta el radicado.`);
    else if (!/^\d+$/.test(radicado) || /^0+$/.test(radicado)) {
      errores.push(`${etiqueta}: radicado inválido ("${radicado}"). Consulta el radicado en el RNDC antes de generar.`);
    }

    if (!consecutivo) errores.push(`${etiqueta}: falta el consecutivo de la remesa.`);

    const valor = numero(prop(linea, "03"));
    if (!(valor > 0)) errores.push(`${etiqueta}: falta el valor de la remesa o no es mayor que 0.`);
    else suma += valor;

    const peso = numero(/<cbc:Name>\s*03\s*<\/cbc:Name>[\s\S]*?<cbc:ValueQuantity[^>]*>([^<]*)</.exec(linea)?.[1]);
    if (!(peso > 0)) errores.push(`${etiqueta}: falta el peso de la remesa o no es mayor que 0.`);

    const ivaPct = numero(/<cac:TaxTotal\b[^>]*>[\s\S]*?<cbc:Percent>([^<]*)</.exec(linea)?.[1]);
    if (ivaPct > 0) errores.push(`${etiqueta}: tiene IVA del ${ivaPct}%; el flete de una remesa no lleva IVA.`);
  }

  const esperado = opciones.esperado;
  if (esperado) {
    if (lineasRemesa.length !== esperado.remesas.length) {
      errores.push(`El XML tiene ${lineasRemesa.length} líneas de remesa pero el formulario tiene ${esperado.remesas.length}.`);
    }
    esperado.remesas.forEach((r, i) => {
      const l = lineasRemesa[i]?.linea;
      if (!l) return;
      if (prop(l, "02") !== r.consecutivo.trim() || prop(l, "01") !== r.radicado.trim()) {
        errores.push(`Línea ${i + 1}: no coincide con la remesa ${r.consecutivo} del formulario.`);
      }
    });
    if (Math.abs(suma - esperado.valorTotal) > 1) {
      errores.push(
        `La suma de las remesas ($${suma.toLocaleString("es-CO")}) no coincide con el valor total de la factura ($${esperado.valorTotal.toLocaleString("es-CO")}).`
      );
    }
  }

  return errores;
}

export class FacturaInvalidaError extends Error {
  constructor(public readonly errores: string[]) {
    super(`La factura no se generó porque tiene errores:\n• ${errores.join("\n• ")}`);
  }
}
