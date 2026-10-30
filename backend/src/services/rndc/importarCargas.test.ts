import { describe, expect, it } from "vitest";
import { cargaDesdeRndc, normalizarFechaRndc } from "./importarCargas.js";

describe("normalizarFechaRndc", () => {
  it.each([
    ["2026-10-29 14:05:33", "2026-10-29 14:05:33"],
    ["2026/10/29 14:05", "2026-10-29 14:05:00"],
    ["29/10/2026 02:05:33 PM", "2026-10-29 14:05:33"],
    ["29/10/2026 12:10:00 a. m.", "2026-10-29 00:10:00"],
    ["2026-10-29T08:00:00.000", "2026-10-29 08:00:00"],
    ["2026-10-29", "2026-10-29 12:00:00"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarFechaRndc(entrada)).toBe(esperado);
  });

  it("returns null for unreadable values", () => {
    expect(normalizarFechaRndc("")).toBeNull();
    expect(normalizarFechaRndc("ayer")).toBeNull();
    expect(normalizarFechaRndc("2026-13-40")).toBeNull();
  });
});

describe("cargaDesdeRndc", () => {
  it("maps an RNDC invoice (any key casing) to a report row", () => {
    const c = cargaDesdeRndc({
      NumeroFactura: "FE01349810",
      ingresoid: "123456789",
      ESTADO: "CE",
      fechacrea: "2026/10/29 14:05:33",
      remesas: "2",
    });
    expect(c).toEqual({
      numeroFactura: "FE01349810",
      fecha: "2026-10-29 14:05:33",
      exito: true,
      mensaje: "Radicado RNDC: 123456789 · Estado: Cumplida electrónicamente · Importada del RNDC (no se registró qué usuario la envió)",
      remesas: 2,
    });
  });

  it("falls back to the invoice date, treats '.' as empty and ignores rows without a number", () => {
    const c = cargaDesdeRndc({ numerofactura: "X1", ingresoid: ".", fechacrea: ".", fechafactura: "2026-10-28", remesas: "?" });
    expect(c).toMatchObject({ fecha: "2026-10-28 12:00:00", exito: false, remesas: 0 });
    expect(c!.mensaje).toContain("Sin radicado");
    expect(cargaDesdeRndc({ ingresoid: "1" })).toBeNull();
  });
});
