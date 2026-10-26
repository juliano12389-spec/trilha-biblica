import { Decimal } from './decimal';
import { dimensionOf, fixedConversionFactor, isUnitCode, type UnitCode } from './units';

/** Initial categories created for every new organization (see create_organization). */
export const DEFAULT_INGREDIENT_CATEGORIES = [
  'Massas e farinhas',
  'Queijos',
  'Carnes e embutidos',
  'Molhos e conservas',
  'Hortifruti',
  'Temperos',
  'Bebidas',
  'Embalagens',
  'Produtos de limpeza',
  'Outros',
] as const;

export const INGREDIENT_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  skuMax: 40,
  storageLocationMax: 80,
  shelfLifeDaysMax: 3650,
  /** Matches numeric(18,4) for quantities and numeric(14,4) for costs. */
  quantityDecimals: 4,
  costDecimals: 4,
} as const;

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Raw values as typed in the cadastro form. */
export interface IngredientFormInput {
  name: string;
  sku: string;
  categoryId: string;
  purchaseUnit: string;
  stockUnit: string;
  consumptionUnit: string;
  /** 1 purchase unit = N stock units. Empty when a universal factor applies. */
  purchaseToStockFactor: string;
  /** 1 consumption unit = N stock units. Empty when a universal factor applies. */
  consumptionToStockFactor: string;
  openingQuantity: string;
  minimumStock: string;
  maximumStock: string;
  purchaseUnitCost: string;
  supplierId: string;
  storageLocation: string;
  shelfLifeDays: string;
}

export interface IngredientDraft {
  name: string;
  sku: string;
  categoryId: string;
  purchaseUnit: UnitCode;
  stockUnit: UnitCode;
  consumptionUnit: UnitCode;
  purchaseToStockFactor: Decimal;
  consumptionToStockFactor: Decimal;
  openingQuantity: Decimal;
  minimumStock: Decimal;
  maximumStock: Decimal | null;
  purchaseUnitCost: Decimal;
  supplierId: string | null;
  storageLocation: string | null;
  shelfLifeDays: number | null;
}

export type IngredientField = keyof IngredientFormInput;

export type IngredientValidation =
  | { ok: true; value: IngredientDraft }
  | { ok: false; errors: Partial<Record<IngredientField, string>> };

export function validateIngredientInput(input: IngredientFormInput): IngredientValidation {
  const errors: Partial<Record<IngredientField, string>> = {};

  const name = input.name.trim();
  if (name.length < INGREDIENT_LIMITS.nameMin || name.length > INGREDIENT_LIMITS.nameMax) {
    errors.name = `Informe um nome entre ${INGREDIENT_LIMITS.nameMin} e ${INGREDIENT_LIMITS.nameMax} caracteres.`;
  }

  const sku = input.sku.trim();
  if (sku.length === 0 || sku.length > INGREDIENT_LIMITS.skuMax || !SKU_PATTERN.test(sku)) {
    errors.sku = 'Use letras, números, ponto, hífen ou sublinhado (até 40 caracteres).';
  }

  if (input.categoryId.trim() === '') {
    errors.categoryId = 'Escolha uma categoria.';
  }

  const purchaseUnit = parseUnit(input.purchaseUnit);
  if (!purchaseUnit) {
    errors.purchaseUnit = 'Escolha a unidade de compra.';
  }
  const stockUnit = parseUnit(input.stockUnit);
  if (!stockUnit) {
    errors.stockUnit = 'Escolha a unidade de estoque.';
  }
  const consumptionUnit = parseUnit(input.consumptionUnit);
  if (!consumptionUnit) {
    errors.consumptionUnit = 'Escolha a unidade usada na receita.';
  }

  let purchaseToStockFactor: Decimal | null = null;
  let consumptionToStockFactor: Decimal | null = null;
  if (purchaseUnit && stockUnit) {
    const result = resolveFactor(purchaseUnit, stockUnit, input.purchaseToStockFactor);
    if (result.ok) {
      purchaseToStockFactor = result.factor;
    } else {
      errors.purchaseToStockFactor = result.message;
    }
  }
  if (consumptionUnit && stockUnit) {
    const result = resolveFactor(consumptionUnit, stockUnit, input.consumptionToStockFactor);
    if (result.ok) {
      consumptionToStockFactor = result.factor;
    } else {
      errors.consumptionToStockFactor = result.message;
    }
  }

  const openingQuantity = parseNonNegative(input.openingQuantity, INGREDIENT_LIMITS.quantityDecimals);
  if (openingQuantity === 'invalid') {
    errors.openingQuantity = 'Informe a quantidade inicial (zero ou mais, até 4 casas decimais).';
  }

  const minimumStock = parseNonNegative(input.minimumStock, INGREDIENT_LIMITS.quantityDecimals);
  if (minimumStock === 'invalid') {
    errors.minimumStock = 'Informe o estoque mínimo (zero ou mais, até 4 casas decimais).';
  }

  let maximumStock: Decimal | null = null;
  if (input.maximumStock.trim() !== '') {
    const parsed = parseNonNegative(input.maximumStock, INGREDIENT_LIMITS.quantityDecimals);
    if (parsed === 'invalid') {
      errors.maximumStock = 'Informe um valor válido ou deixe em branco.';
    } else if (minimumStock !== 'invalid' && parsed.compareTo(minimumStock) < 0) {
      errors.maximumStock = 'O estoque máximo não pode ser menor que o mínimo.';
    } else {
      maximumStock = parsed;
    }
  }

  const purchaseUnitCost = parseNonNegative(input.purchaseUnitCost, INGREDIENT_LIMITS.costDecimals);
  if (purchaseUnitCost === 'invalid') {
    errors.purchaseUnitCost = 'Informe o custo de aquisição (zero ou mais).';
  }

  let shelfLifeDays: number | null = null;
  if (input.shelfLifeDays.trim() !== '') {
    const days = Number(input.shelfLifeDays.trim());
    if (!Number.isInteger(days) || days < 1 || days > INGREDIENT_LIMITS.shelfLifeDaysMax) {
      errors.shelfLifeDays = `Informe dias inteiros entre 1 e ${INGREDIENT_LIMITS.shelfLifeDaysMax}, ou deixe em branco.`;
    } else {
      shelfLifeDays = days;
    }
  }

  const storageLocation = input.storageLocation.trim();
  if (storageLocation.length > INGREDIENT_LIMITS.storageLocationMax) {
    errors.storageLocation = `Use até ${INGREDIENT_LIMITS.storageLocationMax} caracteres.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name,
      sku,
      categoryId: input.categoryId,
      purchaseUnit: purchaseUnit!,
      stockUnit: stockUnit!,
      consumptionUnit: consumptionUnit!,
      purchaseToStockFactor: purchaseToStockFactor!,
      consumptionToStockFactor: consumptionToStockFactor!,
      openingQuantity: openingQuantity as Decimal,
      minimumStock: minimumStock as Decimal,
      maximumStock,
      purchaseUnitCost: purchaseUnitCost as Decimal,
      supplierId: input.supplierId === '' ? null : input.supplierId,
      storageLocation: storageLocation === '' ? null : storageLocation,
      shelfLifeDays,
    },
  };
}

function parseUnit(value: string): UnitCode | null {
  return isUnitCode(value) ? value : null;
}

type FactorResult = { ok: true; factor: Decimal } | { ok: false; message: string };

/**
 * Resolves the factor `1 from = factor to` for an ingredient.
 *
 * - Same unit: factor is 1.
 * - Universal pair (kg/g, L/ml): the catalog factor applies. A typed value is
 *   accepted only when it matches the catalog.
 * - Anything else (cross-dimension such as L -> kg, or packaging units such as
 *   caixa -> un): an explicit factor is mandatory, as the user's density or
 *   packaging conversion.
 */
function resolveFactor(from: UnitCode, to: UnitCode, rawFactor: string): FactorResult {
  const typed = rawFactor.trim() === '' ? null : Decimal.parseUserInput(rawFactor);
  if (rawFactor.trim() !== '' && (typed === null || !typed.isPositive())) {
    return { ok: false, message: 'O fator deve ser um número maior que zero.' };
  }

  if (from === to) {
    if (typed !== null && typed.compareTo(Decimal.ONE) !== 0) {
      return { ok: false, message: 'Unidades iguais têm fator 1.' };
    }
    return { ok: true, factor: Decimal.ONE };
  }

  const universal = fixedConversionFactor(from, to);
  if (universal) {
    if (typed !== null && typed.compareTo(universal) !== 0) {
      return { ok: false, message: `Pela tabela, 1 ${from} = ${universal.toString()} ${to}.` };
    }
    return { ok: true, factor: universal };
  }

  if (typed === null) {
    const reason =
      dimensionOf(from) === dimensionOf(to)
        ? `Informe quantos ${to} cabem em 1 ${from}.`
        : `Conversão de ${from} para ${to} exige fator específico, como a densidade.`;
    return { ok: false, message: reason };
  }
  return { ok: true, factor: typed };
}

function parseNonNegative(
  raw: string,
  maxDecimals: number,
): Decimal | 'invalid' {
  const parsed = Decimal.parseUserInput(raw);
  if (parsed === null || parsed.isNegative() || decimalPlaces(parsed) > maxDecimals) {
    return 'invalid';
  }
  return parsed;
}

function decimalPlaces(value: Decimal): number {
  const text = value.toString();
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Stock is considered low when the balance is below the minimum. */
export type StockStatus = 'abaixo_minimo' | 'normal';

export function stockStatus(balance: Decimal, minimumStock: Decimal): StockStatus {
  return balance.compareTo(minimumStock) < 0 ? 'abaixo_minimo' : 'normal';
}
