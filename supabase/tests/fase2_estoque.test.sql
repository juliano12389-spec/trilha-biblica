-- Testes SQL da Fase 2 — Estoque: recebimentos, lotes, validade, ajustes e custo médio.
--
-- Executado por scripts/db-test.sh depois das migrações, em transação com ROLLBACK.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

create function pg_temp.assert_true(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_error(p_sql text, p_expected text)
returns void language plpgsql as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    v_message := sqlerrm;
  end;
  if v_message is null then
    raise exception 'FALHOU: esperava erro contendo "%", mas a operação foi concluída', p_expected;
  end if;
  if position(p_expected in v_message) = 0 then
    raise exception 'FALHOU: erro "%" não contém "%"', v_message, p_expected;
  end if;
end;
$$;

create function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.as_superuser()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

create table pg_temp.ids (k text primary key, v text not null);
grant select, insert on pg_temp.ids to authenticated;

create function pg_temp.ctx(p_key text)
returns uuid language sql as $$
  select v::uuid from pg_temp.ids where k = p_key;
$$;

-- Item de recebimento no formato esperado por register_goods_receipt.
create function pg_temp.item(p_ingredient uuid, p_qty numeric, p_cost numeric, p_lot text, p_expires date)
returns jsonb language sql as $$
  select jsonb_build_object(
    'ingredient_id', p_ingredient,
    'quantity', p_qty,
    'unit_cost', p_cost,
    'lot_code', p_lot,
    'manufactured_on', current_date::text,
    'expires_on', p_expires::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Cenário: pizzaria A (admin + estoquista + atendente) e pizzaria C (admin)
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set user_c '33333333-3333-3333-3333-333333333333'
\set user_e '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email) values
  (:'user_a', 'admin.a@teste.local'),
  (:'user_b', 'atendente.a@teste.local'),
  (:'user_c', 'admin.c@teste.local'),
  (:'user_e', 'estoquista.a@teste.local');

select pg_temp.as_user(:'user_a');
select public.create_organization('Pizzaria Bella Napoli', 'Juliano Teste') as v \gset
select pg_temp.as_superuser();
insert into pg_temp.ids (k, v) values ('org_a', :'v');

select pg_temp.as_user(:'user_c');
select public.create_organization('Pizzaria Forno Central', 'Maria Teste') as v \gset
select pg_temp.as_superuser();
insert into pg_temp.ids (k, v) values ('org_c', :'v');

insert into public.profiles (id, organization_id, full_name, role_code) values
  (:'user_b', pg_temp.ctx('org_a'), 'Ana Atendente', 'atendente'),
  (:'user_e', pg_temp.ctx('org_a'), 'Eduardo Estoquista', 'estoquista');

select id::text as v from public.ingredient_categories
  where organization_id = pg_temp.ctx('org_a') and name = 'Queijos' \gset
insert into pg_temp.ids (k, v) values ('cat_queijos', :'v');
select id::text as v from public.ingredient_categories
  where organization_id = pg_temp.ctx('org_a') and name = 'Outros' \gset
insert into pg_temp.ids (k, v) values ('cat_outros', :'v');

select pg_temp.as_user(:'user_a');

-- Insumos: mussarela (kg/g, validade 30 dias, saldo inicial 10 kg),
-- farinha (compra em kg, estoque em g) e azeite (compra em litros, densidade 0,92).
select public.create_ingredient(
  '00000000-0000-0000-0000-0000000000a1', 'ING-001', 'Queijo Muçarela', pg_temp.ctx('cat_queijos'),
  'kg', 'kg', 'g', 1, 0.001, 10, 20, null, 38.50, null, 'Câmara fria', 30
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_mussarela', :'v');

select public.create_ingredient(
  '00000000-0000-0000-0000-0000000000a2', 'ING-002', 'Farinha Tipo 00', pg_temp.ctx('cat_outros'),
  'kg', 'g', 'g', 1000, 1, 0, 0, null, 6.80, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_farinha', :'v');

select public.create_ingredient(
  '00000000-0000-0000-0000-0000000000a3', 'ING-003', 'Azeite Extra Virgem', pg_temp.ctx('cat_outros'),
  'l', 'kg', 'kg', 0.92, 1, 0, 0, null, 30, null, null, 365
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_azeite', :'v');

select public.create_supplier('Distribuidora Napoli', null, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('supplier_a', :'v');

select pg_temp.as_superuser();
select pg_temp.as_user(:'user_c');
select public.create_supplier('Laticínios da Central', null, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('supplier_c', :'v');
select pg_temp.as_superuser();
select pg_temp.as_user(:'user_a');

\! echo '== Recebimento: Teste 1 (10 kg + 5 kg = 15 kg) e custo médio'

select public.register_goods_receipt(
  '00000000-0000-0000-0000-0000000000d1'::uuid, pg_temp.ctx('supplier_a'), 'NF-1001', current_date, null,
  jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 5, 40, 'L-A', current_date + 30))
) as v \gset
insert into pg_temp.ids (k, v) values ('rec_1', :'v');

select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 15,
  'Teste 1: 10 kg + 5 kg recebidos devem resultar em 15 kg');

select pg_temp.assert_true(
  (select balance from public.inventory_lot_balances where lot_code = 'L-A') = 5,
  'o lote L-A deve ter exatamente os 5 kg recebidos');

-- Média ponderada: (10 kg * 38,50 + 5 kg * 40,00) / 15 kg = 39,00
select pg_temp.assert_true(
  (select average_stock_unit_cost from public.ingredients where id = pg_temp.ctx('ing_mussarela')) = 39,
  'custo médio ponderado deve ser 39,0000 após o recebimento');

select pg_temp.assert_true(
  (select total_cost from public.goods_receipts where id = pg_temp.ctx('rec_1')) = 200,
  'total da nota deve ser 5 kg * 40,00 = 200,00');

select pg_temp.as_user(:'user_a');

\! echo '== Recebimento: idempotência e nota fiscal duplicada'

select public.register_goods_receipt(
  '00000000-0000-0000-0000-0000000000d1'::uuid, pg_temp.ctx('supplier_a'), 'NF-1001', current_date, null,
  jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 5, 40, 'L-A', current_date + 30))
) as v \gset

select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 'rec_1'),
  'reenvio com o mesmo identificador deve devolver o mesmo recebimento');
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 15,
  'reenvio não pode somar o recebimento de novo');
select pg_temp.as_user(:'user_a');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d2'::uuid, pg_temp.ctx('supplier_a'), ' nf-1001 ', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-B', current_date + 30))) $sql$,
  'já foi registrada');

\! echo '== Recebimento: conversão (Teste 7) e validações'

select public.register_goods_receipt(
  '00000000-0000-0000-0000-0000000000d3'::uuid, pg_temp.ctx('supplier_a'), 'NF-1002', current_date, null,
  jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_farinha'), 5, 6.80, 'F-01', null))
) as v \gset
insert into pg_temp.ids (k, v) values ('rec_2', :'v');

select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_farinha')) = 5000,
  'Teste 7: 5 kg recebidos devem aparecer como 5.000 g no saldo');
select pg_temp.as_user(:'user_a');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d4'::uuid, pg_temp.ctx('supplier_c'), 'NF-9', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-C', current_date + 30))) $sql$,
  'Fornecedor inválido');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d5'::uuid, pg_temp.ctx('supplier_a'), 'NF-1003', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-D', null))) $sql$,
  'Informe a validade');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d6'::uuid, pg_temp.ctx('supplier_a'), 'NF-1004', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-E', current_date - 1))) $sql$,
  'chega vencido');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d7'::uuid, pg_temp.ctx('supplier_a'), 'NF-1005', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-A', current_date + 30))) $sql$,
  'inventory_lots_code_key');

-- 0,0001 l * 0,92 = 0,000092 kg: a conversão tem mais de 4 casas e é recusada.
select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d8'::uuid, pg_temp.ctx('supplier_a'), 'NF-1006', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_azeite'), 0.0001, 30, 'AZ-X', current_date + 200))) $sql$,
  'mais de 4 casas');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d9'::uuid, pg_temp.ctx('supplier_a'), 'NF-1007', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 0, 40, 'L-F', current_date + 30))) $sql$,
  'Quantidade inválida');

select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000d9'::uuid, pg_temp.ctx('supplier_a'), 'NF-1008', current_date, null, '[]'::jsonb) $sql$,
  'ao menos um item');

\! echo '== Permissões de recebimento e ajuste'

select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  $sql$ select public.register_goods_receipt(
    '00000000-0000-0000-0000-0000000000db'::uuid, pg_temp.ctx('supplier_a'), 'NF-B', current_date, null,
    jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 1, 40, 'L-B2', current_date + 30))) $sql$,
  'Seu perfil não pode registrar recebimentos');
select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000ab'::uuid, %L::uuid, -1, 'Quebra') $sql$,
         pg_temp.ctx('ing_mussarela')),
  'Seu perfil não pode registrar ajustes');
select pg_temp.as_superuser();

select pg_temp.as_user(:'user_e');
select public.register_goods_receipt(
  '00000000-0000-0000-0000-0000000000de'::uuid, pg_temp.ctx('supplier_a'), 'NF-E1', current_date, null,
  jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_azeite'), 10, 30, 'AZ-01', current_date + 200))
) as v \gset
insert into pg_temp.ids (k, v) values ('rec_e', :'v');
select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000ae'::uuid, %L::uuid, -1, 'Quebra') $sql$,
         pg_temp.ctx('ing_mussarela')),
  'Seu perfil não pode registrar ajustes');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_azeite')) = 9.2,
  'estoquista: 10 l de azeite a densidade 0,92 devem gerar 9,2 kg');

\! echo '== Ajustes por lote'

select id::text as v from public.inventory_lots
  where organization_id = pg_temp.ctx('org_a') and lot_code = 'L-A' \gset
insert into pg_temp.ids (k, v) values ('lot_a', :'v');

select pg_temp.as_user(:'user_a');

select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000a0'::uuid, %L::uuid, -6, 'Quebra grande') $sql$,
         pg_temp.ctx('lot_a')),
  'Saldo insuficiente no lote');

select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000a1'::uuid, %L::uuid, 0, 'Sem quantidade') $sql$,
         pg_temp.ctx('lot_a')),
  'diferente de zero');

select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000a2'::uuid, %L::uuid, -1, 'a') $sql$,
         pg_temp.ctx('lot_a')),
  'motivo do ajuste');

select public.register_stock_adjustment(
  '00000000-0000-0000-0000-0000000000a3'::uuid, pg_temp.ctx('lot_a'), -2, 'Queda na câmara'
) as v \gset
insert into pg_temp.ids (k, v) values ('adj_1', :'v');

-- Mesmo identificador de solicitação: nenhum segundo movimento.
select public.register_stock_adjustment(
  '00000000-0000-0000-0000-0000000000a3'::uuid, pg_temp.ctx('lot_a'), -2, 'Queda na câmara'
) as v \gset
select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 'adj_1'),
  'reenvio de ajuste deve devolver o mesmo movimento');

select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select type from (select movement_type as type from public.stock_movements where id = pg_temp.ctx('adj_1')) t) = 'ajuste_negativo',
  'ajuste dentro de lote válido deve ser do tipo ajuste_negativo');
select pg_temp.assert_true(
  (select balance from public.inventory_lot_balances where lot_id = pg_temp.ctx('lot_a')) = 3,
  'após queda de 2 kg, o lote L-A deve ter 3 kg');
select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 13,
  'após queda de 2 kg, o insumo deve ter 13 kg');

select pg_temp.as_user(:'user_a');
select public.register_stock_adjustment(
  '00000000-0000-0000-0000-0000000000a4'::uuid, pg_temp.ctx('lot_a'), 1, 'Contagem a maior'
) as v \gset
insert into pg_temp.ids (k, v) values ('adj_2', :'v');

-- Cross-org: pizzaria C não pode ajustar lote da pizzaria A.
select pg_temp.as_user(:'user_c');
select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000c1'::uuid, %L::uuid, -1, 'Invasão') $sql$,
         pg_temp.ctx('lot_a')),
  'Lote não encontrado');
select pg_temp.assert_true(
  (select count(*) from public.inventory_lots) = 0 and (select count(*) from public.goods_receipts) = 0,
  'pizzaria C não pode ver lotes nem recebimentos da pizzaria A');
select pg_temp.as_superuser();

\! echo '== Vencimento: lote vencido bloqueia entrada e a baixa vira descarte'

update public.inventory_lots
set manufactured_on = current_date - 2, expires_on = current_date - 1
where lot_code = 'AZ-01' and ingredient_id = pg_temp.ctx('ing_azeite');

select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  format($sql$ select public.register_stock_adjustment('00000000-0000-0000-0000-0000000000f1'::uuid, %L::uuid, 1, 'Entrada indevida') $sql$,
         (select id from public.inventory_lots where lot_code = 'AZ-01')),
  'está vencido');
select public.register_stock_adjustment(
  '00000000-0000-0000-0000-0000000000f2'::uuid,
  (select id from public.inventory_lots where lot_code = 'AZ-01'),
  -1, 'Descarte de lote vencido'
) as v \gset
insert into pg_temp.ids (k, v) values ('disc_1', :'v');
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select movement_type from public.stock_movements where id = pg_temp.ctx('disc_1')) = 'vencimento',
  'baixa de lote vencido deve ser registrada como vencimento');
select pg_temp.as_user(:'user_a');

\! echo '== Reconciliação e integridade do livro'

select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select count(*) from public.ingredients i
   where i.id in (select ingredient_id from public.inventory_lots)
     and (select coalesce(sum(quantity_delta), 0) from public.stock_movements m where m.ingredient_id = i.id)
         <> (select coalesce(sum(b.balance), 0) from public.inventory_lot_balances b where b.ingredient_id = i.id)) = 0,
  'saldo de cada insumo deve ser a soma dos saldos dos seus lotes');

select pg_temp.assert_true(
  (select count(*) from public.inventory_lot_balances where balance < 0) = 0,
  'nenhum lote pode ter saldo negativo');

select pg_temp.expect_error(
  format($sql$ insert into public.stock_movements (organization_id, ingredient_id, movement_type, quantity_delta, unit, balance_before, balance_after, idempotency_key)
        values (%L::uuid, %L::uuid, 'ajuste_positivo', 1, 'kg', 0, 1, gen_random_uuid()) $sql$,
         pg_temp.ctx('org_a'), pg_temp.ctx('ing_mussarela')),
  'precisa estar vinculado a um lote');

select pg_temp.expect_error(
  format($sql$ insert into public.stock_movements (organization_id, ingredient_id, lot_id, movement_type, quantity_delta, unit, balance_before, balance_after, idempotency_key)
        values (%L::uuid, %L::uuid, %L::uuid, 'ajuste_positivo', 1, 'kg', 0, 1, gen_random_uuid()) $sql$,
         pg_temp.ctx('org_a'), pg_temp.ctx('ing_farinha'), pg_temp.ctx('lot_a')),
  'Lote não pertence');

select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  $sql$ update public.goods_receipts set total_cost = 0 $sql$,
  'permission denied');
select pg_temp.as_superuser();

\! echo '== Custo médio após nova compra'

-- Saldo 14 kg a 39,00 + 10 kg a 30,00 -> (546 + 300) / 24 = 35,25
select pg_temp.as_user(:'user_a');
select public.register_goods_receipt(
  '00000000-0000-0000-0000-000000000d9b'::uuid, pg_temp.ctx('supplier_a'), 'NF-1010', current_date, null,
  jsonb_build_array(pg_temp.item(pg_temp.ctx('ing_mussarela'), 10, 30, 'L-G', current_date + 30))
) as v \gset
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select average_stock_unit_cost from public.ingredients where id = pg_temp.ctx('ing_mussarela')) = 35.25,
  'custo médio após 14 kg a 39,00 e 10 kg a 30,00 deve ser 35,25');

\! echo '== Isolamento de leitura entre pizzarias'

select pg_temp.as_user(:'user_c');
select pg_temp.assert_true(
  (select count(*) from public.goods_receipt_items) = 0 and (select count(*) from public.inventory_lot_balances) = 0,
  'pizzaria C não pode ler itens de recebimento nem saldos por lote da pizzaria A');
select pg_temp.as_superuser();

\! echo '== FASE 2: TODOS OS TESTES SQL PASSARAM'

\o
rollback;
