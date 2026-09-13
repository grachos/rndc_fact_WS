import { parseValor } from "../../utils/numeros.js";

export type ExcelRow = Record<string, unknown>;

export const FILTROS_GEN = [
  "Todas (sin filtro)",
  "Solo Reconstruir = Sí",
  "Reconstruir = Sí y Novedad vacía",
  "Reconstruir Sí / condiciones ideales",
  "Coinciden remesas, NO coincide valor",
  "Coincide valor, NO coinciden remesas",
  "NO coinciden remesas",
  "NO coincide valor",
] as const;
export type FiltroGen = (typeof FILTROS_GEN)[number];

const FILTRO_COND_IDEAL: FiltroGen = "Reconstruir Sí / condiciones ideales";
const FILTROS_NOVEDAD = new Set<FiltroGen>(["Reconstruir = Sí y Novedad vacía", FILTRO_COND_IDEAL]);

export const CAMPOS = [
  ["col_nf", "Número de factura", true],
  ["col_cufe", "CUFE", true],
  ["col_fecha", "Fecha de generación", true],
  ["col_consec", "Consecutivo / Remesa", true],
  ["col_radicado", "Radicado (opcional)", false],
  ["col_val_rem", "Valor unitario remesa ($)", true],
  ["col_val_fac", "Valor total factura ($)", true],
  ["col_peso", "Peso KGM (opcional)", false],
  ["col_desc_lin", "Descripción línea (opcional)", false],
  ["col_nit_cli", "NIT cliente (opcional)", false],
  ["col_nom_cli", "Nombre cliente (opcional)", false],
  ["col_novedad", "Novedad remesa (opcional)", false],
  ["col_estado", "Estado (opcional)", false],
] as const satisfies readonly [string, string, boolean][];

export type CampoKey = (typeof CAMPOS)[number][0];
export type Mapping = Partial<Record<CampoKey, string>>;

const AUTO_HINTS: Partial<Record<CampoKey, string[]>> = {
  col_nf: ["numero_factura", "n_factura", "nro_factura"],
  col_cufe: ["cufe"],
  col_fecha: ["fecha_generacion", "fecha"],
  col_consec: ["consecutivo_remesa", "consecutivo"],
  // 'radicado' is deliberately not auto-mapped — in datos_rg it always comes empty and
  // the radicado is fetched from RNDC by consecutivo instead.
  col_val_rem: ["valor_unitario"],
  col_val_fac: ["valor_total_factura"],
  col_peso: ["peso", "peso_kgm"],
  col_desc_lin: ["descripcion"],
  col_nit_cli: ["nit"],
  col_nom_cli: ["nombre_cliente"],
  col_novedad: ["novedad_remesa", "novedad"],
  col_estado: ["estado"],
};

function normCol(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Detects each field's column by exact normalized-name match. Port of auto_mapear. */
export function autoMapear(columns: string[]): Mapping {
  const norm = new Map(columns.map((c) => [c, normCol(c)]));
  const usados = new Set<string>();
  const mapping: Mapping = {};
  for (const [clave, hints] of Object.entries(AUTO_HINTS) as [CampoKey, string[]][]) {
    for (const h of hints) {
      const hn = normCol(h);
      const elegido = columns.find((c) => norm.get(c) === hn && !usados.has(c));
      if (elegido) {
        mapping[clave] = elegido;
        usados.add(elegido);
        break;
      }
    }
  }
  return mapping;
}

function esSi(v: unknown): boolean {
  return ["sí", "si", "s", "true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());
}
function esVacio(v: unknown): boolean {
  return ["", "nan", "none", "undefined"].includes(String(v ?? "").trim().toLowerCase());
}

interface ColsCruce {
  rem: string;
  val: string;
  rec: string;
}

function colsCruce(columns: string[]): ColsCruce | null {
  let rem: string | null = null;
  let val: string | null = null;
  let rec: string | null = null;
  for (const col of columns) {
    const cn = col.toLowerCase();
    if (cn.includes("coinciden") && cn.includes("remesa")) rem = col;
    else if (cn.includes("coincide") && cn.includes("valor")) val = col;
    else if (cn.includes("reconstruir")) rec = col;
  }
  return rem && val && rec ? { rem, val, rec } : null;
}

function colNovedad(columns: string[]): string | null {
  return columns.find((c) => c.toLowerCase().includes("novedad")) ?? null;
}

function pasaFiltro(filtro: FiltroGen, rem: unknown, val: unknown, rec: unknown, novedad: unknown = ""): boolean {
  const r = esSi(rem);
  const v = esSi(val);
  const x = esSi(rec);
  switch (filtro) {
    case "Todas (sin filtro)":
      return true;
    case "Solo Reconstruir = Sí":
      return x;
    case "Reconstruir = Sí y Novedad vacía":
      return x && esVacio(novedad);
    case FILTRO_COND_IDEAL:
      return x && esVacio(novedad);
    case "Coinciden remesas, NO coincide valor":
      return r && !v;
    case "Coincide valor, NO coinciden remesas":
      return v && !r;
    case "NO coinciden remesas":
      return !r;
    case "NO coincide valor":
      return !v;
    default:
      return true;
  }
}

export function validar(
  rows: ExcelRow[],
  mapping: Mapping,
  filtro: FiltroGen
): { ok: boolean; mensaje: string } {
  if (!rows || rows.length === 0) return { ok: false, mensaje: "Carga primero un archivo Excel." };
  const columns = Object.keys(rows[0]!);
  for (const [clave, etiqueta, requerido] of CAMPOS) {
    if (requerido && !mapping[clave]) {
      return { ok: false, mensaje: `El campo obligatorio '${etiqueta}' no tiene columna asignada.` };
    }
  }
  if (filtro !== "Todas (sin filtro)" && !colsCruce(columns)) {
    return {
      ok: false,
      mensaje:
        "El filtro seleccionado necesita las columnas de validación del cruce (¿Coinciden remesas?, ¿Coincide valor factura con RG?, Reconstruir).",
    };
  }
  if (FILTROS_NOVEDAD.has(filtro) && !(mapping.col_novedad || colNovedad(columns))) {
    return { ok: false, mensaje: "Este filtro necesita la columna 'Novedad remesa' (mapéala)." };
  }
  return { ok: true, mensaje: "" };
}

function limpiarConsecutivo(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  let s = String(v).trim();
  if (s.endsWith(".0") && /^\d+$/.test(s.slice(0, -2))) s = s.slice(0, -2);
  return s;
}

function parseFecha(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? "").trim();
  for (const re of [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{4})\/(\d{2})\/(\d{2})$/,
  ]) {
    const m = re.exec(s);
    if (m) {
      if (re.source.startsWith("^(\\d{4})-") || re.source.startsWith("^(\\d{4})\\/")) {
        return `${m[1]}-${m[2]}-${m[3]}`;
      }
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return s;
}

export interface FacturaBatchItem {
  numeroFactura: string;
  cufe: string;
  fecha: string;
  nitCliente: string;
  digitoCliente: string;
  nombreCliente: string;
  valorTotal: number;
  remesas: {
    consecutivo: string;
    radicado: string;
    peso: string;
    valor: number;
    descripcionLinea: string;
  }[];
}

/**
 * Groups spreadsheet rows into one invoice batch item per numero_factura. Port of
 * lib_excel.py's parsear — filter/cruce logic preserved, the per-row "perfil" column
 * split from the old app is dropped (profiles are chosen once for the whole batch now).
 */
export function parsearFacturas(
  rowsIn: ExcelRow[],
  mapping: Mapping,
  filtro: FiltroGen,
  nitCliFijo = "",
  digCliFijo = "",
  nomCliFijo = ""
): FacturaBatchItem[] {
  let rows = [...rowsIn];
  const columns = Object.keys(rowsIn[0] ?? {});

  if (filtro !== "Todas (sin filtro)") {
    const cc = colsCruce(columns);
    if (cc) {
      const novCol = mapping.col_novedad || colNovedad(columns);
      if (FILTROS_NOVEDAD.has(filtro) && mapping.col_nf) {
        const nfCol = mapping.col_nf;
        const facturasOk = new Set<string>();
        const porFactura = new Map<string, ExcelRow[]>();
        for (const row of rows) {
          const nf = String(row[nfCol] ?? "");
          if (!porFactura.has(nf)) porFactura.set(nf, []);
          porFactura.get(nf)!.push(row);
        }
        for (const [nf, grupo] of porFactura) {
          const todasPasan = grupo.every((row) =>
            pasaFiltro(filtro, row[cc.rem], row[cc.val], row[cc.rec], novCol ? row[novCol] : "")
          );
          if (todasPasan) facturasOk.add(nf);
        }
        rows = rows.filter((row) => facturasOk.has(String(row[nfCol] ?? "")));
      } else {
        rows = rows.filter((row) =>
          pasaFiltro(filtro, row[cc.rem], row[cc.val], row[cc.rec], novCol ? row[novCol] : "")
        );
      }
    }
  }

  // Skip invoices already generated (Estado column not empty for any of their rows).
  const estCol = mapping.col_estado;
  if (estCol && mapping.col_nf) {
    const nfCol = mapping.col_nf;
    const porFactura = new Map<string, ExcelRow[]>();
    for (const row of rows) {
      const nf = String(row[nfCol] ?? "");
      if (!porFactura.has(nf)) porFactura.set(nf, []);
      porFactura.get(nf)!.push(row);
    }
    const keep = new Set<string>();
    for (const [nf, grupo] of porFactura) {
      if (grupo.every((row) => esVacio(row[estCol]))) keep.add(nf);
    }
    rows = rows.filter((row) => keep.has(String(row[nfCol] ?? "")));
  }

  const cNf = mapping.col_nf!;
  const cCufe = mapping.col_cufe!;
  const cFecha = mapping.col_fecha!;
  const cConsec = mapping.col_consec!;
  const cRadicado = mapping.col_radicado;
  const cValRem = mapping.col_val_rem!;
  const cValFac = mapping.col_val_fac!;
  const cPeso = mapping.col_peso;
  const cDescLin = mapping.col_desc_lin;
  const cNitCli = mapping.col_nit_cli;
  const cNomCli = mapping.col_nom_cli;

  const porFactura = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const nf = String(row[cNf] ?? "");
    if (!porFactura.has(nf)) porFactura.set(nf, []);
    porFactura.get(nf)!.push(row);
  }

  const resultado: FacturaBatchItem[] = [];
  for (const [nf, grupo] of porFactura) {
    const primera = grupo[0]!;
    const cufe = String(primera[cCufe] ?? "").trim();
    const fecha = parseFecha(primera[cFecha]);
    let valFac = 0;
    try {
      valFac = parseValor(String(primera[cValFac] ?? ""));
    } catch {
      valFac = 0;
    }

    const remesas = grupo.map((fila) => {
      const consecutivo = limpiarConsecutivo(fila[cConsec]);
      const radicado = cRadicado ? String(fila[cRadicado] ?? "").trim() : "";
      let valor = 0;
      try {
        valor = parseValor(String(fila[cValRem] ?? ""));
      } catch {
        valor = 0;
      }
      const peso = cPeso ? String(fila[cPeso] ?? "").trim() || "1" : "1";
      let descLin = cDescLin ? String(fila[cDescLin] ?? "").trim() : "";
      if (!descLin || ["nan", "none"].includes(descLin.toLowerCase())) descLin = "Servicio de transporte";
      return { consecutivo, radicado, peso, valor, descripcionLinea: descLin };
    });

    let nitCli = nitCliFijo;
    let digCli = digCliFijo;
    let nomCli = nomCliFijo;
    if (cNitCli) {
      let snit = limpiarConsecutivo(primera[cNitCli]);
      const solo = snit.replace(/\D/g, "");
      if (solo.length >= 2) {
        nitCli = solo.slice(0, -1);
        digCli = solo.slice(-1);
      }
    }
    if (cNomCli) {
      const v = String(primera[cNomCli] ?? "").trim();
      if (v && !["nan", "none"].includes(v.toLowerCase())) nomCli = v;
    }

    resultado.push({
      numeroFactura: nf,
      cufe,
      fecha,
      nitCliente: nitCli,
      digitoCliente: digCli,
      nombreCliente: nomCli,
      valorTotal: valFac,
      remesas,
    });
  }

  return resultado;
}
