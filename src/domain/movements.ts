import type { Decimal } from './decimal';

export const MOVEMENT_TYPES = [
  'saldo_inicial',
  'recebimento',
  'consumo_producao',
  'consumo_venda',
  'perda',
  'vencimento',
  'ajuste_positivo',
  'ajuste_negativo',
  'devolucao_fornecedor',
  'devolucao_cliente',
  'transferencia',
  'estorno',
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

const LABELS: Record<MovementType, string> = {
  saldo_inicial: 'Saldo inicial',
  recebimento: 'Recebimento',
  consumo_producao: 'Consumo na produção',
  consumo_venda: 'Consumo na venda',
  perda: 'Perda',
  vencimento: 'Descarte de vencido',
  ajuste_positivo: 'Ajuste (entrada)',
  ajuste_negativo: 'Ajuste (saída)',
  devolucao_fornecedor: 'Devolução ao fornecedor',
  devolucao_cliente: 'Devolução de cliente',
  transferencia: 'Transferência',
  estorno: 'Estorno',
};

export function movementLabel(type: string): string {
  return (LABELS as Record<string, string>)[type] ?? 'Movimento';
}

/** Signed text for a quantity: "+5,00 kg" or "-2,00 kg". */
export function formatSignedDelta(delta: Decimal, format: (value: Decimal) => string): string {
  return delta.isNegative() ? `-${format(delta.multiply(-1))}` : `+${format(delta)}`;
}
