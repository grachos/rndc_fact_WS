/**
 * Parses a free-format numeric string into a number. Supports:
 * 611.111,00 / 1.629.028 / 611,111.00 / 611111 / 611111.00
 * Port of core/xml_generator.py's _parse_valor — same heuristics, same edge cases.
 */
export function parseValor(texto: string): number {
  const s = texto.trim().replace(/\s+/g, "");
  if (!s) throw new Error("Valor vacío");

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;

  if (lastComma > lastDot) {
    normalized = s.replaceAll(".", "").replaceAll(",", ".");
  } else if (lastComma === -1 && (s.match(/\./g)?.length ?? 0) > 1) {
    normalized = s.replaceAll(".", "");
  } else if (lastDot !== -1 && lastComma === -1 && s.length - 1 - lastDot === 3) {
    normalized = s.replaceAll(".", "");
  } else {
    normalized = s.replaceAll(",", "");
  }

  const value = Number(normalized);
  if (Number.isNaN(value)) throw new Error(`Valor numérico inválido: ${texto}`);
  return value;
}

/**
 * Formats a monetary value: integer if it has no cents, decimal otherwise.
 * 1777777.0 -> "1777777"   /   1777777.5 -> "1777777.5"
 * Port of core/xml_generator.py's _fmt_valor — used everywhere a monetary amount
 * is embedded in XML, to avoid thousand separators.
 */
export function fmtValor(v: number): string {
  return String(v);
}
