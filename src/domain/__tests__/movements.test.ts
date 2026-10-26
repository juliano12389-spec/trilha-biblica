import { Decimal } from '../decimal';
import { formatSignedDelta, movementLabel } from '../movements';

describe('movement labels and signs', () => {
  it('names known movement types and falls back for unknown ones', () => {
    expect(movementLabel('vencimento')).toBe('Descarte de vencido');
    expect(movementLabel('desconhecido')).toBe('Movimento');
  });

  it('prefixes entries with + and exits with -', () => {
    const format = (value: Decimal) => `${value.toFixed(2)} kg`;
    expect(formatSignedDelta(Decimal.of('5'), format)).toBe('+5.00 kg');
    expect(formatSignedDelta(Decimal.of('-2'), format)).toBe('-2.00 kg');
  });
});
