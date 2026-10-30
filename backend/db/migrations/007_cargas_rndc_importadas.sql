-- Uploads can also be imported from the RNDC (proceso 86 query) to recover ones that
-- happened before the app logged them. The RNDC doesn't record which app user sent an
-- invoice, so imported rows have no usuario and are marked with origen = 'rndc'.
alter table cargas_rndc alter column usuario_id drop not null;
alter table cargas_rndc add column if not exists origen text not null default 'app'
  check (origen in ('app', 'rndc'));

-- Importing the same range twice must not duplicate invoices.
create unique index if not exists cargas_rndc_importada_unica
  on cargas_rndc (perfil_id, numero_factura) where origen = 'rndc';
