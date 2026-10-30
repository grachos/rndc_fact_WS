-- Undoes 007: the uploads report only lists invoices sent from the application.
-- Imported RNDC rows were deleted beforehand, so every row has a usuario again.
drop index if exists cargas_rndc_importada_unica;
alter table cargas_rndc drop column if exists origen;
alter table cargas_rndc alter column usuario_id set not null;
