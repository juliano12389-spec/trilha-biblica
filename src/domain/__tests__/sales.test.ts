import { Decimal } from '../decimal';
import {
  pizzaUnitPrice,
  saleSubtotal,
  validateCancellationReason,
  validateDiscount,
  validateRecovered,
} from '../sales';

const d = (value: string) => Decimal.of(value);

describe('pizzaUnitPrice', () => {
  it('sells a whole pizza at its flavour price', () => {
    expect(pizzaUnitPrice(d('59.90'), null).toFixed(2)).toBe('59.90');
  });

  it('sells a half-and-half at the average of its two flavours', () => {
    expect(pizzaUnitPrice(d('59.90'), d('49.90')).toFixed(2)).toBe('54.90');
  });

  it('rounds the half-and-half average to centavos, half away from zero', () => {
    expect(pizzaUnitPrice(d('10.00'), d('10.01')).toFixed(2)).toBe('10.01');
  });
});

describe('saleSubtotal and discount', () => {
  it('sums lines exactly: 2 x 59,90 + 1 x 54,90 = 174,70', () => {
    const subtotal = saleSubtotal([
      { unitPrice: d('59.90'), pizzas: 2 },
      { unitPrice: d('54.90'), pizzas: 1 },
    ]);
    expect(subtotal.toFixed(2)).toBe('174.70');
  });

  it('accepts a discount up to the subtotal and rejects more', () => {
    const subtotal = d('174.70');
    expect(validateDiscount('10', subtotal).ok).toBe(true);
    expect(validateDiscount('174,70', subtotal).ok).toBe(true);
    expect(validateDiscount('174,71', subtotal).ok).toBe(false);
    expect(validateDiscount('-1', subtotal).ok).toBe(false);
  });

  it('treats a blank discount as zero', () => {
    const result = validateDiscount('', d('10'));
    expect(result.ok && result.value.isZero()).toBe(true);
  });
});

describe('validateRecovered', () => {
  it('defaults blank to zero and accepts 0..pizzas', () => {
    const result = validateRecovered([
      { itemId: 'a', pizzas: 2, recovered: '1' },
      { itemId: 'b', pizzas: 1, recovered: '' },
    ]);
    expect(result).toEqual({ ok: true, value: [{ itemId: 'a', recovered: 1 }, { itemId: 'b', recovered: 0 }] });
  });

  it('rejects more recovered pizzas than were sold, and fractions', () => {
    expect(validateRecovered([{ itemId: 'a', pizzas: 2, recovered: '3' }]).ok).toBe(false);
    expect(validateRecovered([{ itemId: 'a', pizzas: 2, recovered: '0,5' }]).ok).toBe(false);
  });
});

describe('validateCancellationReason', () => {
  it('requires a real reason', () => {
    expect(validateCancellationReason('  ').ok).toBe(false);
    expect(validateCancellationReason('Cliente desistiu').ok).toBe(true);
  });
});
