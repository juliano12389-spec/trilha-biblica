// Mock data taken from the Stitch screens. Money is stored as integer centavos.

export const RENDA_LIQUIDA = 420000;
export const CUSTOS_FIXOS = 246000;
export const PARCELAS_MES = 90000;
export const SALDO_INICIAL = RENDA_LIQUIDA - CUSTOS_FIXOS - PARCELAS_MES; // 84000 -> R$ 840,00
export const RITMO_DIARIO = 2800; // R$ 28,00 / dia até o dia 30
export const PROGRESSO_MES = 0.66;

export const ALERTA_FATURA = {
  titulo: 'Cartão Nubank',
  valor: 38000,
  diasRestantes: 3,
  diaLimite: 12,
};

export const RECENTES_INICIAIS = [
  { id: 'item-1', titulo: 'Café da Manhã & Pão', sub: 'Padaria Central • 08:15', icon: 'local_cafe', valor: 1420, metodo: 'Pix' },
  { id: 'item-2', titulo: 'Recarga Transporte', sub: 'Bilhete Único • 07:40', icon: 'directions_bus', valor: 3000, metodo: 'Débito' },
  { id: 'item-3', titulo: 'Farmácia Drogasil', sub: 'Saúde • Ontem', icon: 'medication', valor: 2290, metodo: 'Débito' },
];

export const DIVIDAS = [
  {
    id: 'nubank',
    nome: 'Cartão Nubank',
    tipo: 'Cartão',
    rotativo: true,
    saldo: 245000,
    taxaMensal: 14.2,
    vencimento: 'Vence em 15 de Outubro',
    diasRestantes: 3,
    alerta: { minimo: 36700, jurosSeisMeses: 189000 },
  },
  {
    id: 'emprestimo',
    nome: 'Empréstimo Pessoal',
    tipo: 'Empréstimo',
    saldo: 680000,
    taxaMensal: 2.1,
    parcela: 42000,
    parcelaAtual: 12,
    parcelasTotal: 24,
  },
  {
    id: 'financiamento',
    nome: 'Financiamento Veículo',
    tipo: 'Financiamento',
    saldo: 420000,
    taxaMensal: 1.4,
    parcela: 31000,
    parcelaAtual: 7,
    parcelasTotal: 36,
  },
  {
    id: 'cheque',
    nome: 'Cheque Especial',
    tipo: 'Cheque especial',
    saldo: 140000,
    taxaMensal: 8.5,
  },
];

export const FILTROS_DIVIDAS = [
  { id: 'todas', label: 'Todas' },
  { id: 'ranking', label: 'Mais Caras (Ranking)' },
  { id: 'Cartão', label: 'Cartões' },
  { id: 'Empréstimo', label: 'Empréstimos' },
  { id: 'Financiamento', label: 'Financiamentos' },
];

export const METODOS_PLANO = {
  bola_de_neve: {
    label: 'Bola de Neve',
    sub: 'Menor saldo primeiro',
    dica: 'conquiste vitórias rápidas eliminando os menores credores primeiro.',
    dicaTitulo: 'Ideal para motivação:',
  },
  avalanche: {
    label: 'Avalanche',
    sub: 'Maior taxa de juros',
    dica: 'ataque primeiro a dívida com juros mais altos para reduzir o custo total.',
    dicaTitulo: 'Ideal para economia:',
  },
};

export const PLANO_LIBERDADE = {
  mes: 'Novembro 2026',
  meses: 14,
  economiaJuros: 384000,
  aporteMensal: 15000,
  mesesAntes: 4,
};

// Transcription the voice flow "hears" in the Stitch mock.
export const TRANSCRICAO_EXEMPLO = 'Gastei 48 reais e 50 centavos no sacolão com frutas e legumes';
export const GASTO_EXEMPLO = {
  valor: 4850,
  descricao: 'Sacolão - frutas e legumes',
  categoria: '🥦 Alimentação',
  subcategoria: 'Supermercado & Sacolão',
  metodo: 'Débito / Pix',
};
