import { Decimal } from './decimal';

/**
 * pt-BR formatting done by hand: Hermes' Intl support differs between Android
 * devices, and the output here must not depend on the device locale.
 */

function groupThousands(wholeDigits: string): string {
  return wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1234.5" -> "1.234,50" with the requested fraction digits. */
export function formatNumber(value: Decimal, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const negative = fixed.startsWith('-');
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fraction] = unsigned.split('.');
  const body = fraction === undefined ? groupThousands(whole) : `${groupThousands(whole)},${fraction}`;
  return negative ? `-${body}` : body;
}

export function formatBRL(value: Decimal): string {
  return `R$ ${formatNumber(value, 2)}`;
}

/** Quantity with its unit, e.g. "15,00 kg". Use the unit code as typed in the catalog. */
export function formatQuantity(value: Decimal, unit: string, decimals = 2): string {
  return `${formatNumber(value, decimals)} ${unit}`;
}
