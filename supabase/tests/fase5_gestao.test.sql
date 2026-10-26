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


-- Cenário (produtos, fichas e insumos herdados das fases anteriores)
-- Cenário: pizzaria A (admin, pizzaiolo, atendente) e pizzaria C (admin)
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set user_c '33333333-3333-3333-3333-333333333333'
\set user_p '44444444-4444-4444-4444-444444444444'
\set user_e '55555555-5555-5555-5555-555555555555'

insert into auth.users (id, email) values
  (:'user_a', 'admin.a@teste.local'),
  (:'user_b', 'atendente.a@teste.local'),
  (:'user_c', 'admin.c@teste.local'),
  (:'user_p', 'pizzaiolo.a@teste.local'),
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
  (:'user_p', pg_temp.ctx('org_a'), 'Pedro Pizzaiolo', 'pizzaiolo'),
  (:'user_e', pg_temp.ctx('org_a'), 'Eduardo Estoquista', 'estoquista');

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



\! echo '== Custo teórico por pizza e margem'

select pg_temp.as_user(:'user_a');
select pg_temp.assert_true(public.product_theoretical_cost(pg_temp.ctx('prod_cal_g')) = 18.81,
  'custo teórico da calabresa G: 18,805 arredondado para 18,81');

select public.create_supplier('Laticínios Teste', null, null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('supplier_x', :'v');
select pg_temp.as_superuser();

\! echo '== Perdas: FEFO, motivo, custo estimado, idempotência e permissões'

select pg_temp.as_user(:'user_e');
select public.register_waste('00000000-0000-0000-0000-0000000000f1'::uuid, pg_temp.ctx('ing_calabresa'), null, 1,
  'vencimento', 'Pacote vencido na câmara', null) as v \gset
insert into pg_temp.ids (k, v) values ('waste1', :'v');
select pg_temp.expect_error(
  format($sql$ select public.register_waste('00000000-0000-0000-0000-0000000000f2'::uuid, %L::uuid, null, 1, 'roubo', null, null) $sql$,
         pg_temp.ctx('ing_calabresa')),
  'Motivo de perda inválido');
select pg_temp.expect_error(
  format($sql$ select public.register_waste('00000000-0000-0000-0000-0000000000f3'::uuid, %L::uuid, null, 0, 'outros', null, null) $sql$,
         pg_temp.ctx('ing_calabresa')),
  'maior que zero');
select pg_temp.expect_error(
  format($sql$ select public.register_waste('00000000-0000-0000-0000-0000000000f4'::uuid, %L::uuid, null, 10, 'outros', null, null) $sql$,
         pg_temp.ctx('ing_calabresa')),
  'Saldo insuficiente');
select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  format($sql$ select public.register_waste('00000000-0000-0000-0000-0000000000f5'::uuid, %L::uuid, null, 1, 'outros', null, null) $sql$,
         pg_temp.ctx('ing_calabresa')),
  'Seu perfil não pode registrar perdas');
select pg_temp.as_user(:'user_e');
select public.register_waste('00000000-0000-0000-0000-0000000000f1'::uuid, pg_temp.ctx('ing_calabresa'), null, 1,
  'vencimento', 'Pacote vencido na câmara', null) as v \gset
select pg_temp.assert_true(:'v' = (select v from pg_temp.ids where k = 'waste1'),
  'reenvio da mesma perda deve devolver o mesmo registro');
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_calabresa')) = 4,
  'perda de 1 kg deve baixar a calabresa de 5 kg para 4 kg, uma única vez');
select pg_temp.assert_true(
  (select cost_estimate from public.waste_records where id = pg_temp.ctx('waste1')) = 30,
  'custo estimado da perda: 1 kg x custo médio de 30,00');
select pg_temp.assert_true(
  (select count(*) from public.stock_movements where movement_type = 'perda') = 1,
  'a perda deve aparecer no livro como movimento do tipo perda');

\! echo '== Inventário: divergência exige motivo e não altera saldo antes da aprovação'

select pg_temp.as_user(:'user_e');
select pg_temp.expect_error(
  format($sql$ select public.submit_stocktake('00000000-0000-0000-0000-0000000000c1'::uuid, null,
    jsonb_build_array(jsonb_build_object('ingredient_id', %L::uuid, 'counted', 13))) $sql$,
    pg_temp.ctx('ing_mussarela')),
  'informe o motivo');

select public.submit_stocktake(
  '00000000-0000-0000-0000-0000000000c2'::uuid, 'Contagem de sábado',
  jsonb_build_array(
    jsonb_build_object('ingredient_id', pg_temp.ctx('ing_mussarela'), 'counted', 13, 'reason', 'Queda na câmara fria'),
    jsonb_build_object('ingredient_id', pg_temp.ctx('ing_calabresa'), 'counted', 4)
  )
) as v \gset
insert into pg_temp.ids (k, v) values ('st1', :'v');

select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  format($sql$ select public.submit_stocktake('00000000-0000-0000-0000-0000000000c3'::uuid, null,
    jsonb_build_array(jsonb_build_object('ingredient_id', %L::uuid, 'counted', 15))) $sql$,
    pg_temp.ctx('ing_mussarela')),
  'Seu perfil não pode registrar contagens');
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_mussarela')) = 15,
  'contagem submetida não pode alterar o saldo antes da aprovação');
select pg_temp.assert_true(
  (select net_difference_value from public.stocktakes where id = pg_temp.ctx('st1')) = -77,
  'valor líquido da contagem: -2 kg x 38,50 = -77,00');
select pg_temp.assert_true(
  (select status from public.stocktakes where id = pg_temp.ctx('st1')) = 'aguardando_aprovacao',
  'contagem nova deve aguardar aprovação');

\! echo '== Aprovação: só o administrador, com ajuste rastreável'

select pg_temp.as_user(:'user_e');
select pg_temp.expect_error(
  format($sql$ select public.approve_stocktake(%L::uuid, 'aprovando') $sql$, pg_temp.ctx('st1')),
  'Somente o administrador');
select pg_temp.as_user(:'user_a');
select public.approve_stocktake(pg_temp.ctx('st1'), 'Conferido pelo gerente') as v \gset
select pg_temp.expect_error(
  format($sql$ select public.approve_stocktake(%L::uuid, 'de novo') $sql$, pg_temp.ctx('st1')),
  'já foi decidida');
select pg_temp.as_superuser();

select pg_temp.assert_true(:'v'::integer = 1, 'aprovação deve aplicar um ajuste (a muçarela)');
select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_mussarela')) = 13,
  'após aprovação, a muçarela deve ir de 15 kg para 13 kg');
select pg_temp.assert_true(
  (select count(*) from public.stock_movements m
   where m.ingredient_id = pg_temp.ctx('ing_mussarela') and m.movement_type = 'ajuste_negativo'
     and m.quantity_delta = -2 and m.reference = 'inventario:' || pg_temp.ctx('st1')::text
     and m.reason like 'Inventário: Queda%') = 1,
  'o ajuste deve ficar rastreado no livro com motivo e referência da contagem');

\! echo '== Recusa de contagem não altera saldo'

select pg_temp.as_user(:'user_e');
select public.submit_stocktake(
  '00000000-0000-0000-0000-0000000000c4'::uuid, null,
  jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.ctx('ing_oregano'), 'counted', 1100, 'reason', 'Sobra na contagem'))
) as v \gset
insert into pg_temp.ids (k, v) values ('st2', :'v');
select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  format($sql$ select public.reject_stocktake(%L::uuid, '') $sql$, pg_temp.ctx('st2')),
  'motivo da recusa');
select public.reject_stocktake(pg_temp.ctx('st2'), 'Contagem a conferir de novo');
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select status from public.stocktakes where id = pg_temp.ctx('st2')) = 'recusado'
  and pg_temp.bal(pg_temp.ctx('ing_oregano')) = 1000,
  'contagem recusada não pode mudar o saldo');

\! echo '== Aprovação recalcula contra o saldo do momento da aprovação'

select pg_temp.as_user(:'user_e');
select public.submit_stocktake(
  '00000000-0000-0000-0000-0000000000c5'::uuid, null,
  jsonb_build_array(jsonb_build_object('ingredient_id', pg_temp.ctx('ing_massa'), 'counted', 19000, 'reason', 'Contagem física'))
) as v \gset
insert into pg_temp.ids (k, v) values ('st3', :'v');
-- Entre a contagem e a aprovação, 500 g de massa caem no chão.
select public.register_waste('00000000-0000-0000-0000-0000000000c6'::uuid, pg_temp.ctx('ing_massa'), null, 500,
  'derrubado', null, null);
select pg_temp.as_user(:'user_a');
select public.approve_stocktake(pg_temp.ctx('st3'), null);
select pg_temp.as_superuser();

select pg_temp.assert_true(pg_temp.bal(pg_temp.ctx('ing_massa')) = 19000,
  'após aprovação, a massa deve ficar na contagem física de 19.000 g');
select pg_temp.assert_true(
  (select sum(m.quantity_delta) from public.stock_movements m
   where m.reference = 'inventario:' || pg_temp.ctx('st3')::text) = -500,
  'o ajuste deve ser só a diferença para o saldo do momento: -500 g, não -1.000 g');

\! echo '== Consumo teórico x real e painel'

select pg_temp.as_user(:'user_p');
select public.register_pizza_production(
  '00000000-0000-0000-0000-0000000000c7'::uuid, pg_temp.ctx('prod_cal_g'), null, 2, current_date, null);

select pg_temp.as_user(:'user_a');
select pg_temp.assert_true(
  (select out_quantity from public.theoretical_consumption(current_date, current_date) where out_ingredient_id = pg_temp.ctx('ing_massa')) = 700,
  'consumo teórico de massa: 2 pizzas x 350 g = 700 g');
select pg_temp.assert_true(
  (select out_quantity from public.real_consumption(current_date, current_date) where out_ingredient_id = pg_temp.ctx('ing_massa')) = 700,
  'consumo real de massa deve bater com o teórico, sem contar perdas');
select pg_temp.assert_true(
  (select (public.dashboard_summary()->>'pizzas_produced_today')::integer) = 2,
  'painel deve mostrar 2 pizzas produzidas hoje');
select pg_temp.assert_true(
  (select (public.dashboard_summary()->>'pending_stocktakes')::integer) = 0,
  'painel não pode mostrar contagens pendentes depois das decisões');
select pg_temp.as_superuser();

\! echo '== Sugestão de compras e prazo de fornecedor'

update public.ingredients set minimum_stock = 20 where id = pg_temp.ctx('ing_mussarela');

select pg_temp.as_user(:'user_e');
select pg_temp.expect_error(
  format($sql$ select public.set_supplier_lead_time(%L::uuid, 3) $sql$, pg_temp.ctx('supplier_x')),
  'Seu perfil não pode alterar fornecedores');
select pg_temp.as_user(:'user_a');
select public.set_supplier_lead_time(pg_temp.ctx('supplier_x'), 3);
select pg_temp.as_superuser();
select pg_temp.assert_true(
  (select lead_time_days from public.suppliers where id = pg_temp.ctx('supplier_x')) = 3,
  'prazo de entrega deve ser gravado no fornecedor');

-- Consumo real de 0,5 kg de muçarela nos últimos 30 dias: 0,5/30 por dia.
-- Saldo agora é 12,5 kg (13 kg após a aprovação, menos 0,5 kg da produção).
-- Sugestão = 0,5/30 x (prazo 0 + 7 dias) + mínimo 20 - saldo 12,5 = 7,6167 kg.
select pg_temp.as_user(:'user_a');
select pg_temp.assert_true(
  (select out_suggested from public.reorder_suggestions() where out_ingredient_id = pg_temp.ctx('ing_mussarela')) = 7.6167,
  'sugestão de compra da muçarela deve ser 7,6167 kg');

\! echo '== Isolamento: pizzaria C não vê contagens, perdas nem posição de estoque de A'

select pg_temp.as_user(:'user_c');
select pg_temp.assert_true(
  (select count(*) from public.stocktakes) = 0 and (select count(*) from public.waste_records) = 0
  and (select count(*) from public.stock_position) = 0,
  'pizzaria C não pode ver contagens, perdas ou posição de estoque da pizzaria A');
select pg_temp.expect_error(
  format($sql$ select public.approve_stocktake(%L::uuid, 'invasão') $sql$, pg_temp.ctx('st3')),
  'Contagem não encontrada');
select pg_temp.as_superuser();

\! echo '== Conciliação após inventário e perdas'

select pg_temp.assert_true(
  (select count(*) from public.ingredients i
   where i.id in (select ingredient_id from public.inventory_lots)
     and pg_temp.bal(i.id) <> (select coalesce(sum(b.balance), 0) from public.inventory_lot_balances b where b.ingredient_id = i.id)) = 0,
  'saldo de cada insumo deve continuar igual à soma dos seus lotes após ajustes e perdas');

\! echo '== FASE 5: TODOS OS TESTES SQL PASSARAM'

\o
rollback;
