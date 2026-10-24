# SOS Financeiro (React)

React + Vite implementation of the Stitch screens for the SOS Financeiro app:

- **Início**: safe-to-spend balance, monthly budget pace, and a debt-due alert.
- **Dívidas**: debt total, filters, priority ordering, and per-debt actions.
- **Plano**: snowball / avalanche comparison and the payoff projection.
- **Registrar Gasto**: voice, receipt, and manual entry, with recent entries and undo.

## Scripts

```bash
npm install
npm run dev     # local dev server
npm run build   # production build into dist/
npm run preview # serve the production build
```

Data is mock data in `src/data.js`. Money is stored as integer centavos.
