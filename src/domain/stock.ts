import { Decimal } from './decimal';

/**
 * Stock rules shared by the receipt and adjustment screens. The database
 * repeats the authoritative checks; these only give fast, specific feedback.
 */

export const LOT_LIMITS = { codeMax: 40, expiryWarningDays: 7 } as const;
export const ADJUSTMENT_REASON = { min: 3, max: 300 } as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns true for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type LotStatus = 'sem_validade' | 'vencido' | 'vence_em_breve' | 'ok';

/**
 * Expiry status of a lot. A lot expiring today is still usable; it becomes
 * "vencido" the day after its expiry date, matching the backend check.
 */
export function lotExpiryStatus(expiresOn: string | null, today: string): LotStatus {
  if (expiresOn === null) return 'sem_validade';
  const days = daysBetween(today, expiresOn);
  if (days < 0) return 'vencido';
  if (days <= LOT_LIMITS.expiryWarningDays) return 'vence_em_breve';
  return 'ok';
}

/**
 * Weighted average cost by value, as computed in register_goods_receipt:
 * (balance * average + addedValue) / (balance + addedQuantity), rounded to 4 places.
 */
export function weightedAverageCost(
  balance: Decimal,
  average: Decimal,
  addedValue: Decimal,
  addedQuantity: Decimal,
): Decimal {
  const totalQuantity = balance.add(addedQuantity);
  if (!totalQuantity.isPositive()) {
    throw new RangeError('Quantidade total deve ser positiva para calcular o custo médio');
  }
  const value = balance.multiply(average).add(addedValue);
  return Decimal.of(value.divide(totalQuantity).toFixed(4));
}

/** Parses a signed quantity typed by the user ("-2", "+1,5", "3"). */
export function parseSignedQuantity(text: string): Decimal | null {
  const trimmed = text.trim();
  const unsigned = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const value = Decimal.parseUserInput(unsigned);
  if (value === null || value.isZero() || decimalPlaces(value) > 4) return null;
  return value;
}

export function decimalPlaces(value: Decimal): number {
  const text = value.toString();
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export interface ReceiptItemInput {
  ingredientId: string;
  ingredientName: string;
  quantity: string;
  unitCost: string;
  lotCode: string;
  manufacturedOn: string;
  expiresOn: string;
  /** Required when the ingredient controls shelf life. */
  requiresExpiry: boolean;
}

export interface ReceiptItem {
  ingredientId: string;
  ingredientName: string;
  quantity: Decimal;
  unitCost: Decimal;
  total: Decimal;
  lotCode: string;
  manufacturedOn: string | null;
  expiresOn: string | null;
}

export type ItemValidation = { ok: true; value: ReceiptItem } | { ok: false; message: string };

/** Validates one receipt line. Messages name the ingredient so the user knows which line to fix. */
export function validateReceiptItem(input: ReceiptItemInput, today: string): ItemValidation {
  const name = input.ingredientName;
  const quantity = Decimal.parseUserInput(input.quantity);
  if (quantity === null || !quantity.isPositive() || decimalPlaces(quantity) > 4) {
    return { ok: false, message: `${name}: informe uma quantidade maior que zero (até 4 casas).` };
  }

  const unitCost = Decimal.parseUserInput(input.unitCost);
  if (unitCost === null || unitCost.isNegative() || decimalPlaces(unitCost) > 4) {
    return { ok: false, message: `${name}: informe o custo unitário (zero ou mais, até 4 casas).` };
  }

  const lotCode = input.lotCode.trim();
  if (lotCode.length < 1 || lotCode.length > LOT_LIMITS.codeMax) {
    return { ok: false, message: `${name}: informe o lote (até ${LOT_LIMITS.codeMax} caracteres).` };
  }

  const manufacturedOn = input.manufacturedOn.trim() === '' ? null : input.manufacturedOn.trim();
  if (manufacturedOn !== null && !isIsoDate(manufacturedOn)) {
    return { ok: false, message: `${name}: data de fabricação inválida. Use AAAA-MM-DD.` };
  }
  if (manufacturedOn !== null && manufacturedOn > today) {
    return { ok: false, message: `${name}: a fabricação não pode ser futura.` };
  }

  const expiresOn = input.expiresOn.trim() === '' ? null : input.expiresOn.trim();
  if (expiresOn !== null && !isIsoDate(expiresOn)) {
    return { ok: false, message: `${name}: data de validade inválida. Use AAAA-MM-DD.` };
  }
  if (input.requiresExpiry && expiresOn === null) {
    return { ok: false, message: `${name}: informe a validade (este insumo controla validade).` };
  }
  if (expiresOn !== null && expiresOn < today) {
    return { ok: false, message: `${name}: este lote já está vencido. O recebimento foi bloqueado.` };
  }
  if (manufacturedOn !== null && expiresOn !== null && manufacturedOn > expiresOn) {
    return { ok: false, message: `${name}: a fabricação é posterior à validade.` };
  }

  return {
    ok: true,
    value: {
      ingredientId: input.ingredientId,
      ingredientName: name,
      quantity,
      unitCost,
      total: Decimal.of(quantity.multiply(unitCost).toFixed(2)),
      lotCode,
      manufacturedOn,
      expiresOn,
    },
  };
}

export function receiptTotal(items: readonly ReceiptItem[]): Decimal {
  return items.reduce((sum, item) => sum.add(item.total), Decimal.ZERO);
}

/** ISO date `days` before (negative) or after (positive) `iso`. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
