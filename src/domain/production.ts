import { Decimal } from './decimal';
import { decimalPlaces } from './stock';

/**
 * Production rules. The database applies the same rules when a production is
 * confirmed; these functions give the same answers before anything is written,
 * so the screens can show requirements and errors without a round trip.
 */

export const PIZZA_SIZES = [
  { code: 'pequena', label: 'Pequena' },
  { code: 'media', label: 'Média' },
  { code: 'grande', label: 'Grande' },
  { code: 'familia', label: 'Família' },
] as const;

export type PizzaSize = (typeof PIZZA_SIZES)[number]['code'];

export type SplitRule = 'metade' | 'inteira';

export const PIZZA_LIMITS = { pizzasMin: 1, pizzasMax: 500, batchesMin: 1, batchesMax: 200 } as const;

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/;

/** A recipe line as stored: quantity already converted to the STOCK unit, for one whole pizza. */
export interface StockRecipeLine {
  ingredientId: string;
  stockQuantity: Decimal;
  split: SplitRule;
}

/**
 * Stock needed for `pizzas` pizzas. One flavour: every line counts in full.
 * Two flavours (meio a meio): 'metade' lines count 50% from each flavour, and
 * 'inteira' lines (dough, box) count once, using the larger of the two flavours.
 */
export function requirementsForPizzas(
  flavorA: readonly StockRecipeLine[],
  flavorB: readonly StockRecipeLine[] | null,
  pizzas: number,
): Map<string, Decimal> {
  const share = flavorB === null ? Decimal.ONE : Decimal.of('0.5');
  const flavors = flavorB === null ? [flavorA] : [flavorA, flavorB];

  const halves = new Map<string, Decimal>();
  const whole = new Map<string, Decimal>();

  for (const flavor of flavors) {
    for (const line of flavor) {
      if (line.split === 'metade') {
        const current = halves.get(line.ingredientId) ?? Decimal.ZERO;
        halves.set(line.ingredientId, current.add(line.stockQuantity.multiply(share)));
      } else {
        const current = whole.get(line.ingredientId) ?? Decimal.ZERO;
        if (line.stockQuantity.compareTo(current) > 0) {
          whole.set(line.ingredientId, line.stockQuantity);
        }
      }
    }
  }

  const total = new Map<string, Decimal>();
  for (const id of new Set([...halves.keys(), ...whole.keys()])) {
    const perPizza = (halves.get(id) ?? Decimal.ZERO).add(whole.get(id) ?? Decimal.ZERO);
    total.set(id, perPizza.multiply(pizzas));
  }
  return total;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

export interface ProductDraft {
  code: string;
  name: string;
  category: string;
  size: string;
  salePrice: string;
}

export function validateProductDraft(input: ProductDraft): Validation<{
  code: string;
  name: string;
  category: string;
  size: PizzaSize;
  salePrice: Decimal;
}> {
  const code = input.code.trim();
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, message: 'Código: use letras, números, ponto, hífen ou sublinhado (até 30).' };
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    return { ok: false, message: 'Informe o nome do sabor (de 2 a 120 caracteres).' };
  }
  const category = input.category.trim();
  if (category.length < 2 || category.length > 60) {
    return { ok: false, message: 'Informe a categoria (de 2 a 60 caracteres).' };
  }
  const size = PIZZA_SIZES.find((option) => option.code === input.size);
  if (!size) {
    return { ok: false, message: 'Escolha o tamanho da pizza.' };
  }
  const price = Decimal.parseUserInput(input.salePrice);
  if (price === null || price.isNegative() || decimalPlaces(price) > 2) {
    return { ok: false, message: 'Informe o preço de venda (zero ou mais, com até 2 casas).' };
  }
  return { ok: true, value: { code, name, category, size: size.code, salePrice: price } };
}

export interface RecipeLineDraft {
  ingredientId: string;
  ingredientName: string;
  quantity: string;
  split: SplitRule;
}

export function validateRecipeLine(input: RecipeLineDraft): Validation<RecipeLineDraft & { quantityValue: Decimal }> {
  const quantity = Decimal.parseUserInput(input.quantity);
  if (quantity === null || !quantity.isPositive() || decimalPlaces(quantity) > 4) {
    return { ok: false, message: `${input.ingredientName}: informe uma quantidade maior que zero (até 4 casas).` };
  }
  return { ok: true, value: { ...input, quantityValue: quantity } };
}

export function validatePizzaOrder(input: {
  productA: string | null;
  productB: string | null;
  pizzas: string;
}): Validation<{ productA: string; productB: string | null; pizzas: number }> {
  if (!input.productA) {
    return { ok: false, message: 'Escolha o sabor.' };
  }
  if (input.productB !== null && input.productB === input.productA) {
    return { ok: false, message: 'Meio a meio exige dois sabores diferentes.' };
  }
  const pizzas = Number(input.pizzas.trim());
  if (!Number.isInteger(pizzas) || pizzas < PIZZA_LIMITS.pizzasMin || pizzas > PIZZA_LIMITS.pizzasMax) {
    return { ok: false, message: `Informe a quantidade de pizzas (de ${PIZZA_LIMITS.pizzasMin} a ${PIZZA_LIMITS.pizzasMax}).` };
  }
  return { ok: true, value: { productA: input.productA, productB: input.productB, pizzas } };
}

export interface PreparoBatchInput {
  batches: string;
  actualYield: string;
  lotCode: string;
  expiresOn: string;
  expectedYield: Decimal;
  today: string;
}

export function validatePreparoBatch(input: PreparoBatchInput): Validation<{
  batches: number;
  actualYield: Decimal;
  lotCode: string;
  expiresOn: string | null;
  expectedYield: Decimal;
  loss: Decimal;
}> {
  const batches = Number(input.batches.trim());
  if (!Number.isInteger(batches) || batches < PIZZA_LIMITS.batchesMin || batches > PIZZA_LIMITS.batchesMax) {
    return { ok: false, message: `Informe a quantidade de lotes (de ${PIZZA_LIMITS.batchesMin} a ${PIZZA_LIMITS.batchesMax}).` };
  }
  const actual = Decimal.parseUserInput(input.actualYield);
  if (actual === null || !actual.isPositive() || decimalPlaces(actual) > 4) {
    return { ok: false, message: 'Informe o rendimento real obtido (maior que zero, até 4 casas).' };
  }
  const lotCode = input.lotCode.trim();
  if (lotCode.length < 1 || lotCode.length > 40) {
    return { ok: false, message: 'Informe o lote do preparo (até 40 caracteres).' };
  }
  const expiresOn = input.expiresOn.trim() === '' ? null : input.expiresOn.trim();
  if (expiresOn !== null && expiresOn < input.today) {
    return { ok: false, message: 'O preparo não pode nascer vencido. Informe uma validade futura.' };
  }
  const expected = input.expectedYield.multiply(batches);
  return {
    ok: true,
    value: { batches, actualYield: actual, lotCode, expiresOn, expectedYield: expected, loss: expected.subtract(actual) },
  };
}
