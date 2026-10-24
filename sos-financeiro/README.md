# SOS Financeiro (React)

Implementação em React + Vite das telas do Stitch do app SOS Financeiro:

- **Início**: saldo seguro para gastar, ritmo diário do mês e alerta de vencimento de fatura.
- **Dívidas**: total em aberto, filtros, ordenação por prioridade e ações por dívida.
- **Plano**: comparação entre Bola de Neve e Avalanche e projeção da quitação.
- **Registrar Gasto**: lançamento por voz, comprovante ou manual, com lançamentos recentes e desfazer.

## Scripts

```bash
npm install
npm run dev     # servidor de desenvolvimento local
npm run build   # build de produção em dist/
npm run preview # serve o build de produção
```

Os dados são fictícios e ficam em `src/data.js`. Os valores monetários são guardados em centavos (inteiros).
