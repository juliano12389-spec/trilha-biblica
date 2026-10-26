-- Fase 2 — Estoque
--
-- Lotes com validade, recebimentos com nota fiscal, ajustes por lote e custo médio.
--
-- Regras desta migração:
--   * Todo movimento de estoque pertence a um lote (validado por trigger).
--   * Recebimento e ajuste são transacionais e bloqueiam o insumo com FOR UPDATE.
--   * Lote vencido não recebe entrada. Baixa de lote vencido é registrada como 'vencimento'.
--   * Mesma nota fiscal não pode ser registrada duas vezes para o mesmo fornecedor.
--   * Reenvio com o mesmo identificador de solicitação não cria nada novo.

-- ---------------------------------------------------------------------------
-- Custo médio no insumo (por unidade de estoque)
-- ---------------------------------------------------------------------------

alter table public.ingredients
  add column average_stock_unit_cost numeric(14, 4) not null default 0
    check (average_stock_unit_cost >= 0);

-- ---------------------------------------------------------------------------
-- Recebimentos
-- ---------------------------------------------------------------------------

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_request_id uuid not null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  document_number text check (char_length(btrim(document_number)) between 1 and 40),
  received_on date not null default current_date,
  notes text check (char_length(notes) <= 300),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  received_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint goods_receipts_org_request_key unique (organization_id, client_request_id)
);

create unique index goods_receipts_document_key
  on public.goods_receipts (organization_id, supplier_id, lower(btrim(document_number)))
  where document_number is not null;

-- ---------------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------------

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  lot_code text not null check (char_length(btrim(lot_code)) between 1 and 40),
  supplier_id uuid references public.suppliers (id) on delete restrict,
  receipt_id uuid references public.goods_receipts (id) on delete restrict,
  received_on date not null default current_date,
  manufactured_on date,
  -- null = validade não informada
  expires_on date,
  check (manufactured_on is null or expires_on is null or manufactured_on <= expires_on),
  created_at timestamptz not null default now()
);

create unique index inventory_lots_code_key
  on public.inventory_lots (organization_id, ingredient_id, lower(btrim(lot_code)));

create index inventory_lots_fefo_idx
  on public.inventory_lots (organization_id, ingredient_id, expires_on);

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  receipt_id uuid not null references public.goods_receipts (id) on delete restrict,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  lot_id uuid not null unique references public.inventory_lots (id) on delete restrict,
  purchase_unit text not null references public.units_of_measure (code),
  purchase_quantity numeric(18, 4) not null check (purchase_quantity > 0),
  purchase_unit_cost numeric(14, 4) not null check (purchase_unit_cost >= 0),
  total_cost numeric(14, 2) not null check (total_cost >= 0),
  stock_quantity numeric(18, 4) not null check (stock_quantity > 0),
  created_at timestamptz not null default now()
);

create index goods_receipt_items_receipt_idx on public.goods_receipt_items (receipt_id);

-- ---------------------------------------------------------------------------
-- Movimentos passam a exigir lote
-- ---------------------------------------------------------------------------

alter table public.stock_movements
  add column lot_id uuid references public.inventory_lots (id) on delete restrict;

create index stock_movements_lot_idx on public.stock_movements (lot_id);

create function public.validate_stock_movement_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lot_id is null then
    raise exception 'Movimento precisa estar vinculado a um lote'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from public.inventory_lots l
    where l.id = new.lot_id
      and l.ingredient_id = new.ingredient_id
      and l.organization_id = new.organization_id
  ) then
    raise exception 'Lote não pertence ao insumo ou à organização do movimento'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger stock_movements_validate_row_trg
  before insert on public.stock_movements
  for each row execute function public.validate_stock_movement_row();

-- ---------------------------------------------------------------------------
-- Saldo por lote (derivado do livro, como o saldo do insumo)
-- ---------------------------------------------------------------------------

create view public.inventory_lot_balances
with (security_invoker = true)
as
select
  l.id as lot_id,
  l.organization_id,
  l.ingredient_id,
  l.lot_code,
  l.supplier_id,
  l.received_on,
  l.manufactured_on,
  l.expires_on,
  i.stock_unit as unit,
  coalesce(sum(m.quantity_delta), 0)::numeric(18, 4) as balance
from public.inventory_lots l
join public.ingredients i on i.id = l.ingredient_id
left join public.stock_movements m on m.lot_id = l.id
group by l.id, i.stock_unit;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.inventory_lots enable row level security;

create policy goods_receipts_select_own on public.goods_receipts
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy goods_receipt_items_select_own on public.goods_receipt_items
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy inventory_lots_select_own on public.inventory_lots
  for select to authenticated
  using (organization_id = public.current_organization_id());

-- Supabase grants new tables to anon/authenticated by default, so revoke first.
revoke all on public.goods_receipts, public.goods_receipt_items, public.inventory_lots
  from anon, authenticated;
grant select on public.goods_receipts, public.goods_receipt_items, public.inventory_lots,
  public.inventory_lot_balances
to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: criar insumo (agora também cria o lote de saldo inicial)
-- ---------------------------------------------------------------------------

create or replace function public.create_ingredient(
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
  v_lot uuid;
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
    minimum_stock, maximum_stock, purchase_unit_cost, average_stock_unit_cost,
    storage_location, shelf_life_days, created_by
  )
  values (
    v_org, p_client_request_id, btrim(p_sku), btrim(p_name), p_category_id, p_supplier_id,
    p_purchase_unit, p_stock_unit, p_consumption_unit,
    p_purchase_to_stock_factor, p_consumption_to_stock_factor,
    coalesce(p_minimum_stock, 0), p_maximum_stock, coalesce(p_purchase_unit_cost, 0),
    -- The opening balance is valued at the acquisition cost, per stock unit.
    round(coalesce(p_purchase_unit_cost, 0) / p_purchase_to_stock_factor, 4),
    nullif(btrim(coalesce(p_storage_location, '')), ''), p_shelf_life_days, v_user
  )
  returning id into v_id;

  if v_opening > 0 then
    -- Sem validade informada: não há data para inventar.
    insert into public.inventory_lots (organization_id, ingredient_id, lot_code, received_on)
    values (v_org, v_id, 'SALDO-INICIAL', current_date)
    returning id into v_lot;

    insert into public.stock_movements (
      organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
      balance_before, balance_after, reason, idempotency_key, performed_by
    )
    values (
      v_org, v_id, v_lot, 'saldo_inicial', v_opening, p_stock_unit,
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

-- ---------------------------------------------------------------------------
-- RPC: registrar recebimento (nota fiscal + itens + lotes + movimentos)
-- ---------------------------------------------------------------------------

-- p_items: [{ "ingredient_id", "quantity", "unit_cost", "lot_code",
--             "manufactured_on"?, "expires_on"? }]
-- quantity and unit_cost are in the ingredient's PURCHASE unit.
create function public.register_goods_receipt(
  p_client_request_id uuid,
  p_supplier_id uuid,
  p_document_number text,
  p_received_on date,
  p_notes text,
  p_items jsonb
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
  v_receipt uuid;
  v_received_on date := coalesce(p_received_on, current_date);
  v_document text := nullif(btrim(coalesce(p_document_number, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_item jsonb;
  v_ingredient public.ingredients%rowtype;
  v_qty numeric;
  v_unit_cost numeric;
  v_lot_code text;
  v_manufactured date;
  v_expires date;
  v_stock_qty numeric;
  v_total numeric(14, 2);
  v_balance numeric;
  v_avg numeric;
  v_lot uuid;
  v_receipt_total numeric(14, 2) := 0;
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente', 'estoquista']) then
    raise exception 'Seu perfil não pode registrar recebimentos.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;

  -- Serialises receipts per organization so the duplicate checks below cannot race.
  perform 1 from public.organizations where id = v_org for update;

  select r.id into v_existing
  from public.goods_receipts r
  where r.organization_id = v_org and r.client_request_id = p_client_request_id;
  if found then
    return v_existing;
  end if;

  if v_received_on > current_date then
    raise exception 'A data do recebimento não pode ser futura.' using errcode = 'invalid_parameter_value';
  end if;
  if p_supplier_id is null or not exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id and s.organization_id = v_org and s.is_active
  ) then
    raise exception 'Fornecedor inválido ou inativo nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um item no recebimento.' using errcode = 'invalid_parameter_value';
  end if;
  if v_document is not null and exists (
    select 1 from public.goods_receipts r
    where r.organization_id = v_org
      and r.supplier_id = p_supplier_id
      and lower(btrim(r.document_number)) = lower(v_document)
  ) then
    raise exception 'Esta nota fiscal já foi registrada para este fornecedor.' using errcode = 'unique_violation';
  end if;

  -- Lock every ingredient in a fixed order before touching balances.
  perform 1
  from public.ingredients i
  where i.organization_id = v_org
    and i.id in (select (x->>'ingredient_id')::uuid from jsonb_array_elements(p_items) x)
  order by i.id
  for update;

  insert into public.goods_receipts (
    organization_id, client_request_id, supplier_id, document_number, received_on, notes, received_by
  )
  values (v_org, p_client_request_id, p_supplier_id, v_document, v_received_on, v_notes, v_user)
  returning id into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_ingredient
    from public.ingredients i
    where i.id = (v_item->>'ingredient_id')::uuid and i.organization_id = v_org;
    if not found then
      raise exception 'Insumo não encontrado nesta pizzaria.' using errcode = 'foreign_key_violation';
    end if;
    if not v_ingredient.is_active then
      raise exception 'O insumo % está inativo.', v_ingredient.name using errcode = 'check_violation';
    end if;

    v_qty := nullif(v_item->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 4) then
      raise exception 'Quantidade inválida para %. Use um valor maior que zero, com até 4 casas.', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_unit_cost := nullif(v_item->>'unit_cost', '')::numeric;
    if v_unit_cost is null or v_unit_cost < 0 or v_unit_cost <> round(v_unit_cost, 4) then
      raise exception 'Custo inválido para %. Informe zero ou mais, com até 4 casas.', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_lot_code := btrim(coalesce(v_item->>'lot_code', ''));
    if char_length(v_lot_code) not between 1 and 40 then
      raise exception 'Informe o lote de % (até 40 caracteres).', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_manufactured := nullif(v_item->>'manufactured_on', '')::date;
    v_expires := nullif(v_item->>'expires_on', '')::date;

    if v_ingredient.shelf_life_days is not null and v_expires is null then
      raise exception 'Informe a validade do lote de % (este insumo controla validade).', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;
    if v_expires is not null and v_expires < current_date then
      raise exception '% chega vencido (validade %). O recebimento foi bloqueado.',
        v_ingredient.name, to_char(v_expires, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    if v_manufactured is not null and v_manufactured > current_date then
      raise exception 'A data de fabricação de % não pode ser futura.', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;
    if v_manufactured is not null and v_expires is not null and v_manufactured > v_expires then
      raise exception 'Fabricação posterior à validade no lote de %.', v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_stock_qty := v_qty * v_ingredient.purchase_to_stock_factor;
    if v_stock_qty <> round(v_stock_qty, 4) then
      raise exception 'A quantidade convertida de % tem mais de 4 casas decimais. Ajuste a quantidade.',
        v_ingredient.name
        using errcode = 'invalid_parameter_value';
    end if;

    v_total := round(v_qty * v_unit_cost, 2);

    select coalesce(sum(m.quantity_delta), 0) into v_balance
    from public.stock_movements m
    where m.ingredient_id = v_ingredient.id;

    -- Weighted average by value: (saldo * média atual + valor recebido) / (saldo + quantidade recebida).
    v_avg := round(
      (v_balance * v_ingredient.average_stock_unit_cost + v_total) / (v_balance + v_stock_qty),
      4
    );

    insert into public.inventory_lots (
      organization_id, ingredient_id, lot_code, supplier_id, receipt_id,
      received_on, manufactured_on, expires_on
    )
    values (
      v_org, v_ingredient.id, v_lot_code, p_supplier_id, v_receipt,
      v_received_on, v_manufactured, v_expires
    )
    returning id into v_lot;

    insert into public.goods_receipt_items (
      organization_id, receipt_id, ingredient_id, lot_id, purchase_unit,
      purchase_quantity, purchase_unit_cost, total_cost, stock_quantity
    )
    values (
      v_org, v_receipt, v_ingredient.id, v_lot, v_ingredient.purchase_unit,
      v_qty, v_unit_cost, v_total, v_stock_qty
    );

    insert into public.stock_movements (
      organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
      balance_before, balance_after, reason, reference, idempotency_key, performed_by
    )
    values (
      v_org, v_ingredient.id, v_lot, 'recebimento', v_stock_qty, v_ingredient.stock_unit,
      v_balance, v_balance + v_stock_qty,
      'Recebimento de nota fiscal', 'recebimento:' || v_receipt, gen_random_uuid(), v_user
    );

    update public.ingredients
    set average_stock_unit_cost = v_avg,
        purchase_unit_cost = v_unit_cost
    where id = v_ingredient.id;

    v_receipt_total := v_receipt_total + v_total;
  end loop;

  update public.goods_receipts set total_cost = v_receipt_total where id = v_receipt;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (
    v_org, v_user, 'goods_receipt.created', 'goods_receipt', v_receipt,
    jsonb_build_object('supplier_id', p_supplier_id, 'document_number', v_document,
                       'items', jsonb_array_length(p_items), 'total_cost', v_receipt_total)
  );

  return v_receipt;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ajuste de estoque por lote (positivo, negativo ou descarte de vencido)
-- ---------------------------------------------------------------------------

-- p_quantity is signed, in the ingredient's STOCK unit.
-- Positive: 'ajuste_positivo' (blocked for expired lots).
-- Negative on a valid lot: 'ajuste_negativo'. Negative on an expired lot: 'vencimento'.
create function public.register_stock_adjustment(
  p_client_request_id uuid,
  p_lot_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := public.current_organization_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing uuid;
  v_lot public.inventory_lots%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_lot_balance numeric;
  v_balance numeric;
  v_type text;
  v_movement uuid;
  v_expired boolean;
begin
  if v_user is null or v_org is null then
    raise exception 'Sessão sem organização. Entre novamente.' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_any_role(array['administrador', 'gerente']) then
    raise exception 'Seu perfil não pode registrar ajustes de estoque.' using errcode = 'insufficient_privilege';
  end if;
  if p_client_request_id is null then
    raise exception 'Identificador da solicitação é obrigatório.' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_reason) not between 3 and 300 then
    raise exception 'Informe o motivo do ajuste (de 3 a 300 caracteres).' using errcode = 'invalid_parameter_value';
  end if;
  if p_quantity is null or p_quantity = 0 or p_quantity <> round(p_quantity, 4) then
    raise exception 'Informe uma quantidade diferente de zero, com até 4 casas decimais.'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1 from public.organizations where id = v_org for update;

  select m.id into v_existing
  from public.stock_movements m
  where m.organization_id = v_org and m.idempotency_key = p_client_request_id;
  if found then
    return v_existing;
  end if;

  select * into v_lot
  from public.inventory_lots l
  where l.id = p_lot_id and l.organization_id = v_org;
  if not found then
    raise exception 'Lote não encontrado nesta pizzaria.' using errcode = 'foreign_key_violation';
  end if;

  -- Lock the ingredient so concurrent adjustments serialise on the same balance.
  select * into v_ingredient
  from public.ingredients i
  where i.id = v_lot.ingredient_id
  for update;

  select coalesce(sum(m.quantity_delta), 0) into v_lot_balance
  from public.stock_movements m
  where m.lot_id = v_lot.id;

  select coalesce(sum(m.quantity_delta), 0) into v_balance
  from public.stock_movements m
  where m.ingredient_id = v_ingredient.id;

  v_expired := v_lot.expires_on is not null and v_lot.expires_on < current_date;

  if p_quantity > 0 then
    if v_expired then
      raise exception 'O lote % está vencido desde %. Entradas nele estão bloqueadas.',
        v_lot.lot_code, to_char(v_lot.expires_on, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    v_type := 'ajuste_positivo';
  else
    if -p_quantity > v_lot_balance then
      raise exception 'Saldo insuficiente no lote %: disponível % %, solicitado % %.',
        v_lot.lot_code, v_lot_balance, v_ingredient.stock_unit, -p_quantity, v_ingredient.stock_unit
        using errcode = 'check_violation';
    end if;
    v_type := case when v_expired then 'vencimento' else 'ajuste_negativo' end;
  end if;

  insert into public.stock_movements (
    organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit,
    balance_before, balance_after, reason, idempotency_key, performed_by
  )
  values (
    v_org, v_ingredient.id, v_lot.id, v_type, p_quantity, v_ingredient.stock_unit,
    v_balance, v_balance + p_quantity, v_reason, p_client_request_id, v_user
  )
  returning id into v_movement;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, details)
  values (
    v_org, v_user, 'stock.adjusted', 'stock_movement', v_movement,
    jsonb_build_object('lot_id', v_lot.id, 'quantity', p_quantity, 'type', v_type, 'reason', v_reason)
  );

  return v_movement;
end;
$$;

revoke all on function public.create_ingredient(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, integer) from public, anon;
grant execute on function public.create_ingredient(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, integer) to authenticated;

revoke all on function public.register_goods_receipt(uuid, uuid, text, date, text, jsonb) from public, anon;
grant execute on function public.register_goods_receipt(uuid, uuid, text, date, text, jsonb) to authenticated;

revoke all on function public.register_stock_adjustment(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.register_stock_adjustment(uuid, uuid, numeric, text) to authenticated;
