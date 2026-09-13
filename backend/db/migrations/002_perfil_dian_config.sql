-- DIAN/UBL fields that were hardcoded in the old Python xml_generator.py (signature
-- policy, authorization, software provider, supplier address/contact) become
-- per-perfil configuration now that profiles are dynamic instead of TSP/Elogia-only.
-- Grouped in one jsonb column rather than ~18 new top-level columns.
alter table perfiles
  add column if not exists dian_config jsonb not null default '{
    "invoiceAuthorization": "",
    "authStart": "",
    "authEnd": "",
    "rangeFrom": 1,
    "rangeTo": 1000,
    "softwareProviderNit": "",
    "softwareId": "",
    "softwareSecurityCode": "",
    "supplierCityCode": "",
    "supplierCityName": "",
    "supplierDeptCode": "",
    "supplierDeptName": "",
    "supplierAddressLine": "",
    "supplierIndustryCode": "",
    "contactName": "",
    "contactPhone": "",
    "lugarExpedicion": "",
    "customCiudadEmisor": "",
    "customDepartamentoEmisor": ""
  }'::jsonb;
