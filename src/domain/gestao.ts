import { Decimal } from './decimal';
import { decimalPlaces } from './stock';
import type { Validation } from './production';

export const WASTE_REASONS = [
  { code: 'vencimento', label: 'Vencimento' },
  { code: 'erro_preparo', label: 'Erro de preparo' },
  { code: 'derrubado', label: 'Derrubado / queda' },
  { code: 'armazenamento_inadequado', label: 'Armazenamento inadequado' },
  { code: 'falha_equipamento', label: 'Falha de equipamento' },
  { code: 'sobra_nao_aproveitavel', label: 'Sobra não aproveitável' },
  { code: 'outros', label: 'Outros' },
] as const;

export type WasteReasonCode = (typeof WASTE_REASONS)[number]['code'];

export interface CountDifference {
  /** counted - system. Positive means more than the system says. */
  difference: Decimal;
  /** Percentage of the system balance. Null when the system balance is zero. */
  percent: Decimal | null;
  /** difference x average cost, rounded to centavos. */
  financialImpact: Decimal;
}

export function countDifference(system: Decimal, counted: Decimal, averageCost: Decimal): CountDifference {
  const difference = counted.subtract(system);
  const percent = system.isZero() ? null : difference.multiply(100).divide(system);
  const financialImpact = Decimal.of(difference.multiply(averageCost).toFixed(2));
  return { difference, percent, financialImpact };
}

export function formatPercent(value: Decimal): string {
  const text = value.toFixed(1).replace('.', ',');
  return `${text}%`;
}

export interface CountLineInput {
  ingredientName: string;
  system: Decimal;
  counted: string;
  reason: string;
}

export interface CountLine {
  ingredientName: string;
  counted: Decimal;
  reason: string | null;
}

/**
 * Validates a physical count. Blank counts are skipped (not counted). A divergence
 * from the system balance requires a reason of at least three characters.
 */
export function validateCountLines(lines: readonly CountLineInput[]): Validation<CountLine[]> {
  const counted: CountLine[] = [];
  for (const line of lines) {
    if (line.counted.trim() === '') continue;
    const value = Decimal.parseUserInput(line.counted);
    if (value === null || value.isNegative() || decimalPlaces(value) > 4) {
      return { ok: false, message: `${line.ingredientName}: informe a contagem (zero ou mais, até 4 casas).` };
    }
    const reason = line.reason.trim();
    if (value.compareTo(line.system) !== 0 && reason.length < 3) {
      return { ok: false, message: `${line.ingredientName}: a contagem diverge do sistema. Informe o motivo.` };
    }
    counted.push({ ingredientName: line.ingredientName, counted: value, reason: value.compareTo(line.system) === 0 ? null : reason });
  }
  if (counted.length === 0) {
    return { ok: false, message: 'Informe a contagem de ao menos um insumo.' };
  }
  return { ok: true, value: counted };
}

export interface WasteInput {
  quantity: string;
  reason: string;
  notes: string;
}

export function validateWaste(input: WasteInput): Validation<{ quantity: Decimal; reason: WasteReasonCode; notes: string }> {
  const quantity = Decimal.parseUserInput(input.quantity);
  if (quantity === null || !quantity.isPositive() || decimalPlaces(quantity) > 4) {
    return { ok: false, message: 'Informe a quantidade perdida (maior que zero, até 4 casas).' };
  }
  const reason = WASTE_REASONS.find((option) => option.code === input.reason);
  if (!reason) {
    return { ok: false, message: 'Escolha o motivo da perda.' };
  }
  return { ok: true, value: { quantity, reason: reason.code, notes: input.notes.trim() } };
}

/** Margin per pizza. Ingredient cost is not profit: labour, rent and taxes are not in it. */
export function pizzaMargin(price: Decimal, ingredientCost: Decimal): { margin: Decimal; costShare: Decimal | null } {
  const margin = price.subtract(ingredientCost);
  const costShare = price.isZero() ? null : ingredientCost.multiply(100).divide(price);
  return { margin, costShare };
}
