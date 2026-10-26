-- Fase 4 — Vendas
--
-- Pedidos e vendas por canal, dois modos operacionais, cancelamento com recuperação
-- e estoque de pizzas prontas (modo baixa na produção).
--
-- Modos (organization_settings.sales_mode):
--   * baixa_na_venda: a venda baixa os ingredientes pela ficha. Produção avulsa de pizzas é bloqueada.
--   * baixa_na_producao (padrão): a produção baixa os ingredientes e gera pizzas prontas.
--     A venda consome só as pizzas prontas e nunca baixa ingredientes de novo.
--
-- Regras:
--   * Cancelamento devolve só o que for marcado como recuperado.
--     Modo baixa_na_venda: devolve a fração recuperada de cada consumo, nos mesmos lotes.
--     Modo baixa_na_producao: devolve pizzas prontas recuperadas. Ingredientes nunca voltam.
--   * Venda e cancelamento são idempotentes por identificador da solicitação. Pedidos de canal
--     externo também são idempotentes pelo identificador externo.
--   * Número de pedido é sequencial por pizzaria.

-- ---------------------------------------------------------------------------
-- Modo operacional
-- ---------------------------------------------------------------------------

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  sales_mode text not null default 'baixa_na_producao'
    check (sales_mode in ('baixa_na_venda', 'baixa_na_producao')),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

-- Missing row = default mode. Used by triggers and RPCs.
create function public.sales_mode_of(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.sales_mode from public.organization_settings s where s.organization_id = p_org),
    'baixa_na_producao'
  );
$$;

-- ---------------------------------------------------------------------------
-- Estoque de pizzas prontas (ledger imutável)
-- ---------------------------------------------------------------------------

create table public.finished_goods_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  product_a_id uuid not null references public.products (id) on delete restrict,
  -- null = pizza de um sabor só. Meio a meio fica separado por par de sabores.
  product_b_id uuid references public.products (id) on delete restrict,
  movement_type text not null check (movement_type in ('producao', 'venda', 'cancelamento_recuperado')),
  quantity_delta integer not null check (quantity_delta <> 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  constraint finished_goods_balance_consistent check (balance_after = balance_before + quantity_delta),
  reference text check (char_length(reference) <= 120),
  performed_by uuid not null default auth.uid() references auth.users (id),
  occurred_at timestamptz not null default now()
);

create index finished_goods_movements_pair_idx
  on public.finished_goods_movements (organization_id, product_a_id, product_b_id);

create trigger finished_goods_movements_immutable_trg
  before update or delete on public.finished_goods_movements
  for each row execute function public.reject_ledger_mutation();

create view public.finished_goods_balances
with (security_invoker = true)
as
select
  f.organization_id,
  f.product_a_id,
  f.product_b_id,
  sum(f.quantity_delta)::integer as balance
from public.finished_goods_movements f
group by f.organization_id, f.product_a_id, f.product_b_id;

-- ---------------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------------

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_request_id uuid not null,
  sale_number integer not null check (sale_number > 0),
  channel text not null check (channel in ('balcao', 'telefone', 'whatsapp', 'delivery', 'outro')),
  external_id text check (char_length(external_id) between 1 and 80),
  payment_method text check (payment_method in ('dinheiro', 'pix', 'cartao', 'outro')),
  status text not null default 'confirmada' check (status in ('confirmada', 'cancelada')),
  sales_mode text not null check (sales_mode in ('baixa_na_venda', 'baixa_na_producao')),
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  total numeric(14, 2) not null check (total >= 0),
  check (discount_amount <= subtotal),
  check (total = subtotal - discount_amount),
  notes text check (char_length(notes) <= 300),
  sold_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  cancel_reason text check (char_length(cancel_reason) <= 300),
  constraint sales_org_request_key unique (organization_id, client_request_id),
  constraint sales_org_number_key unique (organization_id, sale_number)
);

create unique index sales_external_key
  on public.sales (organization_id, channel, external_id)
  where external_id is not null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_a_id uuid not null references public.products (id) on delete restrict,
  product_b_id uuid references public.products (id) on delete restrict,
  recipe_version_a_id uuid references public.recipe_versions (id) on delete restrict,
  recipe_version_b_id uuid references public.recipe_versions (id) on delete restrict,
  pizzas_quantity integer not null check (pizzas_quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  -- Only in baixa_na_venda: the production order that consumed the ingredients for this line.
  production_order_id uuid references public.production_orders (id) on delete restrict,
  cost_total numeric(14, 2) not null default 0 check (cost_total >= 0),
  recovered_quantity integer not null default 0,
  constraint sale_items_recovered_range check (recovered_quantity between 0 and pizzas_quantity)
);

create index sale_items_sale_idx on public.sale_items (sale_id);

-- Link the production orders created by sales (baixa na venda) back to their sale line.
alter table public.production_orders
  add column sale_item_id uuid references public.sale_items (id) on delete restrict;

alter table public.production_consumptions
  add column reversed_quantity numeric(18, 4) not null default 0,
  add constraint production_consumptions_reversed_range
    check (reversed_quantity >= 0 and reversed_quantity <= quantity);

-- ---------------------------------------------------------------------------
-- Triggers ligados aos modos
-- ---------------------------------------------------------------------------

create function public.guard_production_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'pizza' and new.sale_item_id is null
     and public.sales_mode_of(new.organization_id) = 'baixa_na_venda' then
    raise exception 'No modo baixa na venda, os ingredientes são baixados na venda, não na produção. Registre a venda.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger production_orders_mode_guard_trg
  before insert on public.production_orders
  for each row execute function public.guard_production_mode();

create function public.record_finished_goods_production()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if new.kind = 'pizza' and new.sale_item_id is null
     and public.sales_mode_of(new.organization_id) = 'baixa_na_producao' then
    select coalesce(sum(f.quantity_delta), 0)::integer into v_balance
    from public.finished_goods_movements f
    where f.organization_id = new.organization_id
      and f.product_a_id = new.product_a_id
      and f.product_b_id is not distinct from new.product_b_id;

    insert into public.finished_goods_movements (
      organization_id, product_a_id, product_b_id, movement_type, quantity_delta,
      balance_before, balance_after, reference, performed_by
    )
    values (
      new.organization_id, new.product_a_id, new.product_b_id, 'producao', new.pizzas_quantity,
      v_balance, v_balance + new.pizzas_quantity, 'producao:' || new.id, new.created_by
    );
  end if;
  return new;
end;
$$;

create trigger production_orders_finished_goods_trg
  after insert on public.production_orders
  for each row execute function public.record_finished_goods_production();

-- ---------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------

alter table public.organization_settings enable row level security;
alter table public.finished_goods_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy organization_settings_select_own on public.organization_settings
  for select to authenticated using (organization_id = public.current_organization_id());
create policy finished_goods_movements_select_own on public.finished_goods_movements
  for select to authenticated using (organization_id = public.current_organization_id());
create policy sales_select_own on public.sales
  for select to authenticated using (organization_id = public.current_organization_id());
create policy sale_items_select_own on public.sale_items
  for select to authenticated using (organization_id = public.current_organization_id());

revoke all on public.organization_settings, public.finished_goods_movements, public.sales, public.sale_items
  from anon, authenticated;
grant select on public.organization_settings, public.finished_goods_movements, public.sales, public.sale_items,
  public.finished_goods_balances
to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: modo operacional
-- ---------------------------------------------------------------------------

create function public.set_sales_mode(p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_open_stock integer;
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador']) then
    raise exception 'Somente o administrador pode alterar o modo de vendas.' using errcode = 'insufficient_privilege';
  end if;
  if p_mode not in ('baixa_na_venda', 'baixa_na_producao') then
    raise exception 'Modo inválido. Use baixa_na_venda ou baixa_na_producao.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  if p_mode = 'baixa_na_venda' then
    -- Pizzas prontas would be orphaned: they can only be sold under baixa_na_producao.
    select coalesce(sum(b.balance), 0)::integer into v_open_stock from public.finished_goods_balances b
    where b.organization_id = v_org;
    if v_open_stock > 0 then
      raise exception 'Há % pizzas prontas em estoque. Venda ou descarte-as antes de mudar para baixa na venda.', v_open_stock
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.organization_settings (organization_id, sales_mode, updated_by, updated_at)
  values (v_org, p_mode, v_user, now())
  on conflict (organization_id) do update
    set sales_mode = excluded.sales_mode, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'sales_mode.changed', 'organization', v_org, jsonb_build_object('mode', p_mode));

  return p_mode;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: registrar venda
-- ---------------------------------------------------------------------------

-- p_items: [{ "product_a", "product_b"?, "pizzas" }]
create function public.register_sale(
  p_client_request_id uuid,
  p_channel text,
  p_external_id text,
  p_items jsonb,
  p_discount numeric,
  p_payment_method text,
  p_notes text,
  p_sold_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_mode text := public.sales_mode_of(v_org);
  v_ext text := nullif(btrim(coalesce(p_external_id, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_discount numeric(14, 2) := coalesce(p_discount, 0);
  v_existing uuid;
  v_sale uuid;
  v_number integer;
  v_item jsonb;
  v_a uuid;
  v_b uuid;
  v_pizzas integer;
  v_size_a text;
  v_size_b text;
  v_price_a numeric(14, 2);
  v_price_b numeric(14, 2);
  v_unit numeric(14, 2);
  v_version_a uuid;
  v_version_b uuid;
  v_item_id uuid;
  v_order uuid;
  v_cost numeric;
  v_subtotal numeric(14, 2) := 0;
  v_balance integer;
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'atendente']) then
    raise exception 'Seu perfil não pode registrar vendas.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;
  if p_channel not in ('balcao', 'telefone', 'whatsapp', 'delivery', 'outro') then
    raise exception 'Canal de venda inválido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_payment_method is not null and p_payment_method not in ('dinheiro', 'pix', 'cartao', 'outro') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa de ao menos um item.' using errcode = 'invalid_parameter_value';
  end if;
  if v_discount < 0 then
    raise exception 'O desconto não pode ser negativo.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  -- Idempotency: the same request, or the same external order from a delivery platform.
  select s.id into v_existing from public.sales s
  where s.organization_id = v_org and s.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;
  if v_ext is not null then
    select s.id into v_existing from public.sales s
    where s.organization_id = v_org and s.channel = p_channel and s.external_id = v_ext;
    if found then
      return v_existing;
    end if;
  end if;

  select coalesce(max(s.sale_number), 0) + 1 into v_number
  from public.sales s where s.organization_id = v_org;

  insert into public.sales (
    organization_id, client_request_id, sale_number, channel, external_id, payment_method,
    status, sales_mode, subtotal, discount_amount, total, notes, sold_at, created_by
  )
  values (
    v_org, p_client_request_id, v_number, p_channel, v_ext, p_payment_method,
    'confirmada', v_mode, 0, 0, 0, v_notes, coalesce(p_sold_at, now()), v_user
  )
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_a := (v_item->>'product_a')::uuid;
    v_b := nullif(v_item->>'product_b', '')::uuid;
    v_pizzas := nullif(v_item->>'pizzas', '')::integer;
    if v_pizzas is null or v_pizzas < 1 or v_pizzas > 500 then
      raise exception 'Quantidade de pizzas inválida (de 1 a 500).' using errcode = 'invalid_parameter_value';
    end if;

    select p.size, p.sale_price into v_size_a, v_price_a
    from public.products p
    where p.id = v_a and p.organization_id = v_org and p.is_active;
    if not found then
      raise exception 'Sabor não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
    end if;

    if v_b is not null then
      if v_b = v_a then
        raise exception 'Meio a meio exige dois sabores diferentes.' using errcode = 'invalid_parameter_value';
      end if;
      select p.size, p.sale_price into v_size_b, v_price_b
      from public.products p
      where p.id = v_b and p.organization_id = v_org and p.is_active;
      if not found then
        raise exception 'Segundo sabor não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
      end if;
      if v_size_a <> v_size_b then
        raise exception 'Os dois sabores precisam ter o mesmo tamanho.' using errcode = 'invalid_parameter_value';
      end if;
      -- Meio a meio é vendido pela média dos dois sabores, arredondada a centavos.
      v_unit := round((v_price_a + v_price_b) / 2, 2);
    else
      v_unit := v_price_a;
    end if;

    v_version_a := public.current_recipe_version(
      (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = v_a));
    if v_version_a is null then
      raise exception 'Este sabor não tem ficha técnica publicada.' using errcode = 'check_violation';
    end if;
    if v_b is not null then
      v_version_b := public.current_recipe_version(
        (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = v_b));
      if v_version_b is null then
        raise exception 'O segundo sabor não tem ficha técnica publicada.' using errcode = 'check_violation';
      end if;
    else
      v_version_b := null;
    end if;

    insert into public.sale_items (
      organization_id, sale_id, product_a_id, product_b_id, recipe_version_a_id, recipe_version_b_id,
      pizzas_quantity, unit_price, line_total
    )
    values (
      v_org, v_sale, v_a, v_b, v_version_a, v_version_b, v_pizzas, v_unit, v_unit * v_pizzas
    )
    returning id into v_item_id;

    v_subtotal := v_subtotal + v_unit * v_pizzas;

    if v_mode = 'baixa_na_venda' then
      -- The sale consumes ingredients through the same FEFO engine as production.
      insert into public.production_orders (
        organization_id, client_request_id, kind, product_a_id, product_b_id,
        recipe_version_a_id, recipe_version_b_id, pizzas_quantity, produced_on,
        notes, created_by, sale_item_id
      )
      values (
        v_org, gen_random_uuid(), 'pizza', v_a, v_b,
        v_version_a, v_version_b, v_pizzas, current_date,
        'Venda ' || v_number, v_user, v_item_id
      )
      returning id into v_order;

      create temp table if not exists _req (ingredient_id uuid primary key, quantity numeric not null) on commit drop;
      delete from _req;
      insert into _req (ingredient_id, quantity)
      select out_ingredient_id, out_quantity from public.pizza_requirements(v_version_a, v_version_b, v_pizzas);

      if exists (select 1 from _req where quantity <> round(quantity, 4)) then
        raise exception 'Uma quantidade da ficha ficou com mais de 4 casas decimais. Ajuste a ficha.'
          using errcode = 'invalid_parameter_value';
      end if;

      v_cost := public._consume_requirements(v_org, v_order, v_user);

      update public.production_orders
      set total_cost = v_cost, unit_cost = round(v_cost / v_pizzas, 4)
      where id = v_order;

      update public.sale_items
      set production_order_id = v_order, cost_total = v_cost
      where id = v_item_id;
    else
      -- baixa_na_producao: the sale takes finished pizzas, never ingredients.
      select coalesce(sum(f.quantity_delta), 0)::integer into v_balance
      from public.finished_goods_movements f
      where f.organization_id = v_org
        and f.product_a_id = v_a
        and f.product_b_id is not distinct from v_b;

      if v_balance < v_pizzas then
        raise exception 'Pizzas prontas insuficientes para este pedido: disponível %, pedido %.',
          v_balance, v_pizzas
          using errcode = 'check_violation';
      end if;

      insert into public.finished_goods_movements (
        organization_id, product_a_id, product_b_id, movement_type, quantity_delta,
        balance_before, balance_after, reference, performed_by
      )
      values (
        v_org, v_a, v_b, 'venda', -v_pizzas,
        v_balance, v_balance - v_pizzas, 'venda:' || v_number, v_user
      );
    end if;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'O desconto não pode ser maior que o subtotal (%).', v_subtotal
      using errcode = 'check_violation';
  end if;

  update public.sales
  set subtotal = v_subtotal,
      discount_amount = v_discount,
      total = v_subtotal - v_discount
  where id = v_sale;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'sale.registered', 'sale', v_sale,
          jsonb_build_object('number', v_number, 'channel', p_channel, 'total', v_subtotal - v_discount, 'mode', v_mode));

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar venda (com recuperação)
-- ---------------------------------------------------------------------------

-- p_recovered: [{ "item_id", "recovered" }]. Items not listed recover nothing.
create function public.cancel_sale(p_sale_id uuid, p_reason text, p_recovered jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_c record;
  v_recovered integer;
  v_qty numeric;
  v_ing_balance numeric;
  v_balance integer;
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode cancelar vendas.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'Informe o motivo do cancelamento (de 3 a 300 caracteres).' using errcode = 'invalid_parameter_value';
  end if;
  if p_recovered is not null and jsonb_typeof(p_recovered) is distinct from 'array' then
    raise exception 'Itens recuperados devem ser uma lista.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select * into v_sale from public.sales s
  where s.id = p_sale_id and s.organization_id = v_org;
  if not found then
    raise exception 'Venda não encontrada nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;
  if v_sale.status <> 'confirmada' then
    raise exception 'Esta venda já foi cancelada.' using errcode = 'check_violation';
  end if;

  for v_item in select * from public.sale_items i where i.sale_id = v_sale.id order by i.id loop
    v_recovered := coalesce((
      select (x->>'recovered')::integer
      from jsonb_array_elements(coalesce(p_recovered, '[]'::jsonb)) x
      where (x->>'item_id')::uuid = v_item.id
    ), 0);
    if v_recovered < 0 or v_recovered > v_item.pizzas_quantity then
      raise exception 'Recuperadas fora do intervalo: até % pizzas neste item.', v_item.pizzas_quantity
        using errcode = 'invalid_parameter_value';
    end if;

    if v_recovered > 0 and v_sale.sales_mode = 'baixa_na_venda' and v_item.production_order_id is not null then
      -- Return the recovered share of every consumption, into the same lot it came from.
      for v_c in
        select c.id, c.ingredient_id, c.lot_id, c.quantity, c.reversed_quantity, i.stock_unit
        from public.production_consumptions c
        join public.ingredients i on i.id = c.ingredient_id
        where c.production_order_id = v_item.production_order_id
          and c.quantity > c.reversed_quantity
        order by c.id
      loop
        v_qty := least(
          round(v_c.quantity * v_recovered / v_item.pizzas_quantity, 4),
          v_c.quantity - v_c.reversed_quantity
        );
        if v_qty > 0 then
          select coalesce(sum(m.quantity_delta), 0) into v_ing_balance
          from public.stock_movements m where m.ingredient_id = v_c.ingredient_id;

          insert into public.stock_movements (
            organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
            balance_before, balance_after, reason, reference, idempotency_key, performed_by
          )
          values (
            v_org, v_c.ingredient_id, v_c.lot_id, 'estorno', v_qty, v_c.stock_unit,
            v_ing_balance, v_ing_balance + v_qty, 'Devolução de pizza recuperada de venda cancelada',
            'venda:' || v_sale.sale_number, gen_random_uuid(), v_user
          );

          update public.production_consumptions
          set reversed_quantity = reversed_quantity + v_qty
          where id = v_c.id;
        end if;
      end loop;
    end if;

    if v_recovered > 0 and v_sale.sales_mode = 'baixa_na_producao' then
      -- Intact pizzas go back on the shelf. Ingredients are never returned.
      select coalesce(sum(f.quantity_delta), 0)::integer into v_balance
      from public.finished_goods_movements f
      where f.organization_id = v_org
        and f.product_a_id = v_item.product_a_id
        and f.product_b_id is not distinct from v_item.product_b_id;

      insert into public.finished_goods_movements (
        organization_id, product_a_id, product_b_id, movement_type, quantity_delta,
        balance_before, balance_after, reference, performed_by
      )
      values (
        v_org, v_item.product_a_id, v_item.product_b_id, 'cancelamento_recuperado', v_recovered,
        v_balance, v_balance + v_recovered, 'venda_cancelada:' || v_sale.sale_number, v_user
      );
    end if;

    update public.sale_items set recovered_quantity = v_recovered where id = v_item.id;
  end loop;

  update public.sales
  set status = 'cancelada', cancelled_at = now(), cancelled_by = v_user, cancel_reason = v_reason
  where id = v_sale.id;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'sale.cancelled', 'sale', v_sale.id,
          jsonb_build_object('number', v_sale.sale_number, 'reason', v_reason, 'mode', v_sale.sales_mode));

  return v_sale.id;
end;
$$;

revoke all on function public.sales_mode_of(uuid) from public, anon, authenticated;
revoke all on function public.set_sales_mode(text) from public, anon;
revoke all on function public.register_sale(uuid, text, text, jsonb, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.cancel_sale(uuid, text, jsonb) from public, anon;
grant execute on function public.set_sales_mode(text) to authenticated;
grant execute on function public.register_sale(uuid, text, text, jsonb, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.cancel_sale(uuid, text, jsonb) to authenticated;
