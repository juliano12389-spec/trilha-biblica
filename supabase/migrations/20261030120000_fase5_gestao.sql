-- Fase 5 — Gestão
--
-- Inventário físico com aprovação, perdas e desperdícios, custos por pizza, consumo teórico
-- x real, sugestão de compras e resumo do painel.
--
-- Regras:
--   * Contagem não altera saldo. Ela vira ajustes só quando um administrador aprova.
--     Divergência sempre exige motivo. Aprovação recalcula contra o saldo do momento da aprovação.
--   * Perda consome lotes pelo FEFO (ou de um lote escolhido), com custo estimado pelo custo médio.
--   * Todo ajuste e toda perda viram movimentos no livro, com motivo.
--   * Relatórios leem o livro e as fichas. Nada é fixo no código.

-- ---------------------------------------------------------------------------
-- Prazo de entrega do fornecedor (para sugestão de compras)
-- ---------------------------------------------------------------------------

alter table public.suppliers
  add column lead_time_days integer check (lead_time_days between 0 and 365);

create function public.set_supplier_lead_time(p_supplier uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  if v_org is null then
    raise exception 'Sessão sem organização.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode alterar fornecedores.' using errcode = 'insufficient_privilege';
  end if;
  update public.suppliers set lead_time_days = p_days
  where id = p_supplier and organization_id = v_org;
  if not found then
    raise exception 'Fornecedor não encontrado nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consumo FEFO compartilhado por perdas e ajustes de inventário
-- ---------------------------------------------------------------------------

-- Removes p_quantity from the ingredient, earliest expiry first (expired lots included:
-- they are physically there and must be counted out). With p_lot_id, only that lot.
-- Returns the estimated cost of what was removed. Caller must hold the ingredient lock.
create function public._remove_stock_fefo(
  p_org uuid,
  p_ingredient uuid,
  p_quantity numeric,
  p_lot_id uuid,
  p_movement_type text,
  p_reason text,
  p_reference text,
  p_user uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ing public.ingredients%rowtype;
  l record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_balance numeric;
  v_cost numeric := 0;
begin
  select * into v_ing from public.ingredients where id = p_ingredient;

  v_balance := (select coalesce(sum(m.quantity_delta), 0) from public.stock_movements m where m.ingredient_id = p_ingredient);

  for l in
    select b.lot_id, b.balance
    from public.inventory_lot_balances b
    where b.ingredient_id = p_ingredient
      and b.balance > 0
      and (p_lot_id is null or b.lot_id = p_lot_id)
    order by b.expires_on nulls last, b.received_on, b.lot_id
  loop
    exit when v_remaining <= 0;
    v_take := least(l.balance, v_remaining);

    insert into public.stock_movements (
      organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
      balance_before, balance_after, reason, reference, idempotency_key, performed_by
    )
    values (
      p_org, p_ingredient, l.lot_id, p_movement_type, -v_take, v_ing.stock_unit,
      v_balance, v_balance - v_take, p_reason, p_reference, gen_random_uuid(), p_user
    );

    v_cost := v_cost + round(v_take * v_ing.average_stock_unit_cost, 2);
    v_balance := v_balance - v_take;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Saldo insuficiente de %: faltam % %.', v_ing.name, trim_scale(v_remaining), v_ing.stock_unit
      using errcode = 'check_violation';
  end if;

  return v_cost;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perdas e desperdícios
-- ---------------------------------------------------------------------------

create table public.waste_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_request_id uuid not null,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  lot_id uuid references public.inventory_lots (id) on delete restrict,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit text not null references public.units_of_measure (code),
  reason text not null check (reason in (
    'vencimento', 'erro_preparo', 'derrubado', 'armazenamento_inadequado',
    'falha_equipamento', 'sobra_nao_aproveitavel', 'outros'
  )),
  cost_estimate numeric(14, 2) not null check (cost_estimate >= 0),
  notes text check (char_length(notes) <= 300),
  occurred_on date not null default current_date,
  registered_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint waste_records_org_request_key unique (organization_id, client_request_id)
);

create index waste_records_occurred_idx on public.waste_records (organization_id, occurred_on);

create function public.register_waste(
  p_client_request_id uuid,
  p_ingredient uuid,
  p_lot uuid,
  p_quantity numeric,
  p_reason text,
  p_notes text,
  p_occurred_on date
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
  v_ing public.ingredients%rowtype;
  v_cost numeric;
  v_balance numeric;
  v_available numeric;
  v_id uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'estoquista', 'pizzaiolo']) then
    raise exception 'Seu perfil não pode registrar perdas.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;
  if p_reason not in ('vencimento', 'erro_preparo', 'derrubado', 'armazenamento_inadequado',
                      'falha_equipamento', 'sobra_nao_aproveitavel', 'outros') then
    raise exception 'Motivo de perda inválido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4) then
    raise exception 'Informe uma quantidade maior que zero, com até 4 casas.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_occurred_on, current_date) > current_date then
    raise exception 'A data da perda não pode ser futura.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select w.id into v_existing from public.waste_records w
  where w.organization_id = v_org and w.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  select * into v_ing from public.ingredients i
  where i.id = p_ingredient and i.organization_id = v_org
  for update;
  if not found then
    raise exception 'Insumo não encontrado nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;

  if p_lot is not null and not exists (
    select 1 from public.inventory_lots l
    where l.id = p_lot and l.ingredient_id = v_ing.id and l.organization_id = v_org
  ) then
    raise exception 'Lote não pertence a este insumo.' using errcode = 'foreign_key_violation';
  end if;

  v_available := case
    when p_lot is null then public._available_stock_any(v_ing.id)
    else coalesce((select b.balance from public.inventory_lot_balances b where b.lot_id = p_lot), 0)
  end;
  if v_available < p_quantity then
    raise exception 'Saldo insuficiente para registrar a perda de %: disponível % %, informado % %.',
      v_ing.name, trim_scale(v_available), v_ing.stock_unit, trim_scale(p_quantity), v_ing.stock_unit
      using errcode = 'check_violation';
  end if;

  v_id := gen_random_uuid();
  v_cost := public._remove_stock_fefo(v_org, v_ing.id, p_quantity, p_lot, 'perda',
    'Perda: ' || p_reason, 'perda:' || v_id, v_user);

  insert into public.waste_records (
    id, organization_id, client_request_id, ingredient_id, lot_id, quantity, unit,
    reason, cost_estimate, notes, occurred_on, registered_by
  )
  values (
    v_id, v_org, p_client_request_id, v_ing.id, p_lot, p_quantity, v_ing.stock_unit,
    p_reason, v_cost, v_notes, coalesce(p_occurred_on, current_date), v_user
  );

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'waste.registered', 'waste_record', v_id,
          jsonb_build_object('ingredient', v_ing.name, 'quantity', p_quantity, 'reason', p_reason, 'cost', v_cost));

  return v_id;
end;
$$;

-- Total available across all lots (expired included), used for waste checks.
create function public._available_stock_any(p_ingredient uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(b.balance), 0)
  from public.inventory_lot_balances b
  where b.ingredient_id = p_ingredient and b.balance > 0;
$$;

-- ---------------------------------------------------------------------------
-- Inventário físico: contagem, aprovação e ajustes rastreáveis
-- ---------------------------------------------------------------------------

create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'aguardando_aprovacao'
    check (status in ('aguardando_aprovacao', 'aprovado', 'recusado')),
  notes text check (char_length(notes) <= 300),
  counted_by uuid not null default auth.uid() references auth.users (id),
  counted_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 300),
  net_difference_value numeric(14, 2) not null default 0,
  constraint stocktakes_org_request_key unique (organization_id, client_request_id),
  constraint stocktakes_decision_fields check (
    (status = 'aguardando_aprovacao' and decided_by is null)
    or (status <> 'aguardando_aprovacao' and decided_by is not null and decided_at is not null)
  )
);

create table public.stocktake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  stocktake_id uuid not null references public.stocktakes (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  system_quantity numeric(18, 4) not null,
  counted_quantity numeric(18, 4) not null check (counted_quantity >= 0),
  difference numeric(18, 4) not null,
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  financial_impact numeric(14, 2) not null,
  reason text check (char_length(reason) between 3 and 300),
  constraint stocktake_items_difference_consistent check (difference = counted_quantity - system_quantity),
  constraint stocktake_items_reason_required check (difference = 0 or reason is not null),
  constraint stocktake_items_unique unique (stocktake_id, ingredient_id)
);

-- p_items: [{ "ingredient_id", "counted", "reason"? }]. Items not listed were not counted.
create function public.submit_stocktake(p_client_request_id uuid, p_notes text, p_items jsonb)
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
  v_item jsonb;
  v_ing public.ingredients%rowtype;
  v_counted numeric;
  v_system numeric;
  v_diff numeric;
  v_reason text;
  v_net numeric(14, 2) := 0;
  v_impact numeric(14, 2);
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'estoquista']) then
    raise exception 'Seu perfil não pode registrar contagens.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Conte ao menos um insumo.' using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select s.id into v_existing from public.stocktakes s
  where s.organization_id = v_org and s.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  insert into public.stocktakes (organization_id, client_request_id, notes, counted_by)
  values (v_org, p_client_request_id, nullif(btrim(coalesce(p_notes, '')), ''), v_user)
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_ing from public.ingredients i
    where i.id = (v_item->>'ingredient_id')::uuid and i.organization_id = v_org and i.is_active
    for update;
    if not found then
      raise exception 'Insumo não encontrado ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
    end if;

    v_counted := nullif(v_item->>'counted', '')::numeric;
    if v_counted is null or v_counted < 0 or v_counted <> round(v_counted, 4) then
      raise exception 'Contagem inválida para %: informe zero ou mais, com até 4 casas.', v_ing.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_system := (select coalesce(sum(m.quantity_delta), 0) from public.stock_movements m where m.ingredient_id = v_ing.id);
    v_diff := v_counted - v_system;
    v_reason := nullif(btrim(coalesce(v_item->>'reason', '')), '');

    if v_diff <> 0 and (v_reason is null or char_length(v_reason) < 3) then
      raise exception 'Divergência de % (%): informe o motivo antes de submeter.', v_ing.name,
        trim_scale(v_diff) || ' ' || v_ing.stock_unit using errcode = 'check_violation';
    end if;

    v_impact := round(v_diff * v_ing.average_stock_unit_cost, 2);
    v_net := v_net + v_impact;

    insert into public.stocktake_items (
      organization_id, stocktake_id, ingredient_id, system_quantity, counted_quantity,
      difference, unit_cost, financial_impact, reason
    )
    values (v_org, v_id, v_ing.id, v_system, v_counted, v_diff, v_ing.average_stock_unit_cost, v_impact,
            case when v_diff = 0 then null else v_reason end);
  end loop;

  update public.stocktakes set net_difference_value = v_net where id = v_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'stocktake.submitted', 'stocktake', v_id, jsonb_build_object('net_value', v_net));

  return v_id;
end;
$$;

-- Admin only. Applies each difference against the balance at approval time, not the count-time snapshot.
create function public.approve_stocktake(p_stocktake uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_stock public.stocktakes%rowtype;
  v_item record;
  v_current numeric;
  v_adjust numeric;
  v_lot uuid;
  v_lot_code text := 'INV-' || to_char(current_date, 'YYYYMMDD');
  v_applied integer := 0;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador']) then
    raise exception 'Somente o administrador aprova ajustes de inventário.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select * into v_stock from public.stocktakes s
  where s.id = p_stocktake and s.organization_id = v_org
  for update;
  if not found then
    raise exception 'Contagem não encontrada nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;
  if v_stock.status <> 'aguardando_aprovacao' then
    raise exception 'Esta contagem já foi decidida.' using errcode = 'check_violation';
  end if;

  for v_item in
    select si.*, i.name as ingredient_name, i.stock_unit
    from public.stocktake_items si
    join public.ingredients i on i.id = si.ingredient_id
    where si.stocktake_id = v_stock.id
    order by si.id
  loop
    perform 1 from public.ingredients i where i.id = v_item.ingredient_id for update;

    v_current := (select coalesce(sum(m.quantity_delta), 0) from public.stock_movements m where m.ingredient_id = v_item.ingredient_id);
    v_adjust := v_item.counted_quantity - v_current;
    if v_adjust = 0 then
      continue;
    end if;

    if v_adjust < 0 then
      perform public._remove_stock_fefo(v_org, v_item.ingredient_id, -v_adjust, null,
        'ajuste_negativo', 'Inventário: ' || v_item.reason, 'inventario:' || v_stock.id, v_user);
    else
      select l.id into v_lot from public.inventory_lots l
      where l.ingredient_id = v_item.ingredient_id and l.organization_id = v_org
        and lower(btrim(l.lot_code)) = lower(v_lot_code);
      if not found then
        insert into public.inventory_lots (organization_id, ingredient_id, lot_code, received_on)
        values (v_org, v_item.ingredient_id, v_lot_code, current_date)
        returning id into v_lot;
      end if;

      insert into public.stock_movements (
        organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
        balance_before, balance_after, reason, reference, idempotency_key, performed_by
      )
      values (
        v_org, v_item.ingredient_id, v_lot, 'ajuste_positivo', v_adjust, v_item.stock_unit,
        v_current, v_current + v_adjust, 'Inventário: ' || v_item.reason,
        'inventario:' || v_stock.id, gen_random_uuid(), v_user
      );
    end if;
    v_applied := v_applied + 1;
  end loop;

  update public.stocktakes
  set status = 'aprovado', decided_by = v_user, decided_at = now(), decision_note = v_note
  where id = v_stock.id;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (v_org, v_user, 'stocktake.approved', 'stocktake', v_stock.id,
          jsonb_build_object('adjustments', v_applied, 'net_value', v_stock.net_difference_value));

  return v_applied;
end;
$$;

create function public.reject_stocktake(p_stocktake uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador']) then
    raise exception 'Somente o administrador decide sobre contagens.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_note) not between 3 and 300 then
    raise exception 'Informe o motivo da recusa (de 3 a 300 caracteres).' using errcode = 'invalid_parameter_value';
  end if;

  update public.stocktakes
  set status = 'recusado', decided_by = v_user, decided_at = now(), decision_note = v_note
  where id = p_stocktake and organization_id = v_org and status = 'aguardando_aprovacao';
  if not found then
    raise exception 'Contagem não encontrada ou já decidida.' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------------

-- Posição de estoque: saldo, custo médio e valor por insumo.
create view public.stock_position
with (security_invoker = true)
as
select
  i.id as ingredient_id,
  i.organization_id,
  i.sku,
  i.name,
  c.name as category_name,
  i.stock_unit as unit,
  i.minimum_stock,
  i.is_active,
  i.average_stock_unit_cost,
  coalesce(sum(m.quantity_delta), 0)::numeric(18, 4) as balance,
  round(coalesce(sum(m.quantity_delta), 0) * i.average_stock_unit_cost, 2)::numeric(14, 2) as stock_value
from public.ingredients i
join public.ingredient_categories c on c.id = i.category_id
left join public.stock_movements m on m.ingredient_id = i.id
group by i.id, c.name;

-- Custo de ingredientes de uma pizza inteira, pelo custo médio atual da ficha publicada.
-- Margem e percentual são calculados no app, a partir do preço do produto.
create function public.product_theoretical_cost(p_product uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(round(sum(ri.quantity * i.consumption_to_stock_factor * i.average_stock_unit_cost), 2), 0)
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.version_id = public.current_recipe_version(
    (select r.id from public.recipes r where r.kind = 'pizza' and r.product_id = p_product));
$$;

-- Consumo teórico no período: fichas x pizzas líquidas de produção, mais insumos de preparos.
-- Pizzas de venda canceladas no modo baixa na venda só contam o que não voltou ao estoque.
create function public.theoretical_consumption(p_from date, p_to date)
returns table (out_ingredient_id uuid, out_quantity numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with pizza_orders as (
    select o.recipe_version_a_id as va, o.recipe_version_b_id as vb,
           o.pizzas_quantity - coalesce(sum(case when s.status = 'cancelada' and s.sales_mode = 'baixa_na_venda'
                                                 then si.recovered_quantity else 0 end), 0) as net
    from public.production_orders o
    left join public.sale_items si on si.production_order_id = o.id
    left join public.sales s on s.id = si.sale_id
    where o.kind = 'pizza' and o.produced_on between p_from and p_to
    group by o.id
  ),
  pizza_part as (
    select r.out_ingredient_id, r.out_quantity
    from pizza_orders p
    cross join lateral public.pizza_requirements(p.va, p.vb, p.net::integer) r
    where p.net > 0
  ),
  preparo_part as (
    select ri.ingredient_id as out_ingredient_id, sum(ri.quantity * i.consumption_to_stock_factor * o.batches) as out_quantity
    from public.production_orders o
    join public.recipe_items ri on ri.version_id = o.recipe_version_id
    join public.ingredients i on i.id = ri.ingredient_id
    where o.kind = 'preparo' and o.produced_on between p_from and p_to
    group by ri.ingredient_id
  )
  select x.out_ingredient_id, sum(x.out_quantity)
  from (select * from pizza_part union all select * from preparo_part) x
  group by x.out_ingredient_id;
$$;

-- Consumo real no período: baixas de produção e de venda, líquidas das devoluções por cancelamento.
create function public.real_consumption(p_from date, p_to date)
returns table (out_ingredient_id uuid, out_quantity numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.ingredient_id, -sum(m.quantity_delta)
  from public.stock_movements m
  where m.movement_type in ('consumo_producao', 'estorno')
    and m.occurred_at::date between p_from and p_to
  group by m.ingredient_id;
$$;

-- Sugestão de compras: consumo diário real dos últimos 30 dias x (prazo do fornecedor + 7 dias de segurança),
-- mais o mínimo, menos o saldo atual. Só insumos com sugestão positiva.
create function public.reorder_suggestions()
returns table (
  out_ingredient_id uuid,
  out_name text,
  out_unit text,
  out_balance numeric,
  out_minimum numeric,
  out_daily_consumption numeric,
  out_lead_time_days integer,
  out_suggested numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with consumption as (
    select c.out_ingredient_id, c.out_quantity / 30 as daily
    from public.real_consumption(current_date - 30, current_date) c
  )
  select i.id, i.name, i.stock_unit,
         sp.balance, i.minimum_stock,
         round(coalesce(cons.daily, 0), 4),
         coalesce(s.lead_time_days, 0),
         round(greatest(
           coalesce(cons.daily, 0) * (coalesce(s.lead_time_days, 0) + 7) + i.minimum_stock - sp.balance,
           0), 4)
  from public.ingredients i
  join public.stock_position sp on sp.ingredient_id = i.id
  left join consumption cons on cons.out_ingredient_id = i.id
  left join public.suppliers s on s.id = i.supplier_id
  where i.is_active
    and greatest(coalesce(cons.daily, 0) * (coalesce(s.lead_time_days, 0) + 7) + i.minimum_stock - sp.balance, 0) > 0
  order by i.name;
$$;

-- Resumo do painel: valores e contagens do estado atual e do dia/mês.
create function public.dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'stock_value', coalesce((select sum(stock_value) from public.stock_position where is_active), 0),
    'active_ingredients', (select count(*) from public.ingredients where is_active),
    'below_minimum', (select count(*) from public.stock_position where is_active and balance < minimum_stock),
    'expiring_7d', (select count(*) from public.inventory_lot_balances
                     where balance > 0 and expires_on between current_date and current_date + 7),
    'expired', (select count(*) from public.inventory_lot_balances
                where balance > 0 and expires_on < current_date),
    'pizzas_produced_today', coalesce((select sum(pizzas_quantity) from public.production_orders
                                       where kind = 'pizza' and produced_on = current_date), 0),
    'pizzas_sold_today', coalesce((select sum(si.pizzas_quantity) from public.sale_items si
                                   join public.sales s on s.id = si.sale_id
                                   where s.status = 'confirmada' and s.sold_at::date = current_date), 0),
    'revenue_today', coalesce((select sum(total) from public.sales
                               where status = 'confirmada' and sold_at::date = current_date), 0),
    'waste_value_month', coalesce((select sum(cost_estimate) from public.waste_records
                                   where occurred_on >= date_trunc('month', current_date)::date), 0),
    'pending_stocktakes', (select count(*) from public.stocktakes where status = 'aguardando_aprovacao')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------

alter table public.waste_records enable row level security;
alter table public.stocktakes enable row level security;
alter table public.stocktake_items enable row level security;

create policy waste_records_select_own on public.waste_records
  for select to authenticated using (organization_id = public.current_organization_id());
create policy stocktakes_select_own on public.stocktakes
  for select to authenticated using (organization_id = public.current_organization_id());
create policy stocktake_items_select_own on public.stocktake_items
  for select to authenticated using (organization_id = public.current_organization_id());

revoke all on public.waste_records, public.stocktakes, public.stocktake_items from anon, authenticated;
grant select on public.waste_records, public.stocktakes, public.stocktake_items, public.stock_position to authenticated;

revoke all on function public._remove_stock_fefo(uuid, uuid, numeric, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public._available_stock_any(uuid) from public, anon, authenticated;
revoke all on function public.set_supplier_lead_time(uuid, integer) from public, anon;
revoke all on function public.register_waste(uuid, uuid, uuid, numeric, text, text, date) from public, anon;
revoke all on function public.submit_stocktake(uuid, text, jsonb) from public, anon;
revoke all on function public.approve_stocktake(uuid, text) from public, anon;
revoke all on function public.reject_stocktake(uuid, text) from public, anon;
revoke all on function public.product_theoretical_cost(uuid) from public, anon;
revoke all on function public.theoretical_consumption(date, date) from public, anon;
revoke all on function public.real_consumption(date, date) from public, anon;
revoke all on function public.reorder_suggestions() from public, anon;
revoke all on function public.dashboard_summary() from public, anon;

grant execute on function public.set_supplier_lead_time(uuid, integer) to authenticated;
grant execute on function public.register_waste(uuid, uuid, uuid, numeric, text, text, date) to authenticated;
grant execute on function public.submit_stocktake(uuid, text, jsonb) to authenticated;
grant execute on function public.approve_stocktake(uuid, text) to authenticated;
grant execute on function public.reject_stocktake(uuid, text) to authenticated;
grant execute on function public.product_theoretical_cost(uuid) to authenticated;
grant execute on function public.theoretical_consumption(date, date) to authenticated;
grant execute on function public.real_consumption(date, date) to authenticated;
grant execute on function public.reorder_suggestions() to authenticated;
grant execute on function public.dashboard_summary() to authenticated;
