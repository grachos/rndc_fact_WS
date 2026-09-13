-- Replaces the decomposed DIAN/company fields (dian_config + the address/contact/UT
-- fields from 001) with a per-perfil uploaded XML template: a real previously-valid
-- invoice for that company. New invoices are produced by editing this template's
-- header fields and remesa lines in place (see services/xml/templateEditor.ts) instead
-- of building the document from a hardcoded structure — so signature, certificate,
-- DIAN authorization and addresses all come from the profile's own template.
alter table perfiles
  drop column if exists dian_config,
  drop column if exists nit_ut,
  drop column if exists nombre_ut,
  drop column if exists prefijo_factura,
  drop column if exists unidad_medida,
  drop column if exists nombre_socio,
  drop column if exists email_from,
  drop column if exists email_contact_supplier,
  drop column if exists nit_customer_default,
  drop column if exists email_customer_default,
  drop column if exists telefono_customer_default,
  add column if not exists xml_template text,
  add column if not exists xml_template_nombre text;
