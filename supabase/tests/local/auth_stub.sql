-- LOCAL TEST HARNESS ONLY. Never run this against a Supabase project: the real
-- auth schema already exists there.
--
-- Reproduces the parts of Supabase's auth schema that the migrations depend on:
-- the `anon` and `authenticated` roles, `auth.users` and `auth.uid()`, which
-- reads the `sub` claim from request.jwt.claims the same way Supabase does.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
