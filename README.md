# StockPro — controle de estoque para pizzarias

Aplicativo Android (Expo + React Native + TypeScript) com backend Supabase (PostgreSQL, Auth e RLS)
para controlar o estoque de uma pizzaria: insumos, unidades, validade, movimentações e, nas próximas
fases, recebimentos, fichas técnicas, produção, vendas, inventário e custos.

**Status:** Fase 1 (Fundação) e Fase 2 (Estoque) concluídas. Veja [Fases](#fases).

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

Migrações, nesta ordem:

1. `20261026120000_fase1_fundacao.sql` — organizações, perfis, insumos, livro de movimentações.
2. `20261027120000_fase2_estoque.sql` — recebimentos, lotes, ajustes, custo médio e saldo por lote.

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
- **Domínio (Jest):** também validade de lotes, média ponderada, validação de recebimento e de ajuste.
- **Banco (SQL, Fase 1):** cadastro com saldo inicial, idempotência de reenvio, validação de fatores, Teste 7 no
  saldo, bloqueio de atendente, livro de movimentações imutável, isolamento entre pizzarias (Teste 11),
  fornecedores e auditoria.
- **Banco (SQL, Fase 2):** Teste 1 (10 kg + 5 kg = 15 kg), Teste 7 no recebimento, custo médio (39,00 e 35,25),
  nota fiscal duplicada, validade obrigatória e lote vencido bloqueado, conversão com mais de 4 casas,
  reenvio de recebimento e de ajuste, saldo insuficiente no lote, descarte de vencido como `vencimento`,
  reconciliação entre saldo do insumo e soma dos lotes, e isolamento de leitura.

## Segurança

- Chaves: o app só recebe a URL pública e a chave `anon`. Nenhuma chave de serviço entra no projeto.
- Papéis: `administrador`, `gerente`, `estoquista`, `pizzaiolo`, `atendente`. Cadastro de insumos e
  categorias é permitido a administrador e gerente, verificado no banco.
- Auditoria: ações de cadastro são gravadas em `audit_logs`, legível somente por administradores.

## Fases

| Fase | Escopo | Estado |
| --- | --- | --- |
| 1 — Fundação | Autenticação, organização, categorias, unidades e conversões, fornecedores (base), insumos com saldo inicial, livro de movimentações, RLS | Concluída |
| 2 — Estoque | Fornecedores, recebimentos com NF e lotes, validade (FEFO), custo médio, ajustes por lote, histórico e alertas | Concluída |
| 3 — Produção | Fichas técnicas, conversões de receita, produção por lote, pizzas meio a meio | Pendente |
| 4 — Vendas | Pedidos, baixa na venda ou na produção, cancelamentos e estornos | Pendente |
| 5 — Gestão | Custos, inventário físico, perdas, relatórios, dashboard, sugestão de compras | Pendente |
| 6 — Qualidade | Testes de fluxo, segurança, desempenho, publicação Android | Pendente |

### Pendências conhecidas

- Nenhuma tela autenticada foi exercitada contra um projeto Supabase real. As telas foram compiladas
  (bundle Android e web) e a lógica de cada RPC foi testada no banco local.
- Tipos do banco em `src/data/types.ts` foram escritos à mão. Regenere com `supabase gen types typescript`
  quando houver projeto vinculado.
- Estorno de recebimento não está implementado. Correções hoje são ajustes com motivo.
- O saldo inicial de um insumo entra como lote `SALDO-INICIAL` sem validade, porque a data não é conhecida.
- Custo médio muda só em recebimentos. Ajustes mantêm o custo médio atual.
- Teste 10 (concorrência): a baixa usa `FOR UPDATE` no insumo e nos lotes, mas o teste de concorrência real
  (duas sessões simultâneas) ainda não foi escrito. Entra junto com o consumo na Fase 3.
- Inventário físico (Teste 9) e desperdícios entram na Fase 5.
- Permissões por ação além de cadastro e recebimento (matriz completa de papéis) entram nas fases seguintes.
- Nenhum lote de consumo de produção existe ainda, então o bloqueio de lote vencido para consumo normal
  vale para ajustes e para recebimentos. Vale para produção quando ela existir.
