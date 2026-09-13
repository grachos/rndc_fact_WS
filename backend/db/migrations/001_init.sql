create table if not exists users (
  id serial primary key,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'operador')),
  created_at timestamptz not null default now()
);

create table if not exists perfiles (
  id serial primary key,
  nombre text not null,
  nit_ut text not null,
  nombre_ut text not null,
  prefijo_factura text not null,
  unidad_medida text not null,
  nit_socio text not null,
  nombre_socio text not null,
  email_from text not null,
  email_contact_supplier text not null,
  nit_customer_default text,
  email_customer_default text,
  telefono_customer_default text,
  prefijo_remesa boolean not null default false,
  nit_monitoreo text,
  rndc_usuario text not null,
  rndc_password_enc text not null,
  rndc_usuario_corregir text,
  rndc_password_corregir_enc text,
  rndc_usuario_monitoreo text,
  rndc_password_monitoreo_enc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id boolean primary key default true check (id),
  fopat_fecha_inicio date not null default '2026-04-01',
  max_facturas_generar integer not null default 100
);

insert into settings (id) values (true) on conflict (id) do nothing;
