import { describe, expect, it } from "vitest";
import { fmtValor, parseValor } from "./numeros.js";

describe("parseValor", () => {
  it("parses Colombian format (dot thousands, comma decimals)", () => {
    expect(parseValor("611.111,00")).toBe(611111);
    expect(parseValor("1.629.028")).toBe(1629028);
  });

  it("parses US format (comma thousands, dot decimals)", () => {
    expect(parseValor("611,111.00")).toBe(611111);
  });

  it("parses plain numbers", () => {
    expect(parseValor("611111")).toBe(611111);
    expect(parseValor("611111.00")).toBe(611111);
  });

  it("throws on empty input", () => {
    expect(() => parseValor("   ")).toThrow();
  });
});

describe("fmtValor", () => {
  it("drops trailing .0", () => {
    expect(fmtValor(1777777.0)).toBe("1777777");
  });

  it("keeps real decimals", () => {
    expect(fmtValor(1777777.5)).toBe("1777777.5");
  });
});
