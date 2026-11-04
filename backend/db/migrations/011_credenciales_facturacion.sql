-- Credentials used to upload invoices to the RNDC (proceso 86). Optional: when empty the
-- upload falls back to the empresa's normal RNDC credentials.
alter table perfiles add column if not exists rndc_usuario_facturacion text;
alter table perfiles add column if not exists rndc_password_facturacion_enc text;
