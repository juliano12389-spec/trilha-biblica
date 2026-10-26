import { Decimal } from '../decimal';
import { countDifference, formatPercent, pizzaMargin, validateCountLines, validateWaste } from '../gestao';

const d = (value: string) => Decimal.of(value);

describe('countDifference', () => {
  it('Teste 9: a 2 kg shortage at 38,50 per kg is -2 kg, -13,3% and -77,00', () => {
    const result = countDifference(d('15'), d('13'), d('38.5'));
    expect(result.difference.toString()).toBe('-2');
    expect(formatPercent(result.percent ?? Decimal.ZERO)).toBe('-13,3%');
    expect(result.financialImpact.toFixed(2)).toBe('-77.00');
  });

  it('has no percentage when the system balance is zero', () => {
    expect(countDifference(d('0'), d('3'), d('10')).percent).toBeNull();
  });
});

describe('validateCountLines', () => {
  it('skips blank counts and requires a reason for every divergence', () => {
    const result = validateCountLines([
      { ingredientName: 'Muçarela', system: d('15'), counted: '13', reason: '' },
      { ingredientName: 'Calabresa', system: d('4'), counted: '', reason: '' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('accepts a divergence with a reason and drops the reason when counts match', () => {
    const result = validateCountLines([
      { ingredientName: 'Muçarela', system: d('15'), counted: '13', reason: 'Queda na câmara' },
      { ingredientName: 'Calabresa', system: d('4'), counted: '4', reason: 'ignorado' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].reason).toBe('Queda na câmara');
      expect(result.value[1].reason).toBeNull();
    }
  });

  it('refuses a count with nothing counted', () => {
    expect(validateCountLines([{ ingredientName: 'x', system: d('1'), counted: '', reason: '' }]).ok).toBe(false);
  });
});

describe('validateWaste', () => {
  it('requires a positive quantity and a known reason', () => {
    expect(validateWaste({ quantity: '1', reason: 'vencimento', notes: '' }).ok).toBe(true);
    expect(validateWaste({ quantity: '0', reason: 'vencimento', notes: '' }).ok).toBe(false);
    expect(validateWaste({ quantity: '1', reason: 'roubo', notes: '' }).ok).toBe(false);
  });
});

describe('pizzaMargin', () => {
  it('margin is price minus ingredient cost, and cost share is cost over price', () => {
    const { margin, costShare } = pizzaMargin(d('59.90'), d('18.81'));
    expect(margin.toFixed(2)).toBe('41.09');
    expect(formatPercent(costShare ?? Decimal.ZERO)).toBe('31,4%');
  });
});
