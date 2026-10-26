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


-- Cenário (produtos e fichas herdados da Fase 3)
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


\! echo '== Modo operacional: padrão, troca e permissões'

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error($sql$ select public.set_sales_mode('baixa_na_venda') $sql$, 'Somente o administrador');
select pg_temp.as_user(:'user_b');
select pg_temp.expect_error($sql$ select public.set_sales_mode('baixa_na_venda') $sql$, 'Somente o administrador');
select pg_temp.as_user(:'user_a');
select public.set_sales_mode('baixa_na_venda');
select pg_temp.expect_error($sql$ select public.set_sales_mode('modo_inventado') $sql$, 'Modo inválido');
select pg_temp.as_superuser();
select pg_temp.assert_true(public.sales_mode_of(pg_temp.ctx('org_a')) = 'baixa_na_venda',
  'administrador deve conseguir mudar o modo para baixa na venda');

\! echo '== Modo baixa na venda: a venda baixa ingredientes pela ficha'

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error(
  format($sql$ select public.register_pizza_production('00000000-0000-0000-0000-000000000071'::uuid, %L::uuid, null, 1, current_date, null) $sql$,
         pg_temp.ctx('prod_cal_g')),
  'baixa na venda');

select pg_temp.as_superuser();
select pg_temp.bal(pg_temp.ctx('ing_massa')) as v \gset
insert into pg_temp.ids (k, v) values ('massa0', :'v');
select pg_temp.bal(pg_temp.ctx('ing_mussarela')) as v \gset
insert into pg_temp.ids (k, v) values ('mus0', :'v');
select pg_temp.bal(pg_temp.ctx('ing_caixa')) as v \gset
insert into pg_temp.ids (k, v) values ('caixa0', :'v');

select pg_temp.as_user(:'user_b');
select public.register_sale(
  '00000000-0000-0000-0000-000000000051'::uuid, 'balcao', null,
  jsonb_build_array(
    jsonb_build_object('product_a', pg_temp.ctx('prod_cal_g'), 'pizzas', 2),
    jsonb_build_object('product_a', pg_temp.ctx('prod_cal_g'), 'product_b', pg_temp.ctx('prod_mus_g'), 'pizzas', 1)
  ),
  10, 'pix', 'Mesa 4', null
) as v \gset
insert into pg_temp.ids (k, v) values ('s1', :'v');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select subtotal from public.sales where id = pg_temp.ctx('s1')) = 174.70,
  'subtotal: 2 x 59,90 + meio a meio (59,90 + 49,90)/2 = 54,90 -> 174,70');
select pg_temp.assert_true(
  (select total from public.sales where id = pg_temp.ctx('s1')) = 164.70,
  'total com desconto de 10,00 deve ser 164,70');
select pg_temp.assert_true(
  (select unit_price from public.sale_items where sale_id = pg_temp.ctx('s1') and product_b_id is not null) = 54.90,
  'meio a meio deve ser vendido pela média dos dois sabores');
select pg_temp.assert_true(
  (select sale_number from public.sales where id = pg_temp.ctx('s1')) = 1,
  'primeira venda da pizzaria deve ser o pedido número 1');
select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_massa')) = (select v::numeric from pg_temp.ids where k = 'massa0') - 1050,
  'massa: 2 inteiras (700 g) + 1 meio a meio (350 g) = 1.050 g baixados');

select pg_temp.assert_true(
  pg_temp.bal(pg_temp.ctx('ing_mussarela')) = (select v::numeric from pg_temp.ids where k = 'mus0') - 0.75,
  'muçarela: 2 x 0,25 kg + 0,25 kg do meio a meio = 0,75 kg');
select pg_temp.assert_true(
  pg_temp.bal(pg_temp.ctx('ing_caixa')) = (select v::numeric from pg_temp.ids where k = 'caixa0') - 3,
  'caixa: uma por pizza, 3 no total');

select pg_temp.as_user(:'user_b');
select public.register_sale(
  '00000000-0000-0000-0000-000000000051'::uuid, 'balcao', null,
  jsonb_build_array(jsonb_build_object('product_a', pg_temp.ctx('prod_cal_g'), 'pizzas', 1)), 0, 'pix', null, null
) as v \gset
select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 's1'),
  'reenvio da mesma venda deve devolver a mesma venda, sem nova baixa');
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select count(*) from public.sales) = 1,
  'reenvio não pode criar segunda venda');

select pg_temp.as_user(:'user_b');
select public.register_sale(
  '00000000-0000-0000-0000-000000000052'::uuid, 'delivery', 'IFOOD-77',
  jsonb_build_array(jsonb_build_object('product_a', pg_temp.ctx('prod_mus_g'), 'pizzas', 1)), 0, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('s2', :'v');
select public.register_sale(
  '00000000-0000-0000-0000-000000000053'::uuid, 'delivery', 'IFOOD-77',
  jsonb_build_array(jsonb_build_object('product_a', pg_temp.ctx('prod_mus_g'), 'pizzas', 1)), 0, null, null, null
) as v \gset
select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 's2'),
  'pedido com o mesmo identificador externo do canal deve ser idempotente');
select pg_temp.expect_error(
  format($sql$ select public.register_sale('00000000-0000-0000-0000-000000000054'::uuid, 'balcao', null,
    jsonb_build_array(jsonb_build_object('product_a', %L::uuid, 'pizzas', 100)), 0, null, null, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Estoque insuficiente');
select pg_temp.expect_error(
  format($sql$ select public.register_sale('00000000-0000-0000-0000-000000000055'::uuid, 'balcao', null,
    jsonb_build_array(jsonb_build_object('product_a', %L::uuid, 'pizzas', 1)), 999, null, null, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'não pode ser maior que o subtotal');
select pg_temp.expect_error(
  $sql$ select public.register_sale('00000000-0000-0000-0000-000000000056'::uuid, 'site', null,
    '[]'::jsonb, 0, null, null, null) $sql$,
  'Canal de venda inválido');
select pg_temp.as_superuser();
select pg_temp.assert_true((select count(*) from public.sales) = 2,
  'vendas recusadas (falta de estoque, desconto e canal) não podem gravar nada');
select pg_temp.assert_true((select sale_number from public.sales where id = pg_temp.ctx('s2')) = 2,
  'o número do pedido deve ser sequencial');

select pg_temp.as_user(:'user_p');
select pg_temp.expect_error(
  format($sql$ select public.register_sale('00000000-0000-0000-0000-000000000057'::uuid, 'balcao', null,
    jsonb_build_array(jsonb_build_object('product_a', %L::uuid, 'pizzas', 1)), 0, null, null, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Seu perfil não pode registrar vendas');
select pg_temp.as_superuser();

\! echo '== Cancelamento no modo baixa na venda: devolve só o que foi recuperado'

select id::text as v from public.sale_items
  where sale_id = pg_temp.ctx('s1') and product_b_id is null \gset
insert into pg_temp.ids (k, v) values ('item_s1_whole', :'v');

select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  format($sql$ select public.cancel_sale(%L::uuid, 'Teste', '[]'::jsonb) $sql$, pg_temp.ctx('s1')),
  'Seu perfil não pode cancelar vendas');
select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  format($sql$ select public.cancel_sale(%L::uuid, 'x', '[]'::jsonb) $sql$, pg_temp.ctx('s1')),
  'motivo do cancelamento');
select pg_temp.as_superuser();
select pg_temp.bal(pg_temp.ctx('ing_mussarela')) as v \gset
insert into pg_temp.ids (k, v) values ('mus_before_cancel', :'v');
select pg_temp.as_user(:'user_a');

select public.cancel_sale(
  pg_temp.ctx('s1'), 'Cliente desistiu', jsonb_build_array(
    jsonb_build_object('item_id', pg_temp.ctx('item_s1_whole'), 'recovered', 1))
) as v \gset
select pg_temp.as_superuser();

select pg_temp.assert_true(
  pg_temp.bal(pg_temp.ctx('ing_mussarela')) = (select v::numeric from pg_temp.ids where k = 'mus_before_cancel') + 0.25,
  'cancelamento: 1 de 2 pizzas inteiras recuperada devolve metade dos 0,50 kg, ou seja 0,25 kg');
select pg_temp.assert_true(
  (select status from public.sales where id = pg_temp.ctx('s1')) = 'cancelada',
  'venda cancelada deve ficar com status cancelada');
select pg_temp.assert_true(
  (select count(*) from public.stock_movements where movement_type = 'estorno') > 0,
  'devolução deve ser registrada como movimento de estorno no livro');

select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  format($sql$ select public.cancel_sale(%L::uuid, 'Outra vez', '[]'::jsonb) $sql$, pg_temp.ctx('s1')),
  'já foi cancelada');
select pg_temp.as_superuser();

\! echo '== Modo baixa na produção: produção gera pizzas prontas, venda consome só o estoque pronto'

select pg_temp.as_user(:'user_a');
select public.set_sales_mode('baixa_na_producao');
select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-000000000072'::uuid, pg_temp.ctx('prod_cal_g'), null, 3, current_date, null
) as v \gset
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select balance from public.finished_goods_balances where product_a_id = pg_temp.ctx('prod_cal_g') and product_b_id is null) = 3,
  'produção de 3 pizzas deve gerar 3 pizzas prontas');

select pg_temp.bal(pg_temp.ctx('ing_mussarela')) as v \gset
insert into pg_temp.ids (k, v) values ('mus_b0', :'v');
select pg_temp.as_user(:'user_b');
select public.register_sale(
  '00000000-0000-0000-0000-000000000058'::uuid, 'balcao', null,
  jsonb_build_array(jsonb_build_object('product_a', pg_temp.ctx('prod_cal_g'), 'pizzas', 2)), 0, 'dinheiro', null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('s8', :'v');
select pg_temp.expect_error(
  format($sql$ select public.register_sale('00000000-0000-0000-0000-000000000059'::uuid, 'balcao', null,
    jsonb_build_array(jsonb_build_object('product_a', %L::uuid, 'pizzas', 2)), 0, null, null, null) $sql$,
    pg_temp.ctx('prod_cal_g')),
  'Pizzas prontas insuficientes');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select balance from public.finished_goods_balances where product_a_id = pg_temp.ctx('prod_cal_g') and product_b_id is null) = 1,
  'venda de 2 pizzas deve consumir 2 das 3 prontas');
select pg_temp.assert_true(
  pg_temp.bal(pg_temp.ctx('ing_mussarela')) = (select v::numeric from pg_temp.ids where k = 'mus_b0'),
  'no modo baixa na produção, a venda não baixa ingredientes');
select pg_temp.assert_true(
  (select sale_number from public.sales where id = pg_temp.ctx('s8')) = 3,
  'vendas recusadas não consomem número de pedido: a terceira venda gravada é a número 3');

select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  $sql$ select public.set_sales_mode('baixa_na_venda') $sql$, 'pizzas prontas');
select pg_temp.as_superuser();

select pg_temp.as_user(:'user_a');
select public.cancel_sale(pg_temp.ctx('s8'), 'Cliente trocou a pizza',
  jsonb_build_array(jsonb_build_object('item_id', (select id from public.sale_items where sale_id = pg_temp.ctx('s8')), 'recovered', 1))
);
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select balance from public.finished_goods_balances where product_a_id = pg_temp.ctx('prod_cal_g') and product_b_id is null) = 2,
  'pizza recuperada de venda cancelada volta ao estoque pronto');
select pg_temp.assert_true(
  pg_temp.bal(pg_temp.ctx('ing_mussarela')) = (select v::numeric from pg_temp.ids where k = 'mus_b0'),
  'cancelamento no modo baixa na produção nunca devolve ingredientes');

\! echo '== Isolamento: pizzaria C não vê vendas nem estoque pronto de A'

select pg_temp.as_user(:'user_c');
select pg_temp.assert_true(
  (select count(*) from public.sales) = 0 and (select count(*) from public.sale_items) = 0
  and (select count(*) from public.finished_goods_balances) = 0,
  'pizzaria C não pode ver vendas, itens ou estoque pronto da pizzaria A');
select pg_temp.expect_error(
  format($sql$ select public.cancel_sale(%L::uuid, 'Invasão', '[]'::jsonb) $sql$, pg_temp.ctx('s2')),
  'Venda não encontrada');
select pg_temp.as_superuser();

\! echo '== Conciliação: saldos e estoque pronto nunca negativos'

select pg_temp.assert_true(
  (select count(*) from public.inventory_lot_balances where balance < 0) = 0
  and (select count(*) from public.finished_goods_balances where balance < 0) = 0,
  'nenhum lote ou estoque pronto pode ficar negativo');
select pg_temp.assert_true(
  (select count(*) from public.ingredients i
   where i.id in (select ingredient_id from public.inventory_lots)
     and pg_temp.bal(i.id) <> (select coalesce(sum(b.balance), 0) from public.inventory_lot_balances b where b.ingredient_id = i.id)) = 0,
  'saldo de cada insumo deve ser a soma dos seus lotes');

\! echo '== FASE 4: TODOS OS TESTES SQL PASSARAM'

\o
rollback;
