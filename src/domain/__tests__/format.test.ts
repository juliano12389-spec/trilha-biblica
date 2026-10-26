import { Decimal } from '../decimal';
import { formatBRL, formatDateBr, formatNumber, formatQuantity } from '../format';

describe('pt-BR formatting', () => {
  it('formats currency with a comma decimal mark and dot thousands', () => {
    expect(formatBRL(Decimal.of('38.5'))).toBe('R$ 38,50');
    expect(formatBRL(Decimal.of('1234567.891'))).toBe('R$ 1.234.567,89');
  });

  it('formats negative numbers with a leading minus', () => {
    expect(formatNumber(Decimal.of('-1234.5'), 1)).toBe('-1.234,5');
  });

  it('formats quantities with their unit', () => {
    expect(formatQuantity(Decimal.of('15'), 'kg')).toBe('15,00 kg');
    expect(formatQuantity(Decimal.of('5000'), 'g', 0)).toBe('5.000 g');
  });
});

describe('formatDateBr', () => {
  it('turns ISO dates into day/month/year', () => {
    expect(formatDateBr('2026-10-27')).toBe('27/10/2026');
    expect(formatDateBr('2026-10-27T12:00:00Z')).toBe('27/10/2026');
    expect(formatDateBr('sem data')).toBe('sem data');
  });
});
