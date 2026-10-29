-- Which empresas (perfiles) each operador may work with, plus their default one.
-- Admins are not restricted by this table (they can use every perfil).
create table if not exists usuario_perfiles (
  usuario_id integer not null references users(id) on delete cascade,
  perfil_id integer not null references perfiles(id) on delete cascade,
  predeterminado boolean not null default false,
  primary key (usuario_id, perfil_id)
);

create unique index if not exists usuario_perfiles_un_predeterminado
  on usuario_perfiles (usuario_id) where predeterminado;

alter table usuario_perfiles enable row level security;
