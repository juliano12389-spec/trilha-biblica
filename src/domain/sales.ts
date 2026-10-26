import { Decimal } from './decimal';
import { decimalPlaces } from './stock';
import type { Validation } from './production';

export const CHANNELS = [
  { code: 'balcao', label: 'Balcão' },
  { code: 'telefone', label: 'Telefone' },
  { code: 'whatsapp', label: 'WhatsApp' },
  { code: 'delivery', label: 'Delivery (app)' },
  { code: 'outro', label: 'Outro' },
] as const;

export const PAYMENTS = [
  { code: 'dinheiro', label: 'Dinheiro' },
  { code: 'pix', label: 'Pix' },
  { code: 'cartao', label: 'Cartão' },
  { code: 'outro', label: 'Outro' },
] as const;

export const SALES_MODES = [
  {
    code: 'baixa_na_producao',
    label: 'Baixa na produção',
    description: 'A produção baixa os ingredientes e gera pizzas prontas. A venda só consome as pizzas prontas.',
  },
  {
    code: 'baixa_na_venda',
    label: 'Baixa na venda',
    description: 'A venda baixa os ingredientes pela ficha. Não há produção avulsa de pizzas.',
  },
] as const;

export type SalesModeCode = (typeof SALES_MODES)[number]['code'];

/**
 * Price of one pizza. A half-and-half is sold at the average of its two flavours,
 * rounded to centavos (same rule as register_sale).
 */
export function pizzaUnitPrice(priceA: Decimal, priceB: Decimal | null): Decimal {
  if (priceB === null) return priceA;
  const average = priceA.add(priceB).divide(2);
  return Decimal.of(average.toFixed(2));
}

export interface SaleLine {
  unitPrice: Decimal;
  pizzas: number;
}

export function saleSubtotal(lines: readonly SaleLine[]): Decimal {
  return lines.reduce((sum, line) => sum.add(line.unitPrice.multiply(line.pizzas)), Decimal.ZERO);
}

export function validateDiscount(discountText: string, subtotal: Decimal): Validation<Decimal> {
  const trimmed = discountText.trim();
  if (trimmed === '') return { ok: true, value: Decimal.ZERO };
  const discount = Decimal.parseUserInput(trimmed);
  if (discount === null || discount.isNegative() || decimalPlaces(discount) > 2) {
    return { ok: false, message: 'Informe o desconto em reais (zero ou mais, com até 2 casas).' };
  }
  if (discount.compareTo(subtotal) > 0) {
    return { ok: false, message: `O desconto não pode ser maior que o subtotal (R$ ${subtotal.toFixed(2).replace('.', ',')}).` };
  }
  return { ok: true, value: discount };
}

export interface CancelItemInput {
  itemId: string;
  pizzas: number;
  recovered: string;
}

/** Recovered pizzas per line: whole numbers between 0 and the number sold. Blank = 0. */
export function validateRecovered(items: readonly CancelItemInput[]): Validation<{ itemId: string; recovered: number }[]> {
  const parsed: { itemId: string; recovered: number }[] = [];
  for (const item of items) {
    const text = item.recovered.trim();
    const value = text === '' ? 0 : Number(text);
    if (!Number.isInteger(value) || value < 0 || value > item.pizzas) {
      return { ok: false, message: `Recuperadas: informe de 0 a ${item.pizzas} pizzas neste item.` };
    }
    parsed.push({ itemId: item.itemId, recovered: value });
  }
  return { ok: true, value: parsed };
}

export function validateCancellationReason(reason: string): Validation<string> {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 300) {
    return { ok: false, message: 'Informe o motivo do cancelamento (de 3 a 300 caracteres).' };
  }
  return { ok: true, value: trimmed };
}
