import { Decimal } from '../decimal';
import {
  daysBetween,
  isIsoDate,
  lotExpiryStatus,
  parseSignedQuantity,
  receiptTotal,
  validateReceiptItem,
  weightedAverageCost,
  type ReceiptItemInput,
} from '../stock';

const TODAY = '2026-10-27';

const base: ReceiptItemInput = {
  ingredientId: 'ing-1',
  ingredientName: 'Queijo Muçarela',
  quantity: '5',
  unitCost: '40',
  lotCode: 'L-A',
  manufacturedOn: TODAY,
  expiresOn: '2026-11-26',
  requiresExpiry: true,
};

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-10-27')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('27/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('lotExpiryStatus', () => {
  it('classifies lots by days until expiry', () => {
    expect(lotExpiryStatus(null, TODAY)).toBe('sem_validade');
    expect(lotExpiryStatus('2026-10-26', TODAY)).toBe('vencido');
    expect(lotExpiryStatus(TODAY, TODAY)).toBe('vence_em_breve');
    expect(lotExpiryStatus('2026-11-03', TODAY)).toBe('vence_em_breve');
    expect(lotExpiryStatus('2026-11-04', TODAY)).toBe('ok');
  });

  it('counts days across month boundaries', () => {
    expect(daysBetween('2026-10-27', '2026-11-03')).toBe(7);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('weightedAverageCost', () => {
  it('matches the database formula: 10 kg at 38,50 plus 5 kg at 40,00 is 39,00', () => {
    const average = weightedAverageCost(Decimal.of(10), Decimal.of('38.5'), Decimal.of(200), Decimal.of(5));
    expect(average.toFixed(4)).toBe('39.0000');
  });

  it('matches the second scenario in the database test: 14 kg at 39,00 plus 10 kg at 30,00 is 35,25', () => {
    const average = weightedAverageCost(Decimal.of(14), Decimal.of(39), Decimal.of(300), Decimal.of(10));
    expect(average.toFixed(2)).toBe('35.25');
  });

  it('takes the purchase price when the stock is empty', () => {
    const average = weightedAverageCost(Decimal.ZERO, Decimal.ZERO, Decimal.of(120), Decimal.of(3));
    expect(average.toFixed(2)).toBe('40.00');
  });

  it('refuses a zero total quantity', () => {
    expect(() => weightedAverageCost(Decimal.ZERO, Decimal.ZERO, Decimal.ZERO, Decimal.ZERO)).toThrow(RangeError);
  });
});

describe('validateReceiptItem', () => {
  it('accepts a complete line and computes the line total', () => {
    const result = validateReceiptItem(base, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.total.toFixed(2)).toBe('200.00');
    expect(result.value.expiresOn).toBe('2026-11-26');
  });

  it('requires an expiry date for ingredients that control shelf life', () => {
    const result = validateReceiptItem({ ...base, expiresOn: '' }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/informe a validade/);
  });

  it('accepts a missing expiry when the ingredient does not control shelf life', () => {
    const result = validateReceiptItem({ ...base, expiresOn: '', requiresExpiry: false }, TODAY);
    expect(result.ok).toBe(true);
  });

  it('blocks expired lots at receipt', () => {
    const result = validateReceiptItem({ ...base, expiresOn: '2026-10-01' }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/já está vencido/);
  });

  it('rejects a manufacturing date after expiry and a future manufacturing date', () => {
    expect(validateReceiptItem({ ...base, manufacturedOn: '2026-12-01' }, TODAY).ok).toBe(false);
    expect(validateReceiptItem({ ...base, manufacturedOn: '2026-10-28' }, TODAY).ok).toBe(false);
  });

  it('rejects zero quantities, negative costs, and malformed dates', () => {
    expect(validateReceiptItem({ ...base, quantity: '0' }, TODAY).ok).toBe(false);
    expect(validateReceiptItem({ ...base, unitCost: '-1' }, TODAY).ok).toBe(false);
    expect(validateReceiptItem({ ...base, expiresOn: '26/11/2026' }, TODAY).ok).toBe(false);
  });

  it('names the ingredient in every message', () => {
    const result = validateReceiptItem({ ...base, quantity: 'x' }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.startsWith('Queijo Muçarela:')).toBe(true);
  });

  it('sums receipt lines with exact decimals', () => {
    const lines = [
      validateReceiptItem({ ...base, quantity: '0.1', unitCost: '0.2' }, TODAY),
      validateReceiptItem({ ...base, quantity: '0.2', unitCost: '0.1' }, TODAY),
    ];
    const items = lines.map((line) => (line.ok ? line.value : null)).filter((v) => v !== null);
    expect(receiptTotal(items).toFixed(2)).toBe('0.04');
  });
});

describe('parseSignedQuantity', () => {
  it('reads signed quantities in pt-BR and dot notation', () => {
    expect(parseSignedQuantity('-2')?.toString()).toBe('-2');
    expect(parseSignedQuantity('+1,5')?.toString()).toBe('1.5');
    expect(parseSignedQuantity('3.25')?.toString()).toBe('3.25');
  });

  it('rejects zero, blank, and more than four decimals', () => {
    expect(parseSignedQuantity('0')).toBeNull();
    expect(parseSignedQuantity('')).toBeNull();
    expect(parseSignedQuantity('1,00001')).toBeNull();
  });
});
