-- Fase 1 — Fundação
--
-- Organizações, perfis e papéis, catálogo de unidades e conversões,
-- categorias, fornecedores, insumos e o livro de movimentações de estoque.
--
-- Regras de segurança desta migração:
--   * Row Level Security em todas as tabelas. Leitura apenas da própria organização.
--   * Nenhuma escrita direta para o papel `authenticated`. Toda escrita passa por
--     funções `security definer` que verificam o papel do usuário no backend.
--   * O livro de movimentações e o log de auditoria são imutáveis (bloqueio por trigger).
--   * Saldo do insumo = soma dos movimentos. Não existe campo de saldo editável.

-- ---------------------------------------------------------------------------
-- Organizações, papéis e perfis
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.roles (
  code text primary key check (code in ('administrador', 'gerente', 'estoquista', 'pizzaiolo', 'atendente')),
  label text not null
);

insert into public.roles (code, label) values
  ('administrador', 'Administrador'),
  ('gerente', 'Gerente'),
  ('estoquista', 'Estoquista'),
  ('pizzaiolo', 'Pizzaiolo'),
  ('atendente', 'Atendente');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  role_code text not null references public.roles (code),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);

-- Helpers used by policies and RPCs. They are security definer so that the
-- profiles policy does not recurse into itself.
create function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid() and p.is_active;
$$;

create function public.has_any_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role_code = any (p_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Unidades de medida e conversões universais
-- ---------------------------------------------------------------------------

create table public.units_of_measure (
  code text primary key check (code in ('kg', 'g', 'l', 'ml', 'un', 'pacote', 'caixa', 'fardo')),
  label text not null,
  dimension text not null check (dimension in ('massa', 'volume', 'contagem'))
);

insert into public.units_of_measure (code, label, dimension) values
  ('kg', 'Quilograma (kg)', 'massa'),
  ('g', 'Grama (g)', 'massa'),
  ('l', 'Litro (L)', 'volume'),
  ('ml', 'Mililitro (ml)', 'volume'),
  ('un', 'Unidade (un)', 'contagem'),
  ('pacote', 'Pacote', 'contagem'),
  ('caixa', 'Caixa', 'contagem'),
  ('fardo', 'Fardo', 'contagem');

-- factor: 1 from_unit = factor to_unit. Only universal pairs appear here.
create table public.unit_conversions (
  from_unit text not null references public.units_of_measure (code),
  to_unit text not null references public.units_of_measure (code),
  factor numeric(18, 6) not null check (factor > 0),
  primary key (from_unit, to_unit),
  check (from_unit <> to_unit)
);

create function public.unit_conversions_same_dimension()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select dimension from public.units_of_measure where code = new.from_unit)
     is distinct from
     (select dimension from public.units_of_measure where code = new.to_unit) then
    raise exception 'Conversão universal exige unidades da mesma grandeza (% -> %)', new.from_unit, new.to_unit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger unit_conversions_same_dimension_trg
  before insert or update on public.unit_conversions
  for each row execute function public.unit_conversions_same_dimension();

insert into public.unit_conversions (from_unit, to_unit, factor) values
  ('kg', 'g', 1000),
  ('g', 'kg', 0.001),
  ('l', 'ml', 1000),
  ('ml', 'l', 0.001);

-- ---------------------------------------------------------------------------
-- Categorias e fornecedores
-- ---------------------------------------------------------------------------

create table public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_at timestamptz not null default now()
);

create unique index ingredient_categories_org_name_key
  on public.ingredient_categories (organization_id, lower(btrim(name)));

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  -- CPF (11) or CNPJ (14) digits only. Formatting is stripped before storing.
  document text check (document ~ '^[0-9]{11}([0-9]{3})?$'),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 120),
  notes text check (char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index suppliers_org_name_key
  on public.suppliers (organization_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------------

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Identifier sent by the client for one cadastro attempt. Retries return the
  -- same ingredient instead of creating a duplicate.
  client_request_id uuid not null,
  sku text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category_id uuid not null references public.ingredient_categories (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  purchase_unit text not null references public.units_of_measure (code),
  stock_unit text not null references public.units_of_measure (code),
  consumption_unit text not null references public.units_of_measure (code),
  -- 1 purchase_unit = purchase_to_stock_factor stock_unit
  purchase_to_stock_factor numeric(18, 6) not null check (purchase_to_stock_factor > 0),
  -- 1 consumption_unit = consumption_to_stock_factor stock_unit
  consumption_to_stock_factor numeric(18, 6) not null check (consumption_to_stock_factor > 0),
  minimum_stock numeric(18, 4) not null default 0 check (minimum_stock >= 0),
  maximum_stock numeric(18, 4) check (maximum_stock >= 0),
  constraint ingredients_max_not_below_min check (maximum_stock is null or maximum_stock >= minimum_stock),
  purchase_unit_cost numeric(14, 4) not null default 0 check (purchase_unit_cost >= 0),
  storage_location text check (char_length(storage_location) <= 80),
  -- null = sem controle de validade
  shelf_life_days integer check (shelf_life_days between 1 and 3650),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint ingredients_org_request_key unique (organization_id, client_request_id)
);

create unique index ingredients_org_sku_key
  on public.ingredients (organization_id, lower(sku));

create index ingredients_category_idx on public.ingredients (category_id);

-- Validates the unit factors and the tenant links on every write.
-- Universal pairs (kg/g, L/ml) must use the catalog factor. Same-unit pairs
-- must use 1. Any other pair takes an explicit factor, which is validated only
-- for being positive, as the user's density or packaging conversion.
create function public.assert_unit_factor(
  p_from text,
  p_to text,
  p_factor numeric,
  p_field text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_catalog numeric;
begin
  if p_from = p_to then
    if p_factor <> 1 then
      raise exception 'Unidades iguais (%) exigem fator 1 em %', p_from, p_field
        using errcode = 'check_violation';
    end if;
    return;
  end if;

  select uc.factor into v_catalog
  from public.unit_conversions uc
  where uc.from_unit = p_from and uc.to_unit = p_to;

  if found and p_factor <> v_catalog then
    raise exception 'Fator de conversão de % para % deve ser % (informado: %)',
      p_from, p_to, v_catalog, p_factor
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.validate_ingredient_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ingredient_categories c
    where c.id = new.category_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Categoria não pertence à organização do insumo'
      using errcode = 'foreign_key_violation';
  end if;

  if new.supplier_id is not null and not exists (
    select 1
    from public.suppliers s
    where s.id = new.supplier_id and s.organization_id = new.organization_id
  ) then
    raise exception 'Fornecedor não pertence à organização do insumo'
      using errcode = 'foreign_key_violation';
  end if;

  perform public.assert_unit_factor(new.purchase_unit, new.stock_unit, new.purchase_to_stock_factor, 'purchase_to_stock_factor');
  perform public.assert_unit_factor(new.consumption_unit, new.stock_unit, new.consumption_to_stock_factor, 'consumption_to_stock_factor');

  return new;
end;
$$;

create trigger ingredients_validate_row_trg
  before insert or update on public.ingredients
  for each row execute function public.validate_ingredient_row();

-- ---------------------------------------------------------------------------
-- Livro de movimentações (imutável)
-- ---------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  movement_type text not null check (movement_type in (
    'saldo_inicial',
    'recebimento',
    'consumo_producao',
    'consumo_venda',
    'perda',
    'vencimento',
    'ajuste_positivo',
    'ajuste_negativo',
    'devolucao_fornecedor',
    'devolucao_cliente',
    'transferencia',
    'estorno'
  )),
  -- Positive for entries, negative for exits. Quantities are in the ingredient's stock unit.
  quantity_delta numeric(18, 4) not null check (quantity_delta <> 0),
  unit text not null references public.units_of_measure (code),
  balance_before numeric(18, 4) not null check (balance_before >= 0),
  balance_after numeric(18, 4) not null check (balance_after >= 0),
  constraint stock_movements_balance_consistent check (balance_after = balance_before + quantity_delta),
  reason text check (char_length(reason) <= 300),
  reference text check (char_length(reference) <= 120),
  -- Unique per organization: a repeated submission cannot post the same movement twice.
  idempotency_key uuid not null,
  performed_by uuid not null default auth.uid() references auth.users (id),
  occurred_at timestamptz not null default now(),
  constraint stock_movements_org_idempotency_key unique (organization_id, idempotency_key)
);

create index stock_movements_ingredient_idx on public.stock_movements (ingredient_id, occurred_at);

create function public.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de % são imutáveis. Use um estorno ou ajuste.', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger stock_movements_immutable_trg
  before update or delete on public.stock_movements
  for each row execute function public.reject_ledger_mutation();

-- Saldo derivado do livro. security_invoker keeps RLS of the caller applied.
create view public.ingredient_balances
with (security_invoker = true)
as
select
  i.id as ingredient_id,
  i.organization_id,
  i.stock_unit as unit,
  coalesce(sum(m.quantity_delta), 0)::numeric(18, 4) as balance
from public.ingredients i
left join public.stock_movements m on m.ingredient_id = i.id
group by i.id, i.organization_id, i.stock_unit;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity text not null check (char_length(entity) between 1 and 40),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_logs_org_time_idx on public.audit_logs (organization_id, occurred_at);

create trigger audit_logs_immutable_trg
  before update or delete on public.audit_logs
  for each row execute function public.reject_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.ingredient_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.ingredients enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select_own on public.organizations
  for select to authenticated
  using (id = public.current_organization_id());

create policy roles_select_all on public.roles
  for select to authenticated
  using (true);

create policy profiles_select_same_org on public.profiles
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy units_select_all on public.units_of_measure
  for select to authenticated
  using (true);

create policy unit_conversions_select_all on public.unit_conversions
  for select to authenticated
  using (true);

create policy ingredient_categories_select_own on public.ingredient_categories
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy suppliers_select_own on public.suppliers
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy ingredients_select_own on public.ingredients
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy stock_movements_select_own on public.stock_movements
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_any_role(array['administrador'])
  );

-- Explicit grants: only reads reach the client directly. Writes go through the RPCs below.
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.organizations,
  public.roles,
  public.profiles,
  public.units_of_measure,
  public.unit_conversions,
  public.ingredient_categories,
  public.suppliers,
  public.ingredients,
  public.stock_movements,
  public.audit_logs,
  public.ingredient_balances
to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (writes)
-- ---------------------------------------------------------------------------

-- Creates the organization for the logged-in user, who becomes its administrator,
-- and seeds the suggested ingredient categories.
create function public.create_organization(p_name text, p_owner_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(p_name);
  v_owner text := btrim(p_owner_name);
begin
  if v_user is null then
    raise exception 'Sessão inválida. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Este usuário já pertence a uma organização.' using errcode = 'unique_violation';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Informe o nome da pizzaria (entre 2 e 120 caracteres).' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_owner) not between 2 and 120 then
    raise exception 'Informe o nome do responsável (entre 2 e 120 caracteres).' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.organizations (name) values (v_name) returning id into v_org;

  insert into public.profiles (id, organization_id, full_name, role_code)
  values (v_user, v_org, v_owner, 'administrador');

  insert into public.ingredient_categories (organization_id, name)
  select v_org, c.name
  from (values
    (1, 'Massas e farinhas'),
    (2, 'Queijos'),
    (3, 'Carnes e embutidos'),
    (4, 'Molhos e conservas'),
    (5, 'Hortifruti'),
    (6, 'Temperos'),
    (7, 'Bebidas'),
    (8, 'Embalagens'),
    (9, 'Produtos de limpeza'),
    (10, 'Outros')
  ) as c(position, name)
  order by c.position;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'organization.created', 'organization', v_org, jsonb_build_object('name', v_name));

  return v_org;
end;
$$;

create function public.create_ingredient_category(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cadastrar categorias.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Informe o nome da categoria (entre 2 e 60 caracteres).' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.ingredient_categories (organization_id, name)
  values (v_org, v_name)
  returning id into v_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, auth.uid(), 'ingredient_category.created', 'ingredient_category', v_id, jsonb_build_object('name', v_name));

  return v_id;
end;
$$;

create function public.create_supplier(
  p_name text,
  p_document text,
  p_phone text,
  p_email text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_name text := btrim(p_name);
  v_document text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_id uuid;
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cadastrar fornecedores.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Informe o nome do fornecedor (entre 2 e 120 caracteres).' using errcode = 'invalid_parameter_value';
  end if;
  if v_document is not null and char_length(v_document) not in (11, 14) then
    raise exception 'CPF deve ter 11 dígitos e CNPJ, 14 dígitos.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.suppliers (organization_id, name, document, phone, email, notes)
  values (
    v_org,
    v_name,
    v_document,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, auth.uid(), 'supplier.created', 'supplier', v_id, jsonb_build_object('name', v_name));

  return v_id;
end;
$$;

-- Creates an ingredient and, when there is an opening balance, its first ledger
-- entry, in one transaction. Retrying with the same p_client_request_id returns
-- the existing ingredient and posts nothing new.
create function public.create_ingredient(
  p_client_request_id uuid,
  p_sku text,
  p_name text,
  p_category_id uuid,
  p_purchase_unit text,
  p_stock_unit text,
  p_consumption_unit text,
  p_purchase_to_stock_factor numeric,
  p_consumption_to_stock_factor numeric,
  p_opening_quantity numeric,
  p_minimum_stock numeric,
  p_maximum_stock numeric,
  p_purchase_unit_cost numeric,
  p_supplier_id uuid,
  p_storage_location text,
  p_shelf_life_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_existing uuid;
  v_id uuid;
  v_opening numeric := coalesce(p_opening_quantity, 0);
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cadastrar insumos.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialises cadastros of the same organization so the idempotency check cannot race.
  perform 1 from public.organizations where id = v_org for update;

  select i.id into v_existing
  from public.ingredients i
  where i.organization_id = v_org and i.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  if v_opening < 0 then
    raise exception 'A quantidade inicial não pode ser negativa.' using errcode = 'check_violation';
  end if;
  if p_purchase_to_stock_factor is null or p_consumption_to_stock_factor is null then
    raise exception 'Informe os fatores de conversão entre as unidades.' using errcode = 'invalid_parameter_value';
  end if;
  if p_purchase_unit is null or p_stock_unit is null or p_consumption_unit is null
     or not exists (select 1 from public.units_of_measure u where u.code = p_purchase_unit)
     or not exists (select 1 from public.units_of_measure u where u.code = p_stock_unit)
     or not exists (select 1 from public.units_of_measure u where u.code = p_consumption_unit) then
    raise exception 'Unidade de medida desconhecida.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.ingredients (
    organization_id, client_request_id, sku, name, category_id, supplier_id,
    purchase_unit, stock_unit, consumption_unit,
    purchase_to_stock_factor, consumption_to_stock_factor,
    minimum_stock, maximum_stock, purchase_unit_cost,
    storage_location, shelf_life_days, created_by
  )
  values (
    v_org, p_client_request_id, btrim(p_sku), btrim(p_name), p_category_id, p_supplier_id,
    p_purchase_unit, p_stock_unit, p_consumption_unit,
    p_purchase_to_stock_factor, p_consumption_to_stock_factor,
    coalesce(p_minimum_stock, 0), p_maximum_stock, coalesce(p_purchase_unit_cost, 0),
    nullif(btrim(coalesce(p_storage_location, '')), ''), p_shelf_life_days, v_user
  )
  returning id into v_id;

  if v_opening > 0 then
    insert into public.stock_movements (
      organization_id, ingredient_id, movement_type, quantity_delta, unit,
      balance_before, balance_after, reason, idempotency_key, performed_by
    )
    values (
      v_org, v_id, 'saldo_inicial', v_opening, p_stock_unit,
      0, v_opening, 'Saldo inicial informado no cadastro', p_client_request_id, v_user
    );
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (
    v_org, v_user, 'ingredient.created', 'ingredient', v_id,
    jsonb_build_object('sku', btrim(p_sku), 'name', btrim(p_name), 'opening_quantity', v_opening)
  );

  return v_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
revoke all on function public.create_ingredient_category(text) from public, anon;
revoke all on function public.create_supplier(text, text, text, text, text) from public, anon;
revoke all on function public.create_ingredient(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, integer) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.create_ingredient_category(text) to authenticated;
grant execute on function public.create_supplier(text, text, text, text, text) to authenticated;
grant execute on function public.create_ingredient(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, integer) to authenticated;
