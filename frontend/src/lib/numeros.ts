/** Same heuristic as the backend's parseValor — Colombian (611.111,00) and US (611,111.00) formats. */
export function parseMonto(texto: string): number {
  const s = texto.trim().replace(/\s+/g, "");
  if (!s) return 0;
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
  return Number.isNaN(value) ? 0 : value;
}
