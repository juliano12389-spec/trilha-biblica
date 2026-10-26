-- Testes SQL da Fase 1 — Fundação.
--
-- Executar com scripts/db-test.sh, que cria um banco descartável, aplica o stub
-- de auth local e todas as migrações, e então roda este arquivo.
--
-- Tudo acontece dentro de uma transação que termina em ROLLBACK, então nada
-- persiste. Qualquer falha interrompe o script (ON_ERROR_STOP).

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

begin;

-- ---------------------------------------------------------------------------
-- Helpers (funções e tabela temporárias da sessão)
-- ---------------------------------------------------------------------------

create function pg_temp.assert_true(p_ok boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_message;
  end if;
end;
$$;

-- Passa somente se a instrução falhar com uma mensagem contendo p_expected.
create function pg_temp.expect_error(p_sql text, p_expected text)
returns void
language plpgsql
as $$
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

-- Assume a identidade de um usuário autenticado, como o PostgREST faz.
create function pg_temp.as_user(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.as_superuser()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- IDs de contexto usados dentro de strings SQL (psql não interpola dentro de $sql$).
create table pg_temp.ids (k text primary key, v text not null);
grant select, insert on pg_temp.ids to authenticated;

create function pg_temp.ctx(p_key text)
returns uuid
language sql
as $$
  select v::uuid from pg_temp.ids where k = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Cenário base: três usuários, duas pizzarias e um atendente em uma delas
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set user_c '33333333-3333-3333-3333-333333333333'
\set user_e '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email) values
  (:'user_a', 'admin.a@teste.local'),
  (:'user_b', 'atendente.a@teste.local'),
  (:'user_c', 'admin.c@teste.local'),
  (:'user_e', 'sem.perfil@teste.local');

select pg_temp.as_user(:'user_a');
select public.create_organization('Pizzaria Bella Napoli', 'Juliano Teste') as org_a \gset
select pg_temp.as_superuser();

select pg_temp.as_user(:'user_c');
select public.create_organization('Pizzaria Forno Central', 'Maria Teste') as org_c \gset
select pg_temp.as_superuser();

insert into public.profiles (id, organization_id, full_name, role_code)
values (:'user_b', :'org_a', 'Ana Atendente', 'atendente');

select id::text as v, 'cat_queijos' as k from public.ingredient_categories
  where organization_id = :'org_a' and name = 'Queijos' \gset
insert into pg_temp.ids (k, v) values ('cat_queijos', :'v');

select id::text as v, 'cat_massas' as k from public.ingredient_categories
  where organization_id = :'org_a' and name = 'Massas e farinhas' \gset
insert into pg_temp.ids (k, v) values ('cat_massas', :'v');

select id::text as v, 'cat_c_queijos' as k from public.ingredient_categories
  where organization_id = :'org_c' and name = 'Queijos' \gset
insert into pg_temp.ids (k, v) values ('cat_c_queijos', :'v');

\! echo '== Organizações e categorias'

select pg_temp.assert_true(
  (select count(*) from public.ingredient_categories where organization_id = :'org_a') = 10,
  'organização nova deve nascer com 10 categorias iniciais');

select pg_temp.assert_true(
  (select role_code from public.profiles where id = :'user_a') = 'administrador',
  'criador da organização deve ser administrador');

select pg_temp.as_user(:'user_a');
select pg_temp.expect_error(
  $sql$ select public.create_organization('Outra Pizzaria', 'Juliano') $sql$,
  'já pertence');
select pg_temp.as_superuser();

select pg_temp.as_user(:'user_e');
select pg_temp.expect_error(
  $sql$ select public.create_organization('X', 'Responsável') $sql$,
  'Informe o nome da pizzaria');
select pg_temp.as_superuser();

\! echo '== Catálogo de unidades e conversões'

select pg_temp.assert_true(
  (select count(*) from public.units_of_measure) = 8,
  'catálogo deve ter 8 unidades');

select pg_temp.assert_true(
  (select factor from public.unit_conversions where from_unit = 'kg' and to_unit = 'g') = 1000,
  'kg -> g deve ser 1000');

select pg_temp.expect_error(
  $sql$ insert into public.unit_conversions (from_unit, to_unit, factor) values ('kg', 'ml', 1) $sql$,
  'mesma grandeza');

\! echo '== Cadastro de insumos (Teste 7, idempotência e validações)'

select pg_temp.as_user(:'user_a');

select public.create_ingredient(
  '00000000-0000-0000-0000-00000000a001', 'ING-001', 'Queijo Muçarela Fatiado', pg_temp.ctx('cat_queijos'),
  'kg', 'kg', 'g', 1, 0.001,
  15, 20, null, 38.50, null, 'Câmara fria', null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_mussarela', :'v');

select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 15,
  'saldo inicial de 15 kg deve aparecer no saldo do insumo');

-- Teste 7: 15 kg equivalem a 15.000 g quando o saldo é expresso em gramas.
select pg_temp.assert_true(
  (select b.balance / i.consumption_to_stock_factor
     from public.ingredient_balances b
     join public.ingredients i on i.id = b.ingredient_id
     where b.ingredient_id = pg_temp.ctx('ing_mussarela')) = 15000,
  'Teste 7: 15 kg deve corresponder a 15.000 g');

-- Reenvio da mesma solicitação não cria outro insumo nem outro movimento.
select public.create_ingredient(
  '00000000-0000-0000-0000-00000000a001', 'ING-001', 'Queijo Muçarela Fatiado', pg_temp.ctx('cat_queijos'),
  'kg', 'kg', 'g', 1, 0.001,
  15, 20, null, 38.50, null, 'Câmara fria', null
) as v \gset

select pg_temp.assert_true(
  :'v' = (select v from pg_temp.ids where k = 'ing_mussarela'),
  'reenvio com o mesmo identificador deve devolver o mesmo insumo');

select pg_temp.assert_true(
  (select count(*) from public.stock_movements where ingredient_id = pg_temp.ctx('ing_mussarela')) = 1,
  'reenvio não pode gerar um segundo movimento de saldo inicial');

-- Mesmo SKU em outro cadastro é rejeitado (comparação sem diferenciar maiúsculas).
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a002', 'ing-001', 'Outro queijo', pg_temp.ctx('cat_queijos'),
    'kg', 'kg', 'g', 1, 0.001, 0, 0, null, 0, null, null, null) $sql$,
  'ingredients_org_sku_key');

select public.create_ingredient(
  '00000000-0000-0000-0000-00000000a003', 'ING-002', 'Farinha Tipo 00', pg_temp.ctx('cat_massas'),
  'kg', 'kg', 'g', 1, 0.001, 0, 10, null, 6.80, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_farinha', :'v');

select pg_temp.assert_true(
  (select count(*) from public.stock_movements where ingredient_id = pg_temp.ctx('ing_farinha')) = 0
  and (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_farinha')) = 0,
  'insumo sem saldo inicial não deve gerar movimento');

-- Fator de catálogo divergente (1 kg = 1000 g) é recusado pelo backend.
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a004', 'ING-003', 'Farinha errada', pg_temp.ctx('cat_massas'),
    'kg', 'g', 'g', 999, 0.001, 0, 0, null, 0, null, null, null) $sql$,
  'deve ser 1000');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a005', 'ING-004', 'Negativo', pg_temp.ctx('cat_queijos'),
    'kg', 'kg', 'g', 1, 0.001, -1, 0, null, 0, null, null, null) $sql$,
  'não pode ser negativa');

-- Litros comprados e quilogramas em estoque: sem fator, a conversão é recusada.
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a006', 'ING-005', 'Azeite sem densidade', pg_temp.ctx('cat_massas'),
    'l', 'kg', 'kg', null, 1, 0, 0, null, 0, null, null, null) $sql$,
  'Informe os fatores de conversão');

-- Com fator de densidade explícito, a conversão é aceita e gravada.
select public.create_ingredient(
  '00000000-0000-0000-0000-00000000a007', 'ING-006', 'Azeite extra virgem', pg_temp.ctx('cat_massas'),
  'l', 'kg', 'kg', 0.92, 1, 0, 2, null, 0, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_azeite', :'v');

select pg_temp.assert_true(
  (select purchase_to_stock_factor from public.ingredients where id = pg_temp.ctx('ing_azeite')) = 0.92,
  'fator de densidade explícito deve ser gravado');

-- Caixa -> unidade: sem conversão universal, o fator explícito é obrigatório.
select public.create_ingredient(
  '00000000-0000-0000-0000-00000000a008', 'ING-007', 'Caixa Pizza Oitavada G', pg_temp.ctx('cat_massas'),
  'caixa', 'un', 'un', 100, 1, 0, 50, null, 0, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_caixa', :'v');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a009', 'ING-008', 'Caixa sem fator', pg_temp.ctx('cat_massas'),
    'caixa', 'un', 'un', null, 1, 0, 0, null, 0, null, null, null) $sql$,
  'Informe os fatores de conversão');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a00a', 'ING-009', 'Unidade com fator 2', pg_temp.ctx('cat_massas'),
    'un', 'un', 'un', 2, 1, 0, 0, null, 0, null, null, null) $sql$,
  'exigem fator 1');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a00b', 'ING-010', 'Unidade inventada', pg_temp.ctx('cat_massas'),
    'libra', 'kg', 'g', 1, 0.001, 0, 0, null, 0, null, null, null) $sql$,
  'Unidade de medida desconhecida');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a00c', 'ING-011', 'Limite menor', pg_temp.ctx('cat_massas'),
    'kg', 'kg', 'g', 1, 0.001, 0, 10, 5, 0, null, null, null) $sql$,
  'ingredients_max_not_below_min');

select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000a00d', 'ING-012', 'Validade inválida', pg_temp.ctx('cat_massas'),
    'kg', 'kg', 'g', 1, 0.001, 0, 0, null, 0, null, null, 0) $sql$,
  'shelf_life_days');

select pg_temp.assert_true(
  (select count(*) from public.ingredients where organization_id = :'org_a') = 4,
  'apenas os cadastros válidos devem existir: mussarela, farinha, azeite e caixa');

\! echo '== Permissões verificadas no backend'

select pg_temp.as_user(:'user_b');
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000b001', 'ING-999', 'Tentativa do atendente', pg_temp.ctx('cat_massas'),
    'kg', 'kg', 'g', 1, 0.001, 0, 0, null, 0, null, null, null) $sql$,
  'Seu perfil não pode cadastrar insumos');
select pg_temp.expect_error(
  $sql$ select public.create_ingredient_category('Doces') $sql$,
  'Seu perfil não pode cadastrar categorias');
select pg_temp.expect_error(
  $sql$ select public.create_supplier('Fornecedor', null, null, null, null) $sql$,
  'Seu perfil não pode cadastrar fornecedores');
select pg_temp.expect_error(
  $sql$ update public.ingredients set name = 'Alterado direto' $sql$,
  'permission denied');
select pg_temp.expect_error(
  $sql$ insert into public.stock_movements (organization_id, ingredient_id, movement_type, quantity_delta, unit, balance_before, balance_after, idempotency_key, performed_by)
        values (gen_random_uuid(), gen_random_uuid(), 'ajuste_positivo', 1, 'kg', 0, 1, gen_random_uuid(), '22222222-2222-2222-2222-222222222222') $sql$,
  'permission denied');
select pg_temp.assert_true(
  (select count(*) from public.ingredients) = 4,
  'atendente deve conseguir ler os insumos da própria organização');
select pg_temp.assert_true(
  (select count(*) from public.audit_logs) = 0,
  'somente administradores leem o log de auditoria');
select pg_temp.as_superuser();

\! echo '== Livro de movimentações imutável'

select pg_temp.expect_error(
  $sql$ update public.stock_movements set reason = 'alterado' $sql$,
  'imutáveis');
select pg_temp.expect_error(
  $sql$ delete from public.stock_movements $sql$,
  'imutáveis');
select pg_temp.expect_error(
  $sql$ update public.audit_logs set action = 'alterado' $sql$,
  'imutáveis');
select pg_temp.expect_error(
  $sql$ insert into public.stock_movements (organization_id, ingredient_id, movement_type, quantity_delta, unit, balance_before, balance_after, idempotency_key, performed_by)
        select organization_id, id, 'ajuste_negativo', -100, 'kg', 15, -85, gen_random_uuid(), '11111111-1111-1111-1111-111111111111'
        from public.ingredients where id = pg_temp.ctx('ing_mussarela') $sql$,
  'stock_movements_balance_after_check');
select pg_temp.expect_error(
  $sql$ insert into public.stock_movements (organization_id, ingredient_id, movement_type, quantity_delta, unit, balance_before, balance_after, idempotency_key, performed_by)
        select organization_id, id, 'ajuste_negativo', -5, 'kg', 15, 20, gen_random_uuid(), '11111111-1111-1111-1111-111111111111'
        from public.ingredients where id = pg_temp.ctx('ing_mussarela') $sql$,
  'stock_movements_balance_consistent');

\! echo '== Isolamento entre organizações (Teste 11)'

-- Insumo e fornecedor da pizzaria C, usados para provar que A não os alcança.
select pg_temp.as_user(:'user_c');
select public.create_ingredient(
  '00000000-0000-0000-0000-00000000c002', 'ING-C02', 'Mussarela da Central', pg_temp.ctx('cat_c_queijos'),
  'kg', 'kg', 'g', 1, 0.001, 3, 0, null, 0, null, null, null
) as v \gset
insert into pg_temp.ids (k, v) values ('ing_c', :'v');

select public.create_supplier('Laticínios da Central', '11222333000181', null, null, null) as v \gset
insert into pg_temp.ids (k, v) values ('supplier_c', :'v');

select pg_temp.assert_true(
  (select count(*) from public.ingredients) = 1,
  'usuário de outra pizzaria deve ver apenas os próprios insumos');
select pg_temp.assert_true(
  (select count(*) from public.ingredients where id = pg_temp.ctx('ing_mussarela')) = 0,
  'insumo de outra pizzaria não pode ser consultado');
select pg_temp.assert_true(
  (select count(*) from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 0,
  'saldo de outra pizzaria não pode ser consultado');
select pg_temp.assert_true(
  (select count(*) from public.audit_logs where organization_id = :'org_a') = 0,
  'log de auditoria de outra pizzaria não pode ser consultado');
select pg_temp.expect_error(
  $sql$ update public.ingredients set name = 'Invadido' where id = pg_temp.ctx('ing_mussarela') $sql$,
  'permission denied');
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000c003', 'ING-C03', 'Invasão', pg_temp.ctx('cat_queijos'),
    'kg', 'kg', 'g', 1, 0.001, 0, 0, null, 0, null, null, null) $sql$,
  'Categoria não pertence');
select pg_temp.as_superuser();

\! echo '== Fornecedores'

select pg_temp.as_user(:'user_a');
select public.create_supplier('Distribuidora Napoli', '123.456.789-09', '(11) 99999-0000', 'contato@napoli.teste', null)
  as v \gset
insert into pg_temp.ids (k, v) values ('supplier_a', :'v');

select pg_temp.expect_error(
  $sql$ select public.create_supplier('Fornecedor inválido', '123', null, null, null) $sql$,
  'CPF deve ter 11 dígitos');

-- Fornecedor de outra pizzaria não pode ser vinculado a um insumo daqui.
select pg_temp.expect_error(
  $sql$ select public.create_ingredient(
    '00000000-0000-0000-0000-00000000d001', 'ING-D01', 'Com fornecedor alheio', pg_temp.ctx('cat_queijos'),
    'kg', 'kg', 'g', 1, 0.001, 0, 0, null, 0, pg_temp.ctx('supplier_c'), null, null) $sql$,
  'Fornecedor não pertence');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select document from public.suppliers where id = pg_temp.ctx('supplier_a')) = '12345678909',
  'CPF deve ser gravado somente com dígitos');

\! echo '== Auditoria'

select pg_temp.as_user(:'user_a');
select pg_temp.assert_true(
  (select count(*) from public.audit_logs where action = 'ingredient.created') = 4,
  'administrador deve ver as quatro ações de cadastro de insumo na auditoria');
select pg_temp.as_superuser();

select pg_temp.assert_true(
  (select balance from public.ingredient_balances where ingredient_id = pg_temp.ctx('ing_mussarela')) = 15,
  'saldo da mussarela deve continuar 15 ao final dos testes');

\o
\! echo "== FASE 1: TODOS OS TESTES SQL PASSARAM"

rollback;
