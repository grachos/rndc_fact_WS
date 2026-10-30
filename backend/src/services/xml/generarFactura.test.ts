import { beforeAll, describe, expect, it } from "vitest";
import type { GenerarXmlInput } from "@fe-tool/shared";
import { PlantillaSinLineaRemesaError } from "./templateEditor.js";
import { FacturaInvalidaError, validarFactura } from "./validarFactura.js";

// generarFactura.ts imports the DB layer, which validates env vars at import time.
let generarFacturaConTemplate: typeof import("./generarFactura.js").generarFacturaConTemplate;
beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgres://test";
  process.env.JWT_SECRET ??= "test-secret-test-secret";
  process.env.CREDENTIALS_ENC_KEY ??= "0".repeat(64);
  ({ generarFacturaConTemplate } = await import("./generarFactura.js"));
});

const props = (radicado: string, consecutivo: string, valor: string, peso: string) => `
<cac:AdditionalItemProperty><cbc:Name>01</cbc:Name><cbc:Value>${radicado}</cbc:Value></cac:AdditionalItemProperty>
<cac:AdditionalItemProperty><cbc:Name>02</cbc:Name><cbc:Value>${consecutivo}</cbc:Value></cac:AdditionalItemProperty>
<cac:AdditionalItemProperty><cbc:Name>03</cbc:Name><cbc:Value>${valor}</cbc:Value><cbc:ValueQuantity unitCode="KGM">${peso}</cbc:ValueQuantity></cac:AdditionalItemProperty>`;

function plantilla(lineas: string): string {
  return `<AttachedDocument><cbc:ParentDocumentID>FE01470623</cbc:ParentDocumentID>
<cbc:Description><![CDATA[<Invoice><cbc:ID>FE01470623</cbc:ID><cbc:UUID schemeID="1">CUFEPLANTILLA</cbc:UUID>
<cbc:IssueDate>2026-10-13</cbc:IssueDate><cbc:LineCountNumeric>2</cbc:LineCountNumeric>
<cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:RegistrationName>CLIENTE PLANTILLA</cbc:RegistrationName>
<cbc:CompanyID schemeID="1">800000000</cbc:CompanyID></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty>
<cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="COP">4686000.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lineas}</Invoice>]]></cbc:Description></AttachedDocument>`;
}

// Coltanques: the FIRST line is an extra IVA-bearing charge with no remesa data; the remesa line comes second.
const COLTANQUES = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="0">2</cbc:ID><cbc:Note>111650</cbc:Note>
<cbc:InvoicedQuantity unitCode="ZZ">1.000000</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">200000.00</cbc:LineExtensionAmount>
<cac:TaxTotal><cbc:TaxAmount currencyID="COP">38000.000000</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="COP">200000.000000</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="COP">38000.000000</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:Item><cbc:Description>CARGO EXTRA</cbc:Description><cac:SellersItemIdentification><cbc:ID>2229</cbc:ID></cac:SellersItemIdentification></cac:Item>
<cac:Price><cbc:PriceAmount currencyID="COP">200000.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="ZZ">1.00</cbc:BaseQuantity></cac:Price></cac:InvoiceLine>
<cac:InvoiceLine><cbc:ID schemeID="1">1</cbc:ID><cbc:Note>270766</cbc:Note>
<cbc:InvoicedQuantity unitCode="ZZ">1.000000</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">4486000.00</cbc:LineExtensionAmount>
<cac:Item><cbc:Description>BL PLANTILLA</cbc:Description><cac:SellersItemIdentification><cbc:ID>1947</cbc:ID></cac:SellersItemIdentification>
<cac:StandardItemIdentification><cbc:ID schemeID="999" schemeName="">1947</cbc:ID></cac:StandardItemIdentification>
${props("168414785", "colT007270766", "4486000.00", "19222")}</cac:Item>
<cac:Price><cbc:PriceAmount currencyID="COP">4486000.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="ZZ">1.00</cbc:BaseQuantity></cac:Price></cac:InvoiceLine>`);

// TRANSAGRO: billed per kilogram (quantity = peso, price = valor / peso).
const TRANSAGRO = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="1">1</cbc:ID>
<cbc:InvoicedQuantity unitCode="KGM">3124.0000</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">3648001.0160</cbc:LineExtensionAmount>
<cac:Item><cbc:Description>SERVICIO DE TRANSPORTE REFRIGERADO</cbc:Description><cac:StandardItemIdentification><cbc:ID /></cac:StandardItemIdentification>
${props("167555016", "0110740-01", "3648001.0160", "3124")}</cac:Item>
<cac:Price><cbc:PriceAmount currencyID="COP">1167.7340</cbc:PriceAmount><cbc:BaseQuantity unitCode="KGM">3124.0000</cbc:BaseQuantity></cac:Price></cac:InvoiceLine>`);

// Sotracar: billed per trip (quantity 1), with an IVA 0% block on each line.
const SOTRACAR = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="1">1</cbc:ID>
<cbc:InvoicedQuantity unitCode="94">1.00</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">8679000.00</cbc:LineExtensionAmount>
<cac:TaxTotal><cbc:TaxAmount currencyID="COP">0</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="COP">8679000.00</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="COP">0</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>0</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:Item><cbc:Description>RUTA CARTAGENA - BOGOTA</cbc:Description><cac:SellersItemIdentification><cbc:ID>9004-4040-02.</cbc:ID></cac:SellersItemIdentification>
${props("146583759", "11506", "8679000", "23933")}</cac:Item>
<cac:Price><cbc:PriceAmount currencyID="COP">8679000.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="94">1.00</cbc:BaseQuantity></cac:Price></cac:InvoiceLine>`);

function datos(remesas: GenerarXmlInput["remesas"], valorTotal: number): GenerarXmlInput {
  return {
    perfilId: 1,
    numeroFactura: "FE01349810",
    cufe: "CUFENUEVO",
    fecha: "2026-10-29",
    nitCliente: "900423749",
    digitoCliente: "1",
    nombreCliente: "COMERCIALIZADORA HELA SAS",
    valorTotal,
    remesas,
  };
}

const REMESAS_OK = [
  { consecutivo: "cof1007222929", radicado: "126446990", peso: "18722", valor: 266200, descripcionLinea: "Servicio de transporte" },
  { consecutivo: "cof1007222", radicado: "126446991", peso: "1", valor: 200000, descripcionLinea: "Servicio de transporte" },
];

function lineas(xml: string): string[] {
  const inv = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(xml)![1]!;
  return inv.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) ?? [];
}

describe("generarFacturaConTemplate — bug FE01349810 (Coltanques)", () => {
  it("builds every line from the template's remesa line, not its first line", () => {
    const { xml } = generarFacturaConTemplate(COLTANQUES, datos(REMESAS_OK, 466200));
    const ls = lineas(xml);
    expect(ls).toHaveLength(2);
    for (const l of ls) {
      expect(l).toContain('schemeID="1"');
      expect(l).not.toContain("111650");
      expect(l).not.toContain("<cbc:Percent>19");
      expect(l).toContain("<cbc:Note>Servicio de transporte</cbc:Note>");
    }
    expect(ls[0]).toContain("<cbc:Value>126446990</cbc:Value>");
    expect(ls[0]).toContain("<cbc:Value>cof1007222929</cbc:Value>");
    expect(ls[0]).toContain('<cbc:ValueQuantity unitCode="KGM">18722</cbc:ValueQuantity>');
    expect(ls[0]).toContain("<cbc:LineExtensionAmount currencyID=\"COP\">266200.00</cbc:LineExtensionAmount>");
    expect(ls[0]).toContain("<cbc:PriceAmount currencyID=\"COP\">266200.00</cbc:PriceAmount>");
    expect(ls[0]).toContain("<cbc:InvoicedQuantity unitCode=\"ZZ\">1.000000</cbc:InvoicedQuantity>");
    // Same placement as the original FE-Tool generator.
    expect(ls[0]).toContain("<cac:SellersItemIdentification><cbc:ID>126446990</cbc:ID>");
    expect(ls[0]).toContain('<cbc:ID schemeID="999" schemeName="">cof1007222929</cbc:ID>');
    expect(xml).not.toContain("1947");
  });

  it("is deterministic: regenerating gives the same result", () => {
    const d = datos(REMESAS_OK, 466200);
    expect(generarFacturaConTemplate(COLTANQUES, d).xml).toBe(generarFacturaConTemplate(COLTANQUES, d).xml);
  });

  it("blocks Jhan's original form data (radicado 0, lines not adding up to the total)", () => {
    const remesas = [REMESAS_OK[0]!, { ...REMESAS_OK[1]!, radicado: "0" }];
    let error: unknown;
    try {
      generarFacturaConTemplate(COLTANQUES, datos(remesas, 2862000));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FacturaInvalidaError);
    const errores = (error as FacturaInvalidaError).errores.join(" ");
    expect(errores).toContain('radicado inválido ("0")');
    expect(errores).toContain("no coincide con el valor total");
  });
});

describe("generarFacturaConTemplate — each empresa keeps its own line convention", () => {
  it("TRANSAGRO (per kg): quantity = peso, price = valor / peso, 4 decimals", () => {
    const { xml } = generarFacturaConTemplate(
      TRANSAGRO,
      datos([{ consecutivo: "0110999-01", radicado: "170000001", peso: "2000", valor: 1000000, descripcionLinea: "Flete" }], 1000000)
    );
    const [l] = lineas(xml);
    expect(l).toContain('<cbc:InvoicedQuantity unitCode="KGM">2000.0000</cbc:InvoicedQuantity>');
    expect(l).toContain('<cbc:PriceAmount currencyID="COP">500.0000</cbc:PriceAmount>');
    expect(l).toContain('<cbc:BaseQuantity unitCode="KGM">2000.0000</cbc:BaseQuantity>');
    expect(l).toContain('<cbc:LineExtensionAmount currencyID="COP">1000000.0000</cbc:LineExtensionAmount>');
    expect(l).toContain("<cac:StandardItemIdentification><cbc:ID>0110999-01</cbc:ID>");
  });

  it("Sotracar (per trip): quantity stays 1 and the IVA 0% block follows the new value", () => {
    const { xml } = generarFacturaConTemplate(
      SOTRACAR,
      datos([{ consecutivo: "11600", radicado: "150000000", peso: "18722", valor: 5000000, descripcionLinea: "Flete" }], 5000000)
    );
    const [l] = lineas(xml);
    expect(l).toContain('<cbc:InvoicedQuantity unitCode="94">1.00</cbc:InvoicedQuantity>');
    expect(l).toContain('<cbc:PriceAmount currencyID="COP">5000000.00</cbc:PriceAmount>');
    expect(l).toContain('<cbc:TaxableAmount currencyID="COP">5000000.00</cbc:TaxableAmount>');
    expect(l).toContain('<cbc:TaxAmount currencyID="COP">0</cbc:TaxAmount>');
    expect(l).toContain('<cbc:ValueQuantity unitCode="KGM">18722</cbc:ValueQuantity>');
  });

  it("rejects a template that has no remesa line at all", () => {
    const sinRemesa = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="0">1</cbc:ID><cac:Item><cbc:Description>X</cbc:Description></cac:Item></cac:InvoiceLine>`);
    expect(() => generarFacturaConTemplate(sinRemesa, datos(REMESAS_OK, 466200))).toThrow(PlantillaSinLineaRemesaError);
  });
});

describe("validarFactura", () => {
  const broken = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="0">1</cbc:ID><cbc:Note>111650</cbc:Note><cac:Item><cbc:Description>Servicio de transporte</cbc:Description></cac:Item></cac:InvoiceLine>`);

  it("flags the line Jhan got (no remesa data, schemeID 0)", () => {
    const errores = validarFactura(broken);
    expect(errores.join(" ")).toContain("no es una línea de remesa");
  });

  it("upload mode tolerates extra non-remesa lines but requires at least one remesa line", () => {
    expect(validarFactura(broken, { permitirLineasSinRemesa: true })).toContain("La factura no tiene ninguna línea de remesa.");
    const real = plantilla(`<cac:InvoiceLine><cbc:ID schemeID="1">1</cbc:ID><cac:Item>${props("1", "c1", "100", "10")}</cac:Item></cac:InvoiceLine>
<cac:InvoiceLine><cbc:ID schemeID="0">2</cbc:ID><cac:Item><cbc:Description>ADICIONALES</cbc:Description></cac:Item></cac:InvoiceLine>`);
    expect(validarFactura(real, { permitirLineasSinRemesa: true })).toEqual([]);
  });
});
