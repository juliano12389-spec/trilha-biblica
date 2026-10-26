-- Fase 3 — Produção
--
-- Produtos (sabor + tamanho), fichas técnicas com versões imutáveis, preparos por lote,
-- ordens de produção e baixa automática FEFO dos ingredientes.
--
-- Regras desta migração:
--   * Uma versão publicada de ficha técnica nunca muda. Mudanças geram nova versão.
--   * Ordens guardam a versão da ficha e o custo dos insumos no momento da baixa.
--   * Meio a meio: itens 'metade' contam 50% de cada sabor; itens 'inteira' (massa, caixa)
--     são descontados uma única vez, pela maior quantidade entre os sabores.
--   * Baixa FEFO sem lotes vencidos. Se faltar insumo, nada é baixado e a mensagem lista os faltantes.
--   * Toda baixa e toda entrada de preparo viram movimentos com lote no livro.

-- ---------------------------------------------------------------------------
-- Tipo de movimento para saída de preparo
-- ---------------------------------------------------------------------------

alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
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
  'estorno',
  'producao'
));

-- ---------------------------------------------------------------------------
-- Produtos (pizza por sabor e tamanho)
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null check (char_length(btrim(category)) between 2 and 60),
  size text not null check (size in ('pequena', 'media', 'grande', 'familia')),
  sale_price numeric(14, 2) not null check (sale_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index products_code_key on public.products (organization_id, lower(code));

-- ---------------------------------------------------------------------------
-- Fichas técnicas: receita (cabeçalho), versões e itens
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind text not null check (kind in ('pizza', 'preparo')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  product_id uuid references public.products (id) on delete restrict,
  output_ingredient_id uuid references public.ingredients (id) on delete restrict,
  yield_quantity numeric(18, 4) check (yield_quantity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recipes_kind_shape check (
    (kind = 'pizza' and product_id is not null and output_ingredient_id is null and yield_quantity is null)
    or (kind = 'preparo' and product_id is null and output_ingredient_id is not null and yield_quantity is not null)
  )
);

create unique index recipes_pizza_product_key on public.recipes (product_id) where kind = 'pizza';
create unique index recipes_preparo_output_key on public.recipes (organization_id, output_ingredient_id) where kind = 'preparo';

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  published boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint recipe_versions_number_key unique (recipe_id, version_number)
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  version_id uuid not null references public.recipe_versions (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  -- In the ingredient's CONSUMPTION unit, for one whole pizza (or one batch of a preparo).
  quantity numeric(18, 4) not null check (quantity > 0),
  split_rule text not null check (split_rule in ('metade', 'inteira')),
  constraint recipe_items_version_ingredient_key unique (version_id, ingredient_id)
);

create function public.guard_recipe_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_published boolean;
  v_kind text;
begin
  select v.published, r.kind into v_published, v_kind
  from public.recipe_versions v
  join public.recipes r on r.id = v.recipe_id
  where v.id = coalesce(new.version_id, old.version_id);

  if v_published then
    raise exception 'Esta versão da ficha já foi publicada e não pode ser alterada. Publique uma nova versão.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_kind = 'preparo' and new.split_rule <> 'inteira' then
    raise exception 'Itens de preparo são consumidos inteiros (split_rule = inteira).'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.ingredients i
    where i.id = new.ingredient_id and i.organization_id = new.organization_id
  ) then
    raise exception 'Insumo não pertence à organização da ficha técnica'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger recipe_items_guard_trg
  before insert or update or delete on public.recipe_items
  for each row execute function public.guard_recipe_item();

create function public.guard_recipe_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published then
    raise exception 'Versões publicadas de ficha técnica são imutáveis.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger recipe_versions_guard_trg
  before update or delete on public.recipe_versions
  for each row execute function public.guard_recipe_version();

-- ---------------------------------------------------------------------------
-- Ordens de produção e consumos (com custo congelado)
-- ---------------------------------------------------------------------------

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_request_id uuid not null,
  kind text not null check (kind in ('pizza', 'preparo')),
  product_a_id uuid references public.products (id) on delete restrict,
  product_b_id uuid references public.products (id) on delete restrict,
  recipe_version_a_id uuid references public.recipe_versions (id) on delete restrict,
  recipe_version_b_id uuid references public.recipe_versions (id) on delete restrict,
  recipe_id uuid references public.recipes (id) on delete restrict,
  recipe_version_id uuid references public.recipe_versions (id) on delete restrict,
  output_ingredient_id uuid references public.ingredients (id) on delete restrict,
  output_lot_id uuid references public.inventory_lots (id) on delete restrict,
  pizzas_quantity integer check (pizzas_quantity > 0),
  batches integer check (batches > 0),
  expected_yield numeric(18, 4),
  actual_yield numeric(18, 4) check (actual_yield > 0),
  -- expected - actual. Negative means a gain over the expected yield.
  yield_loss numeric(18, 4),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  unit_cost numeric(14, 4) not null default 0 check (unit_cost >= 0),
  produced_on date not null default current_date,
  notes text check (char_length(notes) <= 300),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint production_orders_org_request_key unique (organization_id, client_request_id),
  constraint production_orders_kind_shape check (
    (kind = 'pizza'
      and product_a_id is not null and recipe_version_a_id is not null and pizzas_quantity is not null
      and output_ingredient_id is null)
    or (kind = 'preparo'
      and recipe_id is not null and recipe_version_id is not null and output_ingredient_id is not null
      and batches is not null and actual_yield is not null)
  )
);

create table public.production_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  production_order_id uuid not null references public.production_orders (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  lot_id uuid not null references public.inventory_lots (id) on delete restrict,
  movement_id uuid not null references public.stock_movements (id) on delete restrict,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  total_cost numeric(14, 2) not null check (total_cost >= 0),
  created_at timestamptz not null default now()
);

create index production_consumptions_order_idx on public.production_consumptions (production_order_id);

-- ---------------------------------------------------------------------------
-- Helpers de cálculo
-- ---------------------------------------------------------------------------

-- Versão publicada mais recente de uma ficha.
create function public.current_recipe_version(p_recipe_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id
  from public.recipe_versions v
  where v.recipe_id = p_recipe_id and v.published
  order by v.version_number desc
  limit 1;
$$;

-- Estoque disponível de um insumo: só lotes com saldo e não vencidos.
create function public._available_stock(p_ingredient uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(b.balance), 0)
  from public.inventory_lot_balances b
  where b.ingredient_id = p_ingredient
    and b.balance > 0
    and (b.expires_on is null or b.expires_on >= current_date);
$$;

-- Requisitos em unidade de ESTOQUE para p_pizzas pizzas. Com dois sabores (versão B),
-- itens 'metade' somam 50% de cada sabor e itens 'inteira' contam uma vez, pela maior quantidade.
create function public.pizza_requirements(p_version_a uuid, p_version_b uuid, p_pizzas integer)
returns table (out_ingredient_id uuid, out_quantity numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with flavors as (
    select p_version_a as version_id,
           case when p_version_b is null then 1::numeric else 0.5 end as share
    union all
    select p_version_b, 0.5::numeric
    where p_version_b is not null
  ),
  per_item as (
    select ri.ingredient_id, ri.split_rule, f.share,
           ri.quantity * i.consumption_to_stock_factor as stock_quantity
    from flavors f
    join public.recipe_items ri on ri.version_id = f.version_id
    join public.ingredients i on i.id = ri.ingredient_id
  ),
  metade as (
    select ingredient_id, sum(stock_quantity * share) as q
    from per_item
    where split_rule = 'metade'
    group by ingredient_id
  ),
  inteira as (
    select ingredient_id, max(stock_quantity) as q
    from per_item
    where split_rule = 'inteira'
    group by ingredient_id
  )
  select x.ingredient_id, sum(x.q) * p_pizzas
  from (
    select * from metade
    union all
    select * from inteira
  ) x
  group by x.ingredient_id;
$$;

-- Pré-visualização para a pizzaiola: necessário x disponível por insumo. Não baixa nada.
create function public.preview_pizza_requirements(
  p_product_a uuid,
  p_product_b uuid,
  p_pizzas integer
)
returns table (
  out_ingredient_id uuid,
  out_name text,
  out_unit text,
  out_required numeric,
  out_available numeric,
  out_missing numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_version_a uuid;
  v_version_b uuid;
begin
  v_version_a := public.current_recipe_version(
    (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = p_product_a));
  if v_version_a is null then
    raise exception 'Produto sem ficha técnica publicada.' using errcode = 'check_violation';
  end if;

  if p_product_b is not null then
    v_version_b := public.current_recipe_version(
      (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = p_product_b));
    if v_version_b is null then
      raise exception 'Segundo sabor sem ficha técnica publicada.' using errcode = 'check_violation';
    end if;
  end if;

  return query
  select req.out_ingredient_id,
         i.name,
         i.stock_unit,
         req.out_quantity,
         public._available_stock(req.out_ingredient_id),
         greatest(req.out_quantity - public._available_stock(req.out_ingredient_id), 0)
  from public.pizza_requirements(v_version_a, v_version_b, p_pizzas) req
  join public.ingredients i on i.id = req.out_ingredient_id
  order by i.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Baixa FEFO (núcleo). Usa a tabela temporária _req(ingredient_id, quantity)
-- preenchida pelo chamador, com quantidades em unidade de estoque.
-- ---------------------------------------------------------------------------

create function public._consume_requirements(p_org uuid, p_order uuid, p_user uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  l record;
  v_ing public.ingredients%rowtype;
  v_available numeric;
  v_missing text := '';
  v_remaining numeric;
  v_take numeric;
  v_balance numeric;
  v_movement uuid;
  v_line numeric(14, 2);
  v_total numeric(14, 2) := 0;
begin
  -- Lock every ingredient first, in a fixed order, so concurrent orders serialise.
  perform 1
  from public.ingredients i
  where i.organization_id = p_org and i.id in (select ingredient_id from _req)
  order by i.id
  for update;

  -- Check the whole order before writing anything: report every shortage at once.
  for r in select q.ingredient_id, q.quantity from _req q order by q.ingredient_id loop
    select * into v_ing from public.ingredients where id = r.ingredient_id;
    v_available := public._available_stock(r.ingredient_id);
    if v_available < r.quantity then
      v_missing := v_missing || format(E'\n• %s: necessário %s %s, disponível %s %s',
        v_ing.name, trim_scale(r.quantity), v_ing.stock_unit, trim_scale(v_available), v_ing.stock_unit);
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'Estoque insuficiente para esta produção:%', v_missing
      using errcode = 'check_violation';
  end if;

  for r in select q.ingredient_id, q.quantity from _req q order by q.ingredient_id loop
    select * into v_ing from public.ingredients where id = r.ingredient_id;
    v_remaining := r.quantity;
    v_balance := (select coalesce(sum(m.quantity_delta), 0)
                  from public.stock_movements m
                  where m.ingredient_id = r.ingredient_id);

    -- FEFO: earliest expiry first, lots without expiry last. Expired lots are never used.
    for l in
      select b.lot_id, b.balance
      from public.inventory_lot_balances b
      where b.ingredient_id = r.ingredient_id
        and b.balance > 0
        and (b.expires_on is null or b.expires_on >= current_date)
      order by b.expires_on nulls last, b.received_on, b.lot_id
    loop
      exit when v_remaining <= 0;
      v_take := least(l.balance, v_remaining);

      insert into public.stock_movements (
        organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
        balance_before, balance_after, reason, reference, idempotency_key, performed_by
      )
      values (
        p_org, v_ing.id, l.lot_id, 'consumo_producao', -v_take, v_ing.stock_unit,
        v_balance, v_balance - v_take, 'Consumo em produção', 'producao:' || p_order,
        gen_random_uuid(), p_user
      )
      returning id into v_movement;

      v_line := round(v_take * v_ing.average_stock_unit_cost, 2);

      insert into public.production_consumptions (
        organization_id, production_order_id, ingredient_id, lot_id, movement_id,
        quantity, unit_cost, total_cost
      )
      values (p_org, p_order, v_ing.id, l.lot_id, v_movement, v_take, v_ing.average_stock_unit_cost, v_line);

      v_balance := v_balance - v_take;
      v_remaining := v_remaining - v_take;
      v_total := v_total + v_line;
    end loop;

    if v_remaining > 0 then
      raise exception 'O estoque de % mudou durante a baixa. Tente novamente.', v_ing.name
        using errcode = 'serialization_failure';
    end if;
  end loop;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_items enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_consumptions enable row level security;

create policy products_select_own on public.products
  for select to authenticated using (organization_id = public.current_organization_id());
create policy recipes_select_own on public.recipes
  for select to authenticated using (organization_id = public.current_organization_id());
create policy recipe_versions_select_own on public.recipe_versions
  for select to authenticated using (organization_id = public.current_organization_id());
create policy recipe_items_select_own on public.recipe_items
  for select to authenticated using (organization_id = public.current_organization_id());
create policy production_orders_select_own on public.production_orders
  for select to authenticated using (organization_id = public.current_organization_id());
create policy production_consumptions_select_own on public.production_consumptions
  for select to authenticated using (organization_id = public.current_organization_id());

revoke all on public.products, public.recipes, public.recipe_versions, public.recipe_items,
  public.production_orders, public.production_consumptions
  from anon, authenticated;
grant select on public.products, public.recipes, public.recipe_versions, public.recipe_items,
  public.production_orders, public.production_consumptions
  to authenticated;

-- The core consumption routine is not callable by clients; only the RPCs below call it.
revoke all on function public._consume_requirements(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._available_stock(uuid) from public, anon;
grant execute on function public._available_stock(uuid) to authenticated;
revoke all on function public.current_recipe_version(uuid) from public, anon;
grant execute on function public.current_recipe_version(uuid) to authenticated;
revoke all on function public.pizza_requirements(uuid, uuid, integer) from public, anon;
grant execute on function public.pizza_requirements(uuid, uuid, integer) to authenticated;
revoke all on function public.preview_pizza_requirements(uuid, uuid, integer) from public, anon;
grant execute on function public.preview_pizza_requirements(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: produtos e fichas
-- ---------------------------------------------------------------------------

-- Creates the product and its (empty) pizza recipe, which receives versions later.
create function public.create_product(
  p_code text,
  p_name text,
  p_category text,
  p_size text,
  p_sale_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_product uuid;
  v_name text := btrim(p_name);
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cadastrar produtos.' using errcode = 'insufficient_privilege';
  end if;
  if p_size not in ('pequena', 'media', 'grande', 'familia') then
    raise exception 'Tamanho inválido. Use pequena, média, grande ou família.' using errcode = 'invalid_parameter_value';
  end if;
  if p_sale_price is null or p_sale_price < 0 or p_sale_price <> round(p_sale_price, 2) then
    raise exception 'Informe o preço de venda (zero ou mais, com até 2 casas).' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.products (organization_id, code, name, category, size, sale_price)
  values (v_org, btrim(p_code), v_name, btrim(p_category), p_size, p_sale_price)
  returning id into v_product;

  insert into public.recipes (organization_id, kind, name, product_id)
  values (v_org, 'pizza', v_name, v_product);

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, auth.uid(), 'product.created', 'product', v_product, jsonb_build_object('code', btrim(p_code), 'name', v_name));

  return v_product;
end;
$$;

create function public.create_preparo_recipe(p_name text, p_output_ingredient_id uuid, p_yield_quantity numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_recipe uuid;
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cadastrar preparos.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ingredients i where i.id = p_output_ingredient_id and i.organization_id = v_org) then
    raise exception 'Insumo de saída não encontrado nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;
  if p_yield_quantity is null or p_yield_quantity <= 0 or p_yield_quantity <> round(p_yield_quantity, 4) then
    raise exception 'Informe o rendimento esperado por lote (maior que zero, até 4 casas).' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.recipes (organization_id, kind, name, output_ingredient_id, yield_quantity)
  values (v_org, 'preparo', btrim(p_name), p_output_ingredient_id, p_yield_quantity)
  returning id into v_recipe;

  return v_recipe;
end;
$$;

-- p_items: [{ "ingredient_id", "quantity", "split_rule" }]. Quantity in the ingredient's consumption unit.
create function public.publish_recipe_version(p_recipe_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
  v_recipe public.recipes%rowtype;
  v_number integer;
  v_version uuid;
  v_item jsonb;
  v_qty numeric;
  v_split text;
  v_ingredient uuid;
  v_seen uuid[] := '{}';
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode publicar fichas técnicas.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_recipe from public.recipes
  where id = p_recipe_id and organization_id = v_org and is_active
  for update;
  if not found then
    raise exception 'Ficha técnica não encontrada ou inativa.' using errcode = 'foreign_key_violation';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A ficha precisa de ao menos um ingrediente.' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(max(v.version_number), 0) + 1 into v_number
  from public.recipe_versions v where v.recipe_id = v_recipe.id;

  insert into public.recipe_versions (organization_id, recipe_id, version_number)
  values (v_org, v_recipe.id, v_number)
  returning id into v_version;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_ingredient := (v_item->>'ingredient_id')::uuid;
    v_qty := nullif(v_item->>'quantity', '')::numeric;
    v_split := coalesce(v_item->>'split_rule', 'metade');

    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 4) then
      raise exception 'Quantidade inválida em um ingrediente da ficha (maior que zero, até 4 casas).'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_split not in ('metade', 'inteira') then
      raise exception 'Regra de divisão inválida. Use metade ou inteira.' using errcode = 'invalid_parameter_value';
    end if;
    if v_ingredient = any(v_seen) then
      raise exception 'Ingrediente repetido na ficha. Some as quantidades em uma única linha.'
        using errcode = 'unique_violation';
    end if;
    if v_recipe.kind = 'preparo' and v_ingredient = v_recipe.output_ingredient_id then
      raise exception 'O preparo não pode consumir o próprio produto.' using errcode = 'check_violation';
    end if;
    v_seen := array_append(v_seen, v_ingredient);

    insert into public.recipe_items (organization_id, version_id, ingredient_id, quantity, split_rule)
    values (v_org, v_version, v_ingredient, v_qty, v_split);
  end loop;

  update public.recipe_versions set published = true where id = v_version;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, auth.uid(), 'recipe.published', 'recipe_version', v_version,
          jsonb_build_object('recipe_id', v_recipe.id, 'version', v_number));

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: produção de pizzas (um ou dois sabores)
-- ---------------------------------------------------------------------------

create function public.register_pizza_production(
  p_client_request_id uuid,
  p_product_a uuid,
  p_product_b uuid,
  p_pizzas integer,
  p_produced_on date,
  p_notes text
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
  v_size_a text;
  v_size_b text;
  v_version_a uuid;
  v_version_b uuid;
  v_order uuid;
  v_cost numeric;
  v_date date := coalesce(p_produced_on, current_date);
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'pizzaiolo']) then
    raise exception 'Seu perfil não pode registrar produção.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select o.id into v_existing from public.production_orders o
  where o.organization_id = v_org and o.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  if p_pizzas is null or p_pizzas < 1 or p_pizzas > 500 then
    raise exception 'Informe a quantidade de pizzas (de 1 a 500).' using errcode = 'invalid_parameter_value';
  end if;
  if v_date > current_date then
    raise exception 'A data da produção não pode ser futura.' using errcode = 'invalid_parameter_value';
  end if;

  select p.size into v_size_a from public.products p
  where p.id = p_product_a and p.organization_id = v_org and p.is_active;
  if not found then
    raise exception 'Sabor não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;

  if p_product_b is not null then
    if p_product_b = p_product_a then
      raise exception 'Meio a meio exige dois sabores diferentes.' using errcode = 'invalid_parameter_value';
    end if;
    select p.size into v_size_b from public.products p
    where p.id = p_product_b and p.organization_id = v_org and p.is_active;
    if not found then
      raise exception 'Segundo sabor não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
    end if;
    if v_size_a <> v_size_b then
      raise exception 'Os dois sabores precisam ter o mesmo tamanho.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  v_version_a := public.current_recipe_version(
    (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = p_product_a));
  if v_version_a is null then
    raise exception 'Este sabor não tem ficha técnica publicada. Publique a ficha antes de produzir.'
      using errcode = 'check_violation';
  end if;
  if p_product_b is not null then
    v_version_b := public.current_recipe_version(
      (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = p_product_b));
    if v_version_b is null then
      raise exception 'O segundo sabor não tem ficha técnica publicada.' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.production_orders (
    organization_id, client_request_id, kind, product_a_id, product_b_id,
    recipe_version_a_id, recipe_version_b_id, pizzas_quantity, produced_on, notes, created_by
  )
  values (
    v_org, p_client_request_id, 'pizza', p_product_a, p_product_b,
    v_version_a, v_version_b, p_pizzas, v_date, v_notes, v_user
  )
  returning id into v_order;

  create temp table if not exists _req (ingredient_id uuid primary key, quantity numeric not null) on commit drop;
  delete from _req;
  insert into _req (ingredient_id, quantity)
  select out_ingredient_id, out_quantity from public.pizza_requirements(v_version_a, v_version_b, p_pizzas);

  if exists (select 1 from _req where quantity <> round(quantity, 4)) then
    raise exception 'Uma quantidade da ficha ficou com mais de 4 casas decimais. Ajuste a ficha.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_cost := public._consume_requirements(v_org, v_order, v_user);

  update public.production_orders
  set total_cost = v_cost,
      unit_cost = round(v_cost / p_pizzas, 4)
  where id = v_order;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'production.pizza', 'production_order', v_order,
          jsonb_build_object('product_a', p_product_a, 'product_b', p_product_b,
                             'pizzas', p_pizzas, 'total_cost', v_cost));

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: produção de preparo por lote (molho, massa, etc.)
-- ---------------------------------------------------------------------------

create function public.register_preparation_batch(
  p_client_request_id uuid,
  p_recipe_id uuid,
  p_batches integer,
  p_actual_yield numeric,
  p_lot_code text,
  p_expires_on date,
  p_notes text
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
  v_recipe public.recipes%rowtype;
  v_output public.ingredients%rowtype;
  v_version uuid;
  v_order uuid;
  v_lot uuid;
  v_code text := btrim(coalesce(p_lot_code, ''));
  v_expected numeric;
  v_cost numeric;
  v_balance numeric;
  v_movement uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'pizzaiolo']) then
    raise exception 'Seu perfil não pode registrar produção de preparos.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select o.id into v_existing from public.production_orders o
  where o.organization_id = v_org and o.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  select * into v_recipe from public.recipes
  where id = p_recipe_id and organization_id = v_org and kind = 'preparo' and is_active;
  if not found then
    raise exception 'Preparo não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;

  v_version := public.current_recipe_version(v_recipe.id);
  if v_version is null then
    raise exception 'Este preparo não tem ficha publicada.' using errcode = 'check_violation';
  end if;

  if p_batches is null or p_batches < 1 or p_batches > 200 then
    raise exception 'Informe a quantidade de lotes (de 1 a 200).' using errcode = 'invalid_parameter_value';
  end if;
  if p_actual_yield is null or p_actual_yield <= 0 or p_actual_yield <> round(p_actual_yield, 4) then
    raise exception 'Informe o rendimento real obtido (maior que zero, até 4 casas).' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_code) not between 1 and 40 then
    raise exception 'Informe o lote do preparo (até 40 caracteres).' using errcode = 'invalid_parameter_value';
  end if;
  if p_expires_on is not null and p_expires_on < current_date then
    raise exception 'O preparo não pode nascer vencido. Informe uma validade futura.' using errcode = 'check_violation';
  end if;

  -- Lock the output ingredient too, so its balance and average cost stay consistent.
  select * into v_output from public.ingredients
  where id = v_recipe.output_ingredient_id and organization_id = v_org
  for update;

  v_expected := v_recipe.yield_quantity * p_batches;

  insert into public.production_orders (
    organization_id, client_request_id, kind, recipe_id, recipe_version_id,
    output_ingredient_id, batches, expected_yield, actual_yield, yield_loss, notes, created_by
  )
  values (
    v_org, p_client_request_id, 'preparo', v_recipe.id, v_version,
    v_output.id, p_batches, v_expected, p_actual_yield, v_expected - p_actual_yield, v_notes, v_user
  )
  returning id into v_order;

  create temp table if not exists _req (ingredient_id uuid primary key, quantity numeric not null) on commit drop;
  delete from _req;
  insert into _req (ingredient_id, quantity)
  select ri.ingredient_id, ri.quantity * i.consumption_to_stock_factor * p_batches
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.version_id = v_version;

  if exists (select 1 from _req where quantity <> round(quantity, 4)) then
    raise exception 'Uma quantidade do preparo ficou com mais de 4 casas decimais após a conversão. Ajuste a ficha.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_cost := public._consume_requirements(v_org, v_order, v_user);

  if exists (
    select 1 from public.inventory_lots l
    where l.ingredient_id = v_output.id and lower(btrim(l.lot_code)) = lower(v_code)
  ) then
    raise exception 'Já existe o lote % deste preparo.', v_code using errcode = 'unique_violation';
  end if;

  insert into public.inventory_lots (
    organization_id, ingredient_id, lot_code, received_on, manufactured_on, expires_on
  )
  values (v_org, v_output.id, v_code, current_date, current_date, p_expires_on)
  returning id into v_lot;

  select coalesce(sum(m.quantity_delta), 0) into v_balance
  from public.stock_movements m where m.ingredient_id = v_output.id;

  insert into public.stock_movements (
    organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
    balance_before, balance_after, reason, reference, idempotency_key, performed_by
  )
  values (
    v_org, v_output.id, v_lot, 'producao', p_actual_yield, v_output.stock_unit,
    v_balance, v_balance + p_actual_yield, 'Produção de preparo', 'producao:' || v_order,
    gen_random_uuid(), v_user
  )
  returning id into v_movement;

  -- Output valued at the cost of what went into it; average updated like a receipt.
  update public.ingredients
  set average_stock_unit_cost = round(
        (v_balance * average_stock_unit_cost + v_cost) / (v_balance + p_actual_yield), 4)
  where id = v_output.id;

  update public.production_orders
  set output_lot_id = v_lot,
      total_cost = v_cost,
      unit_cost = round(v_cost / p_actual_yield, 4)
  where id = v_order;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'production.preparo', 'production_order', v_order,
          jsonb_build_object('recipe_id', v_recipe.id, 'batches', p_batches,
                             'actual_yield', p_actual_yield, 'total_cost', v_cost, 'movement', v_movement));

  return v_order;
end;
$$;

revoke all on function public.create_product(text, text, text, text, numeric) from public, anon;
revoke all on function public.create_preparo_recipe(text, uuid, numeric) from public, anon;
revoke all on function public.publish_recipe_version(uuid, jsonb) from public, anon;
revoke all on function public.register_pizza_production(uuid, uuid, uuid, integer, date, text) from public, anon;
revoke all on function public.register_preparation_batch(uuid, uuid, integer, numeric, text, date, text) from public, anon;
grant execute on function public.create_product(text, text, text, text, numeric) to authenticated;
grant execute on function public.create_preparo_recipe(text, uuid, numeric) to authenticated;
grant execute on function public.publish_recipe_version(uuid, jsonb) to authenticated;
grant execute on function public.register_pizza_production(uuid, uuid, uuid, integer, date, text) to authenticated;
grant execute on function public.register_preparation_batch(uuid, uuid, integer, numeric, text, date, text) to authenticated;
