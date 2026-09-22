-- Supabase's Security Advisor flags every public table without RLS as exposed to the
-- anon/authenticated PostgREST roles. Nothing in this app uses PostgREST or the anon
-- key — the backend talks to Postgres directly as the postgres role (DATABASE_URL),
-- which bypasses RLS regardless — so enabling RLS with no policies closes the PostgREST
-- exposure without touching how the app itself reads/writes these tables.
alter table public.perfiles enable row level security;
alter table public.schema_migrations enable row level security;
alter table public.settings enable row level security;
alter table public.users enable row level security;
alter table public.cargas_rndc enable row level security;
