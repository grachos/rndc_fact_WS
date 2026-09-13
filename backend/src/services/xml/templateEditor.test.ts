import { describe, expect, it } from "vitest";
import { aplicarDatosXml, parseXmlTemplate } from "./templateEditor.js";

function sampleTemplate(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<AttachedDocument>
<cbc:ID>1001</cbc:ID>
<cbc:ParentDocumentID>1001</cbc:ParentDocumentID>
<cac:ReceiverParty>
<cac:PartyTaxScheme>
<cbc:RegistrationName>CLIENTE ORIGINAL</cbc:RegistrationName>
<cbc:CompanyID schemeAgencyID="195" schemeID="5" schemeName="31">800021308</cbc:CompanyID>
</cac:PartyTaxScheme>
</cac:ReceiverParty>
<cac:Attachment>
<cac:ExternalReference>
<cbc:Description><![CDATA[<?xml version="1.0" encoding="utf-8"?>
<Invoice>
<sts:QRCode>https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=CUFEORIGINAL</sts:QRCode>
<xades:SigningTime>2025-01-10T09:38:59.4100753-05:00</xades:SigningTime>
<cbc:ValidationDate>2025-01-10</cbc:ValidationDate>
<cbc:ID>1001</cbc:ID>
<cbc:UUID schemeID="1" schemeName="CUFE-SHA384">CUFEORIGINAL</cbc:UUID>
<cbc:IssueDate>2025-01-10</cbc:IssueDate>
<cbc:LineCountNumeric>1</cbc:LineCountNumeric>
<cac:AccountingCustomerParty>
<cac:Party>
<cac:PartyIdentification>
<cbc:ID schemeAgencyID="195" schemeName="31" schemeID="5">800021308</cbc:ID>
</cac:PartyIdentification>
<cac:PartyName>
<cbc:Name>CLIENTE ORIGINAL</cbc:Name>
</cac:PartyName>
<cac:PartyTaxScheme>
<cbc:RegistrationName>CLIENTE ORIGINAL</cbc:RegistrationName>
</cac:PartyTaxScheme>
</cac:Party>
</cac:AccountingCustomerParty>
<cac:PaymentMeans>
<cbc:PaymentDueDate>2025-02-09</cbc:PaymentDueDate>
</cac:PaymentMeans>
<cac:WithholdingTaxTotal>
<cbc:TaxAmount currencyID="COP">10000</cbc:TaxAmount>
</cac:WithholdingTaxTotal>
<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="COP">1000000</cbc:LineExtensionAmount>
<cbc:TaxInclusiveAmount currencyID="COP">1000000</cbc:TaxInclusiveAmount>
<cbc:PayableAmount currencyID="COP">1000000</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
<cac:InvoiceLine>
<cbc:ID schemeID="1">1</cbc:ID>
<cbc:InvoicedQuantity unitCode="KGM">1.0</cbc:InvoicedQuantity>
<cac:WithholdingTaxTotal>
<cbc:TaxAmount currencyID="COP">10000</cbc:TaxAmount>
</cac:WithholdingTaxTotal>
<cac:Item>
<cbc:Description>Servicio de transporte</cbc:Description>
<cac:AdditionalItemProperty>
<cbc:Name>01</cbc:Name>
<cbc:Value>ORIG_RADICADO</cbc:Value>
</cac:AdditionalItemProperty>
<cac:AdditionalItemProperty>
<cbc:Name>02</cbc:Name>
<cbc:Value>ORIG_CONSEC</cbc:Value>
</cac:AdditionalItemProperty>
<cac:AdditionalItemProperty>
<cbc:Name>03</cbc:Name>
<cbc:Value>1000000</cbc:Value>
<cbc:ValueQuantity unitCode="KGM">1000</cbc:ValueQuantity>
</cac:AdditionalItemProperty>
</cac:Item>
</cac:InvoiceLine>
</Invoice>]]></cbc:Description>
</cac:ExternalReference>
</cac:Attachment>
</AttachedDocument>`;
}

describe("parseXmlTemplate", () => {
  it("extracts header fields and the one remesa line", () => {
    const parsed = parseXmlTemplate(sampleTemplate());
    expect(parsed.numero).toBe("1001");
    expect(parsed.cufe).toBe("CUFEORIGINAL");
    expect(parsed.cliente).toBe("CLIENTE ORIGINAL");
    expect(parsed.fecha).toBe("2025-01-10");
    expect(parsed.totalOrig).toBe("1000000");
    expect(parsed.nit).toBe("800021308");
    expect(parsed.dig).toBe("5");
    expect(parsed.remesas).toHaveLength(1);
    expect(parsed.remesas[0]).toMatchObject({ radicado: "ORIG_RADICADO", consecutivo: "ORIG_CONSEC" });
  });
});

describe("aplicarDatosXml", () => {
  it("substitutes header fields and generates new remesa lines from the template", () => {
    const template = sampleTemplate();
    const orig = parseXmlTemplate(template);

    const { xml, avisos } = aplicarDatosXml(
      template,
      orig,
      { numero: "2002", cufe: "CUFENUEVO", total: "1500000", fecha: "2026-03-01", cliente: "CLIENTE NUEVO", nit: "900123456", dig: "7" },
      [
        { radicado: "9988776", consecutivo: "300111", valor: "1500000", peso: "1500", descripcion: "Servicio de transporte", nuevo: true },
      ]
    );

    expect(avisos).toEqual([]);
    expect(xml).toContain("<cbc:ID>2002</cbc:ID>");
    expect(xml).toContain("<cbc:ParentDocumentID>2002</cbc:ParentDocumentID>");
    expect(xml).toContain("CUFENUEVO");
    expect(xml).not.toContain("CUFEORIGINAL");
    expect(xml).toContain("documentkey=CUFENUEVO");
    expect(xml).toContain("<cbc:PayableAmount currencyID=\"COP\">1500000</cbc:PayableAmount>");
    expect(xml).toContain("<cbc:IssueDate>2026-03-01</cbc:IssueDate>");
    expect(xml).toContain("<cbc:PaymentDueDate>2026-03-31</cbc:PaymentDueDate>");
    expect(xml).toContain("CLIENTE NUEVO");
    expect(xml).not.toContain("CLIENTE ORIGINAL");
    expect(xml).toContain(">900123456<");
    expect(xml).toContain('schemeID="7"');
    expect(xml).toContain("<cbc:Value>9988776</cbc:Value>");
    expect(xml).toContain("<cbc:Value>300111</cbc:Value>");
    expect(xml).toContain("<cbc:LineCountNumeric>1</cbc:LineCountNumeric>");
  });

  it("clones the template line for multiple new remesas", () => {
    const template = sampleTemplate();
    const orig = parseXmlTemplate(template);
    const { xml } = aplicarDatosXml(
      template,
      orig,
      { numero: "2003", cufe: "C3", total: "2000000", fecha: "2026-03-01", cliente: "X", nit: "1", dig: "1" },
      [
        { radicado: "r1", consecutivo: "c1", valor: "1000000", peso: "500", descripcion: "d1", nuevo: true },
        { radicado: "r2", consecutivo: "c2", valor: "1000000", peso: "500", descripcion: "d2", nuevo: true },
      ]
    );
    expect((xml.match(/<cac:InvoiceLine>/g) ?? []).length).toBe(2);
    expect(xml).toContain("<cbc:LineCountNumeric>2</cbc:LineCountNumeric>");
    expect(xml).toContain("<cbc:Value>r1</cbc:Value>");
    expect(xml).toContain("<cbc:Value>r2</cbc:Value>");
  });
});
