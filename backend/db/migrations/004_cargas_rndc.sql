-- Log of every "Cargar facturas a RNDC" upload attempt (proceso 86), one row per file,
-- so the results can be reported/audited later instead of only shown once in the UI.
create table if not exists cargas_rndc (
  id serial primary key,
  perfil_id integer not null references perfiles(id) on delete cascade,
  usuario_id integer not null references users(id) on delete cascade,
  archivo text not null,
  numero_factura text not null,
  exito boolean not null,
  mensaje text not null,
  remesas integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cargas_rndc_created_at_idx on cargas_rndc (created_at desc);
create index if not exists cargas_rndc_perfil_idx on cargas_rndc (perfil_id);
