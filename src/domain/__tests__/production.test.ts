import { Decimal } from '../decimal';
import {
  requirementsForPizzas,
  validatePizzaOrder,
  validatePreparoBatch,
  validateProductDraft,
  validateRecipeLine,
  type StockRecipeLine,
} from '../production';

const d = (value: string) => Decimal.of(value);

// Stock quantities per whole pizza (already converted: g -> kg for mussarela and calabresa).
const CALABRESA: StockRecipeLine[] = [
  { ingredientId: 'massa', stockQuantity: d('350'), split: 'inteira' },
  { ingredientId: 'molho', stockQuantity: d('80'), split: 'metade' },
  { ingredientId: 'mussarela', stockQuantity: d('0.25'), split: 'metade' },
  { ingredientId: 'calabresa', stockQuantity: d('0.15'), split: 'metade' },
  { ingredientId: 'caixa', stockQuantity: d('1'), split: 'inteira' },
];

const MUSSARELA: StockRecipeLine[] = [
  { ingredientId: 'massa', stockQuantity: d('350'), split: 'inteira' },
  { ingredientId: 'molho', stockQuantity: d('80'), split: 'metade' },
  { ingredientId: 'mussarela', stockQuantity: d('0.25'), split: 'metade' },
  { ingredientId: 'caixa', stockQuantity: d('1'), split: 'inteira' },
];

describe('requirementsForPizzas', () => {
  it('Teste 2: 20 whole pizzas consume 5 kg of mozzarella', () => {
    const req = requirementsForPizzas(CALABRESA, null, 20);
    expect(req.get('mussarela')?.toString()).toBe('5');
    expect(req.get('massa')?.toString()).toBe('7000');
    expect(req.get('caixa')?.toString()).toBe('20');
  });

  it('Teste 3: half and half uses the dough and the box once, and splits the other lines', () => {
    const req = requirementsForPizzas(CALABRESA, MUSSARELA, 1);
    expect(req.get('massa')?.toString()).toBe('350');
    expect(req.get('caixa')?.toString()).toBe('1');
    expect(req.get('molho')?.toString()).toBe('80');
    expect(req.get('mussarela')?.toString()).toBe('0.25');
    expect(req.get('calabresa')?.toString()).toBe('0.075');
  });

  it('uses the larger quantity for a whole line that differs between flavours', () => {
    const big: StockRecipeLine[] = [{ ingredientId: 'massa', stockQuantity: d('400'), split: 'inteira' }];
    const req = requirementsForPizzas(CALABRESA, big, 1);
    expect(req.get('massa')?.toString()).toBe('400');
  });
});

describe('validateProductDraft', () => {
  const base = { code: 'CAL-G', name: 'Calabresa', category: 'Tradicionais', size: 'grande', salePrice: '59,90' };

  it('accepts a complete product and parses the price', () => {
    const result = validateProductDraft(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.salePrice.toFixed(2)).toBe('59.90');
  });

  it('rejects unknown sizes, malformed codes, and prices with more than two decimals', () => {
    expect(validateProductDraft({ ...base, size: 'gigante' }).ok).toBe(false);
    expect(validateProductDraft({ ...base, code: 'CAL G' }).ok).toBe(false);
    expect(validateProductDraft({ ...base, salePrice: '10,123' }).ok).toBe(false);
  });
});

describe('validateRecipeLine', () => {
  it('requires a positive quantity with at most four decimals', () => {
    const ok = validateRecipeLine({ ingredientId: 'x', ingredientName: 'Muçarela', quantity: '250', split: 'metade' });
    expect(ok.ok).toBe(true);
    expect(validateRecipeLine({ ingredientId: 'x', ingredientName: 'Muçarela', quantity: '0', split: 'metade' }).ok).toBe(false);
    expect(validateRecipeLine({ ingredientId: 'x', ingredientName: 'Muçarela', quantity: '1,00001', split: 'metade' }).ok).toBe(false);
  });
});

describe('validatePizzaOrder', () => {
  it('accepts one or two different flavours and a whole pizza count', () => {
    expect(validatePizzaOrder({ productA: 'a', productB: null, pizzas: '20' }).ok).toBe(true);
    expect(validatePizzaOrder({ productA: 'a', productB: 'b', pizzas: '1' }).ok).toBe(true);
  });

  it('rejects the same flavour twice, a missing flavour, and invalid counts', () => {
    expect(validatePizzaOrder({ productA: 'a', productB: 'a', pizzas: '1' }).ok).toBe(false);
    expect(validatePizzaOrder({ productA: null, productB: null, pizzas: '1' }).ok).toBe(false);
    expect(validatePizzaOrder({ productA: 'a', productB: null, pizzas: '0' }).ok).toBe(false);
    expect(validatePizzaOrder({ productA: 'a', productB: null, pizzas: '2.5' }).ok).toBe(false);
  });
});

describe('validatePreparoBatch', () => {
  const base = {
    batches: '1',
    actualYield: '1400',
    lotCode: 'MOLHO-01',
    expiresOn: '2026-10-30',
    expectedYield: d('1500'),
    today: '2026-10-28',
  };

  it('computes the yield loss from the expected and real yield', () => {
    const result = validatePreparoBatch(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expectedYield.toString()).toBe('1500');
      expect(result.value.loss.toString()).toBe('100');
    }
  });

  it('rejects zero yield, a missing lot, and a preparo that is already expired', () => {
    expect(validatePreparoBatch({ ...base, actualYield: '0' }).ok).toBe(false);
    expect(validatePreparoBatch({ ...base, lotCode: '  ' }).ok).toBe(false);
    expect(validatePreparoBatch({ ...base, expiresOn: '2026-10-01' }).ok).toBe(false);
  });
});
