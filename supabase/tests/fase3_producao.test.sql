-- Testes SQL da Fase 3 — Produção: fichas técnicas, meio a meio, baixa FEFO, preparos e custos.
--
-- Executado por scripts/db-test.sh depois das migrações, em transação com ROLLBACK.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;
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

-- Saldo de um insumo (soma do livro), para comparar antes e depois.
create function pg_temp.bal(p_ingredient uuid)
returns numeric language sql as $$
  select coalesce(sum(quantity_delta), 0) from public.stock_movements where ingredient_id = p_ingredient;
$$;

-- Consumo de um insumo em uma ordem de produção (unidade de estoque).
create function pg_temp.consumed(p_order uuid, p_ingredient uuid)
returns numeric language sql as $$
  select coalesce(sum(quantity), 0) from public.production_consumptions
  where production_order_id = p_order and ingredient_id = p_ingredient;
$$;

-- Item de ficha técnica: ingrediente por chave de contexto, quantidade e regra de divisão.
create function pg_temp.it(p_key text, p_qty numeric, p_split text)
returns jsonb language sql as $$
  select jsonb_build_object('ingredient_id', pg_temp.ctx(p_key), 'quantity', p_qty, 'split_rule', p_split);
$$;

-- ---------------------------------------------------------------------------
-- Cenário: pizzaria A (admin, pizzaiolo, atendente) e pizzaria C (admin)
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set user_c '33333333-3333-3333-3333-333333333333'
\set user_p '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email) values
  (:'user_a', 'admin.a@teste.local'),
  (:'user_b', 'atendente.a@teste.local'),
  (:'user_c', 'admin.c@teste.local'),
  (:'user_p', 'pizzaiolo.a@teste.local');

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
  (:'user_p', pg_temp.ctx('org_a'), 'Pedro Pizzaiolo', 'pizzaiolo');

select id::text as v from public.ingredient_categories
  where organization_id = pg_temp.ctx('org_a') and name = 'Outros' \gset
insert into pg_temp.ids (k, v) values ('cat', :'v');

select pg_temp.as_user(:'user_a');

-- Insumos com saldo inicial (cada um recebe seu lote SALDO-INICIAL).
select public.create_ingredient('00000000-0000-0000-0000-0000000000e1', 'MASSA', 'Massa de pizza', pg_temp.ctx('cat'),
  'kg', 'g', 'g', 1000, 1, 20000, 0, null, 10, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_massa', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e2', 'MOLHO', 'Molho de tomate', pg_temp.ctx('cat'),
  'kg', 'g', 'g', 1000, 1, 5000, 0, null, 8, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_molho', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e3', 'MUSS', 'Queijo Muçarela', pg_temp.ctx('cat'),
  'kg', 'kg', 'g', 1, 0.001, 15, 0, null, 38.50, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_mussarela', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e4', 'CALAB', 'Calabresa fatiada', pg_temp.ctx('cat'),
  'kg', 'kg', 'g', 1, 0.001, 5, 0, null, 30, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_calabresa', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e5', 'CAIXA', 'Caixa pizza G', pg_temp.ctx('cat'),
  'caixa', 'un', 'un', 100, 1, 100, 0, null, 50, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_caixa', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e6', 'OREG', 'Orégano', pg_temp.ctx('cat'),
  'kg', 'g', 'g', 1000, 1, 1000, 0, null, 20, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_oregano', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e7', 'TOMATE', 'Tomate', pg_temp.ctx('cat'),
  'kg', 'g', 'g', 1000, 1, 5000, 0, null, 10, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_tomate', :'v');
select public.create_ingredient('00000000-0000-0000-0000-0000000000e8', 'MOLHOPR', 'Molho pronto', pg_temp.ctx('cat'),
  'kg', 'g', 'g', 1000, 1, 0, 0, null, 0, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('ing_molho_pronto', :'v');

-- Produtos e fichas (versão 1).
select public.create_product('CAL-G', 'Calabresa Especial', 'Tradicionais', 'grande', 59.90) as v \gset
insert into pg_temp.ids (k, v) values ('prod_cal_g', :'v');
select public.create_product('MUS-G', 'Muçarela', 'Tradicionais', 'grande', 49.90) as v \gset
insert into pg_temp.ids (k, v) values ('prod_mus_g', :'v');
select public.create_product('CAL-P', 'Calabresa Pequena', 'Tradicionais', 'pequena', 35.90) as v \gset
insert into pg_temp.ids (k, v) values ('prod_cal_p', :'v');
select public.create_product('SEM-FICHA', 'Sem ficha', 'Especiais', 'grande', 10) as v \gset
insert into pg_temp.ids (k, v) values ('prod_sem', :'v');

select id::text as v from public.recipes where product_id = pg_temp.ctx('prod_cal_g') \gset
insert into pg_temp.ids (k, v) values ('rec_cal_g', :'v');
select id::text as v from public.recipes where product_id = pg_temp.ctx('prod_mus_g') \gset
insert into pg_temp.ids (k, v) values ('rec_mus_g', :'v');

select public.publish_recipe_version(pg_temp.ctx('rec_cal_g'), jsonb_build_array(
  pg_temp.it('ing_massa', 350, 'inteira'),
  pg_temp.it('ing_molho', 80, 'metade'),
  pg_temp.it('ing_mussarela', 250, 'metade'),
  pg_temp.it('ing_calabresa', 150, 'metade'),
  pg_temp.it('ing_caixa', 1, 'inteira'),
  pg_temp.it('ing_oregano', 2, 'metade')
)) as v \gset
insert into pg_temp.ids (k, v) values ('ver_cal_g_1', :'v');

select public.publish_recipe_version(pg_temp.ctx('rec_mus_g'), jsonb_build_array(
  pg_temp.it('ing_massa', 350, 'inteira'),
  pg_temp.it('ing_molho', 80, 'metade'),
  pg_temp.it('ing_mussarela', 250, 'metade'),
  pg_temp.it('ing_caixa', 1, 'inteira'),
  pg_temp.it('ing_oregano', 2, 'metade')
)) as v \gset
insert into pg_temp.ids (k, v) values ('ver_mus_g_1', :'v');

\! echo '== Fichas: publicação, imutabilidade e permissões'

select pg_temp.assert_true(
  (select count(*) from public.recipe_versions where recipe_id = pg_temp.ctx('rec_cal_g') and published) = 1,
  'ficha publicada deve ter uma versão publicada');

select pg_temp.expect_error(
  format($sql$ update public.recipe_items set quantity = 999 where version_id = %L::uuid $sql$, pg_temp.ctx('ver_cal_g_1')),
  'permission denied');

select pg_temp.as_superuser();
select pg_temp.expect_error(
  format($sql$ update public.recipe_items set quantity = 999 where version_id = %L::uuid $sql$, pg_temp.ctx('ver_cal_g_1')),
  'já foi publicada');
select pg_temp.expect_error(
  format($sql$ update public.recipe_versions set published = false where id = %L::uuid $sql$, pg_temp.ctx('ver_cal_g_1')),
  'imutáveis');
select pg_temp.as_user(:'user_a');

select pg_temp.expect_error(
  format($sql$ select public.publish_recipe_version(%L::uuid, jsonb_build_array(
    jsonb_build_object('ingredient_id', %L::uuid, 'quantity', 0, 'split_rule', 'metade'))) $sql$,
    pg_temp.ctx('rec_cal_g'), pg_temp.ctx('ing_molho')),
  'Quantidade inválida');

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error(
  format($sql$ select public.publish_recipe_version(%L::uuid, jsonb_build_array(
    jsonb_build_object('ingredient_id', %L::uuid, 'quantity', 1, 'split_rule', 'metade'))) $sql$,
    pg_temp.ctx('rec_cal_g'), pg_temp.ctx('ing_molho')),
  'Seu perfil não pode publicar');
select pg_temp.expect_error(
  $sql$ select public.create_product('X-1', 'Pizza X', 'Teste', 'grande', 10) $sql$,
  'Seu perfil não pode cadastrar produtos');
select pg_temp.as_superuser();

\! echo '== Teste 2: 20 pizzas de calabresa G consomem 5 kg de muçarela'

select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-000000000091'::uuid, pg_temp.ctx('prod_cal_g'), null, 20, current_date, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ord_t2', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t2'), pg_temp.ctx('ing_mussarela')) = 5,
  'Teste 2: 20 pizzas x 250 g devem consumir 5 kg de muçarela');
select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_mussarela')) = 10,
  'Teste 2: saldo de muçarela deve cair de 15 kg para 10 kg');
select pg_temp.assert_true(
  (select total_cost from public.production_orders where id = pg_temp.ctx('ord_t2')) = 376.10,
  'custo congelado da ordem: 70 + 12,80 + 192,50 + 90 + 10 + 0,80 = 376,10');
select pg_temp.assert_true(
  (select unit_cost from public.production_orders where id = pg_temp.ctx('ord_t2')) = 18.805,
  'custo por pizza deve ser 376,10 / 20 = 18,8050');
select pg_temp.assert_true(
  (select sum(total_cost) from public.production_consumptions where production_order_id = pg_temp.ctx('ord_t2'))
    = (select total_cost from public.production_orders where id = pg_temp.ctx('ord_t2')),
  'soma dos consumos deve bater com o custo da ordem');

\! echo '== Teste 3: meio a meio desconta massa e caixa uma vez'

select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-000000000093'::uuid, pg_temp.ctx('prod_cal_g'), pg_temp.ctx('prod_mus_g'), 1, current_date, 'meio a meio'
) as v \gset
insert into pg_temp.ids (k, v) values ('ord_t3', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t3'), pg_temp.ctx('ing_massa')) = 350,
  'Teste 3: massa deve ser descontada uma vez (350 g), não duas');
select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t3'), pg_temp.ctx('ing_caixa')) = 1,
  'Teste 3: caixa deve ser descontada uma vez');
select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t3'), pg_temp.ctx('ing_molho')) = 80,
  'Teste 3: molho é 40 g de cada sabor, total 80 g');
select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t3'), pg_temp.ctx('ing_mussarela')) = 0.25,
  'Teste 3: muçarela é 125 g de cada metade, total 250 g');
select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_t3'), pg_temp.ctx('ing_calabresa')) = 0.075,
  'Teste 3: calabresa só existe na metade calabresa, 75 g');

\! echo '== Teste 4: falta de estoque bloqueia tudo e lista os faltantes'

select pg_temp.as_superuser();
select count(*) as v from public.stock_movements \gset
insert into pg_temp.ids (k, v) values ('mov_before_t4', :'v');

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-000000000094'::uuid, %L::uuid, null, 100, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Estoque insuficiente');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-000000000094'::uuid, %L::uuid, null, 100, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Calabresa');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select count(*) from public.stock_movements) = (select v::bigint from pg_temp.ids where k = 'mov_before_t4'),
  'falta de estoque não pode gravar nenhum movimento parcial');
select pg_temp.assert_true(
  (select count(*) from public.production_orders where client_request_id = '00000000-0000-0000-0000-000000000094') = 0,
  'ordem recusada não pode ficar registrada');

select pg_temp.as_user(:'user_p');
select pg_temp.assert_true(
  (select count(*) from public.preview_pizza_requirements(pg_temp.ctx('prod_cal_g'), null, 100)
   where out_missing > 0) = 5,
  'pré-visualização deve apontar os 5 faltantes para 100 pizzas: massa, molho, muçarela, calabresa e caixa');
select pg_temp.as_superuser();

\! echo '== Teste 5: reenvio da mesma ordem não baixa de novo'

select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-000000000091'::uuid, pg_temp.ctx('prod_cal_g'), null, 20, current_date, null
) as v \gset
select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 'ord_t2'),
  'reenvio deve devolver a mesma ordem');
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select count(*) from public.production_consumptions where production_order_id = pg_temp.ctx('ord_t2')) > 0
  and pg_temp.bal(pg_temp.ctx('ing_mussarela')) = 9.75,
  'reenvio não pode baixar a muçarela de novo (10 - 0,25 da meia a meia = 9,75)');

\! echo '== FEFO: lote que vence primeiro sai primeiro, e lote vencido fica de fora'

select pg_temp.as_user(:'user_a');
select public.create_supplier('Distribuidora Teste', null, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('supplier_a', :'v');
select public.register_goods_receipt(
  '00000000-0000-0000-0000-0000000000f1'::uuid, pg_temp.ctx('supplier_a'), 'NF-F1', current_date, null,
  jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.ctx('ing_mussarela'), 'quantity', 2,
    'unit_cost', 40, 'lot_code', 'M-NEW', 'manufactured_on', current_date::text, 'expires_on', (current_date + 5)::text))
);

select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-0000000000f2'::uuid, pg_temp.ctx('prod_mus_g'), null, 1, current_date, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ord_fefo', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select count(*) from public.production_consumptions c
   join public.inventory_lots l on l.id = c.lot_id
   where c.production_order_id = pg_temp.ctx('ord_fefo') and l.lot_code = 'M-NEW' and c.quantity = 0.25) = 1,
  'FEFO: a muçarela deve sair primeiro do lote que vence antes (M-NEW)');

-- Lote M-NEW vence: sai da disponibilidade e não é mais consumido.
update public.inventory_lots
set manufactured_on = current_date - 2, expires_on = current_date - 1
where lot_code = 'M-NEW';

select pg_temp.as_user(:'user_p');
select pg_temp.assert_true(
  (select out_available from public.preview_pizza_requirements(pg_temp.ctx('prod_mus_g'), null, 1)
   where out_ingredient_id = pg_temp.ctx('ing_mussarela')) = 9.75,
  'lote vencido não pode contar como disponível (só o saldo inicial de 9,75 kg)');

select public.register_pizza_production(
  '00000000-0000-0000-0000-0000000000f3'::uuid, pg_temp.ctx('prod_mus_g'), null, 1, current_date, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ord_fefo2', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select count(*) from public.production_consumptions c
   join public.inventory_lots l on l.id = c.lot_id
   where c.production_order_id = pg_temp.ctx('ord_fefo2') and l.lot_code = 'SALDO-INICIAL'
     and c.ingredient_id = pg_temp.ctx('ing_mussarela')) = 1,
  'com o lote M-NEW vencido, a baixa deve vir do saldo inicial');
select pg_temp.assert_true(
  (select balance from public.inventory_lot_balances where lot_code = 'M-NEW') = 1.75,
  'lote vencido não pode ser consumido: deve manter 1,75 kg');

\! echo '== Preparo por lote: rendimento real, perda e lote de saída'

select pg_temp.as_user(:'user_a');
select public.create_preparo_recipe('Molho de tomate', pg_temp.ctx('ing_molho_pronto'), 1500) as v \gset
insert into pg_temp.ids (k, v) values ('rec_prep', :'v');
select public.publish_recipe_version(pg_temp.ctx('rec_prep'), jsonb_build_array(
  pg_temp.it('ing_tomate', 2000, 'inteira')
)) as v \gset
insert into pg_temp.ids (k, v) values ('ver_prep_1', :'v');

select public.register_preparation_batch(
  '00000000-0000-0000-0000-00000000009b'::uuid, pg_temp.ctx('rec_prep'), 1, 1400, 'MOLHO-01', current_date + 3, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ord_prep', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.consumed(pg_temp.ctx('ord_prep'), pg_temp.ctx('ing_tomate')) = 2000,
  'preparo: 2 kg de tomate por lote');
select pg_temp.assert_true(
  (select balance from public.inventory_lot_balances where lot_code = 'MOLHO-01') = 1400,
  'preparo: o lote de saída deve ter o rendimento real, 1.400 g');
select pg_temp.assert_true(
  (select total_cost from public.production_orders where id = pg_temp.ctx('ord_prep')) = 20,
  'preparo: custo do lote = 2.000 g x 0,01 = 20,00');
select pg_temp.assert_true(
  (select yield_loss from public.production_orders where id = pg_temp.ctx('ord_prep')) = 100,
  'preparo: perda = 1.500 esperados - 1.400 reais = 100 g');
select pg_temp.assert_true(
  (select average_stock_unit_cost from public.ingredients where id = pg_temp.ctx('ing_molho_pronto')) = 0.0143,
  'preparo: custo médio do molho pronto = 20,00 / 1.400 g');

\! echo '== Versões: ficha nova não altera ordens antigas'

select pg_temp.as_user(:'user_a');
select public.publish_recipe_version(pg_temp.ctx('rec_cal_g'), jsonb_build_array(
  pg_temp.it('ing_massa', 350, 'inteira'),
  pg_temp.it('ing_molho', 80, 'metade'),
  pg_temp.it('ing_mussarela', 250, 'metade'),
  pg_temp.it('ing_calabresa', 160, 'metade'),
  pg_temp.it('ing_caixa', 1, 'inteira'),
  pg_temp.it('ing_oregano', 2, 'metade')
)) as v \gset
insert into pg_temp.ids (k, v) values ('ver_cal_g_2', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select recipe_version_a_id from public.production_orders where id = pg_temp.ctx('ord_t2')) = pg_temp.ctx('ver_cal_g_1'),
  'ordem antiga deve continuar apontando para a versão 1 da ficha');
select pg_temp.assert_true(
  (select max(version_number) from public.recipe_versions where recipe_id = pg_temp.ctx('rec_cal_g')) = 2,
  'publicar uma nova ficha deve criar a versão 2');

\! echo '== Isolamento: pizzaria C não enxerga nem produz com a ficha de A'

select pg_temp.as_user(:'user_c');
select pg_temp.assert_true(
  (select count(*) from public.products) = 0 and (select count(*) from public.production_orders) = 0,
  'pizzaria C não pode ver produtos nem ordens da pizzaria A');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-00000000009c'::uuid, %L::uuid, null, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Sabor não encontrado');
select pg_temp.as_superuser();

\! echo '== Permissões de produção'

select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-00000000009d'::uuid, %L::uuid, null, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Seu perfil não pode registrar produção');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-00000000009e'::uuid, %L::uuid, %L::uuid, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g'), pg_temp.ctx('prod_cal_p')),
  'Seu perfil não pode registrar produção');
select pg_temp.as_superuser();

\! echo '== Regras de montagem do meio a meio'

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-00000000009f'::uuid, %L::uuid, %L::uuid, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g'), pg_temp.ctx('prod_cal_g')),
  'dois sabores diferentes');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-0000000000a1'::uuid, %L::uuid, %L::uuid, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_cal_g'), pg_temp.ctx('prod_cal_p')),
  'mesmo tamanho');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production(
    '00000000-0000-0000-0000-0000000000a2'::uuid, %L::uuid, null, 1, current_date, null) $sql$,
    pg_temp.ctx('prod_sem')),
  'não tem ficha técnica publicada');
select pg_temp.as_superuser();

\! echo '== Conciliação: saldo do insumo = soma dos lotes, sem saldo negativo'

select pg_temp.assert_true(
  (select count(*) from public.ingredients i
   where i.id in (select ingredient_id from public.inventory_lots)
     and pg_temp.bal(i.id) <> (select coalesce(sum(b.balance), 0) from public.inventory_lot_balances b where b.ingredient_id = i.id)) = 0,
  'saldo de cada insumo deve ser a soma dos seus lotes');
select pg_temp.assert_true(
  (select count(*) from public.inventory_lot_balances where balance < 0) = 0,
  'nenhum lote pode ficar com saldo negativo');

\! echo '== FASE 3: TODOS OS TESTES SQL PASSARAM'

\o
rollback;
