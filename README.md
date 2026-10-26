# StockPro — controle de estoque para pizzarias

Aplicativo Android (Expo + React Native + TypeScript) com backend Supabase (PostgreSQL, Auth e RLS)
para controlar o estoque de uma pizzaria: insumos, unidades, validade, movimentações e, nas próximas
fases, recebimentos, fichas técnicas, produção, vendas, inventário e custos.

**Status:** Fase 1 — Fundação (em andamento neste ciclo). Veja [Fases](#fases).

## Regras centrais

- Nenhuma quantidade é inventada. Todo saldo vem da soma do livro de movimentações.
- Quantidades usam `numeric(18,4)` no banco e `Decimal` (ponto fixo, sem ponto flutuante) no app.
- Conversões automáticas existem só para kg/g e L/ml. Outras conversões exigem fator cadastrado no insumo.
- Toda escrita passa por funções do banco que verificam papel e organização. O cliente só lê.
- Dados de cada pizzaria ficam isolados por Row Level Security.
- Cadastros e movimentos são idempotentes: reenviar a mesma solicitação não duplica nada.

## Estrutura

```
src/
  app/                  rotas (Expo Router): login, cadastro, criar-organizacao, (tabs), insumo/novo
  components/ui.tsx     componentes visuais reutilizáveis
  data/                 acesso aos dados (Supabase RPC e leituras)
  domain/               regras puras: Decimal, unidades, validação de insumo, formatação (testadas)
  features/auth/        sessão e perfil do usuário
  hooks/                carregamento de dados por tela
  lib/                  cliente Supabase e identificadores de solicitação
  theme/                cores e espaçamentos
supabase/
  migrations/           migrações versionadas (ordem por nome do arquivo)
  tests/                testes SQL (RLS, permissões, regras de consistência)
  tests/local/          stub de auth para testes locais — NÃO aplicar em projeto Supabase
scripts/db-test.sh      recria um banco local descartável e roda migrações + testes SQL
```

## Como executar

Requisitos: Node 22+, npm. Para testar o banco localmente: PostgreSQL 16.

```bash
npm install
cp .env.example .env.local      # preencha a URL e a chave anon do seu projeto Supabase
npx expo start                  # abra no Expo Go (ou um development build)
```

Sem as variáveis `EXPO_PUBLIC_SUPABASE_*`, o app mostra uma tela pedindo a configuração.

### Aplicar as migrações no Supabase

As migrações ficam em `supabase/migrations/` e devem ser aplicadas em ordem, uma vez por projeto:

- Pelo SQL Editor do painel do Supabase, colando o arquivo; ou
- com a CLI: `supabase link --project-ref <ref>` e depois `supabase db push`.

A migração da Fase 1 é `20261026120000_fase1_fundacao.sql`.

## Testes

```bash
npm run typecheck      # tsc --noEmit
npx eslint .           # lint
npm test               # testes unitários do domínio (Jest)
npm run db:test        # cria banco descartável local e roda migrações + testes SQL
```

`db:test` usa `PGHOST`, `PGPORT` e `PGUSER` (padrão `127.0.0.1:5432`, usuário `postgres`) e recria o banco
`stockpro_test`. Ele recusa hosts que não sejam locais.

Cobertura atual:

- **Domínio (Jest):** aritmética decimal, conversões (inclui o Teste 7: 5 kg = 5.000 g), validação do
  cadastro de insumo e formatação pt-BR.
- **Banco (SQL):** cadastro com saldo inicial, idempotência de reenvio, validação de fatores, Teste 7 no
  saldo, bloqueio de atendente, livro de movimentações imutável, isolamento entre pizzarias (Teste 11),
  fornecedores e auditoria.

## Segurança

- Chaves: o app só recebe a URL pública e a chave `anon`. Nenhuma chave de serviço entra no projeto.
- Papéis: `administrador`, `gerente`, `estoquista`, `pizzaiolo`, `atendente`. Cadastro de insumos e
  categorias é permitido a administrador e gerente, verificado no banco.
- Auditoria: ações de cadastro são gravadas em `audit_logs`, legível somente por administradores.

## Fases

| Fase | Escopo | Estado |
| --- | --- | --- |
| 1 — Fundação | Autenticação, organização, categorias, unidades e conversões, fornecedores (base), insumos com saldo inicial, livro de movimentações, RLS | **Em andamento** |
| 2 — Estoque | Recebimentos, lotes e validade (FEFO), movimentações, alertas | Pendente |
| 3 — Produção | Fichas técnicas, conversões de receita, produção por lote, pizzas meio a meio | Pendente |
| 4 — Vendas | Pedidos, baixa na venda ou na produção, cancelamentos e estornos | Pendente |
| 5 — Gestão | Custos, inventário físico, perdas, relatórios, dashboard, sugestão de compras | Pendente |
| 6 — Qualidade | Testes de fluxo, segurança, desempenho, publicação Android | Pendente |

### Pendências conhecidas da Fase 1

- Telas autenticadas (Estoque e Cadastro) foram compiladas e exportadas, mas não foram exercitadas contra um
  projeto Supabase real.
- Tipos do banco em `src/data/types.ts` foram escritos à mão. Regenere com `supabase gen types typescript`
  quando houver projeto vinculado.
- Concorrência de baixa de estoque (Teste 10) depende de consumo, então entra na Fase 2.
- Cadastro de fornecedores pela interface chega na Fase 2 (hoje só pelo banco).
- Permissões por ação além de cadastro (matriz completa de papéis) entram nas fases seguintes.
