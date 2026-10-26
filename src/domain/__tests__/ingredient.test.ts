import { Decimal } from '../decimal';
import {
  stockStatus,
  validateIngredientInput,
  type IngredientFormInput,
} from '../ingredient';

const base: IngredientFormInput = {
  name: 'Queijo Muçarela Fatiado',
  sku: 'ING-001',
  categoryId: 'cat-queijos',
  purchaseUnit: 'kg',
  stockUnit: 'kg',
  consumptionUnit: 'g',
  purchaseToStockFactor: '',
  consumptionToStockFactor: '',
  openingQuantity: '5',
  minimumStock: '2',
  maximumStock: '',
  purchaseUnitCost: '38,50',
  supplierId: '',
  storageLocation: 'Câmara fria',
  shelfLifeDays: '',
};

function withOverrides(overrides: Partial<IngredientFormInput>): IngredientFormInput {
  return { ...base, ...overrides };
}

describe('validateIngredientInput', () => {
  it('accepts a complete kg purchase with g consumption, deriving the universal factor', () => {
    const result = validateIngredientInput(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.purchaseToStockFactor.toString()).toBe('1');
    expect(result.value.consumptionToStockFactor.toString()).toBe('0.001');
    expect(result.value.openingQuantity.toString()).toBe('5');
    expect(result.value.purchaseUnitCost.toFixed(2)).toBe('38.50');
    expect(result.value.supplierId).toBeNull();
    expect(result.value.maximumStock).toBeNull();
  });

  it('requires an explicit density factor for litres bought and kilograms stocked', () => {
    const result = validateIngredientInput(
      withOverrides({ purchaseUnit: 'l', stockUnit: 'kg', consumptionUnit: 'kg' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.purchaseToStockFactor).toMatch(/fator específico/);
  });

  it('accepts a typed density factor for litres bought and kilograms stocked', () => {
    const result = validateIngredientInput(
      withOverrides({
        purchaseUnit: 'l',
        stockUnit: 'kg',
        consumptionUnit: 'kg',
        purchaseToStockFactor: '0,92',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.purchaseToStockFactor.toString()).toBe('0.92');
  });

  it('requires an explicit factor for packaging units such as caixa -> un', () => {
    const missing = validateIngredientInput(
      withOverrides({ purchaseUnit: 'caixa', stockUnit: 'un', consumptionUnit: 'un' }),
    );
    expect(missing.ok).toBe(false);

    const provided = validateIngredientInput(
      withOverrides({
        purchaseUnit: 'caixa',
        stockUnit: 'un',
        consumptionUnit: 'un',
        purchaseToStockFactor: '100',
      }),
    );
    expect(provided.ok).toBe(true);
    if (!provided.ok) return;
    expect(provided.value.purchaseToStockFactor.toString()).toBe('100');
  });

  it('rejects a typed factor that contradicts the universal table', () => {
    const result = validateIngredientInput(withOverrides({ consumptionToStockFactor: '1' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.consumptionToStockFactor).toMatch(/1 g = 0\.001 kg/);
  });

  it('rejects a factor on identical units unless it is 1', () => {
    const result = validateIngredientInput(withOverrides({ purchaseToStockFactor: '2' }));
    expect(result.ok).toBe(false);
  });

  it('rejects negative quantities and costs', () => {
    const result = validateIngredientInput(
      withOverrides({ openingQuantity: '-1', purchaseUnitCost: '-0,01' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.openingQuantity).toBeDefined();
    expect(result.errors.purchaseUnitCost).toBeDefined();
  });

  it('rejects more decimals than the database stores', () => {
    const result = validateIngredientInput(withOverrides({ openingQuantity: '1,23456' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.openingQuantity).toBeDefined();
  });

  it('rejects a maximum below the minimum', () => {
    const result = validateIngredientInput(withOverrides({ minimumStock: '10', maximumStock: '5' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.maximumStock).toMatch(/mínimo/);
  });

  it('accepts a maximum equal to the minimum', () => {
    const result = validateIngredientInput(withOverrides({ minimumStock: '10', maximumStock: '10' }));
    expect(result.ok).toBe(true);
  });

  it('rejects SKUs with spaces or symbols', () => {
    const result = validateIngredientInput(withOverrides({ sku: 'ING 001' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.sku).toBeDefined();
  });

  it('rejects a missing name and missing category', () => {
    const result = validateIngredientInput(withOverrides({ name: '  ', categoryId: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBeDefined();
    expect(result.errors.categoryId).toBeDefined();
  });

  it('accepts an optional shelf life only as a positive whole number of days', () => {
    expect(validateIngredientInput(withOverrides({ shelfLifeDays: '0' })).ok).toBe(false);
    expect(validateIngredientInput(withOverrides({ shelfLifeDays: '2.5' })).ok).toBe(false);
    const ok = validateIngredientInput(withOverrides({ shelfLifeDays: '14' }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.shelfLifeDays).toBe(14);
  });

  it('normalises blank optional text to null', () => {
    const result = validateIngredientInput(withOverrides({ storageLocation: '   ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storageLocation).toBeNull();
  });
});

describe('stockStatus', () => {
  it('flags balances below the minimum and keeps equal balances normal', () => {
    expect(stockStatus(Decimal.of('15'), Decimal.of('20'))).toBe('abaixo_minimo');
    expect(stockStatus(Decimal.of('20'), Decimal.of('20'))).toBe('normal');
  });
});
