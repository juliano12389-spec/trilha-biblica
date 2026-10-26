import { Decimal } from '../domain/decimal';
import type { PizzaSize, SplitRule } from '../domain/production';
import type { UnitCode } from '../domain/units';
import { supabase } from '../lib/supabase';

export interface ProductItem {
  id: string;
  code: string;
  name: string;
  category: string;
  size: PizzaSize;
  salePrice: Decimal;
  pizzaRecipeId: string | null;
  /** True when the pizza recipe has at least one published version. */
  hasRecipe: boolean;
}

export async function listProducts(): Promise<ProductItem[]> {
  const [productsResult, recipesResult, versionsResult] = await Promise.all([
    supabase.from('products').select('id, code, name, category, size, sale_price').eq('is_active', true).order('name'),
    supabase.from('recipes').select('id, product_id').eq('kind', 'pizza'),
    supabase.from('recipe_versions').select('recipe_id').eq('published', true),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (recipesResult.error) throw recipesResult.error;
  if (versionsResult.error) throw versionsResult.error;

  const recipeByProduct = new Map<string, string>();
  for (const row of recipesResult.data as { id: string; product_id: string }[]) {
    recipeByProduct.set(row.product_id, row.id);
  }
  const recipesWithVersion = new Set((versionsResult.data as { recipe_id: string }[]).map((row) => row.recipe_id));

  return (productsResult.data as {
    id: string;
    code: string;
    name: string;
    category: string;
    size: PizzaSize;
    sale_price: string | number;
  }[]).map((row) => {
    const recipeId = recipeByProduct.get(row.id) ?? null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      size: row.size,
      salePrice: Decimal.of(row.sale_price),
      pizzaRecipeId: recipeId,
      hasRecipe: recipeId !== null && recipesWithVersion.has(recipeId),
    };
  });
}

export interface ProductDraftInput {
  code: string;
  name: string;
  category: string;
  size: PizzaSize;
  salePrice: Decimal;
}

export async function createProduct(draft: ProductDraftInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_product', {
    p_code: draft.code,
    p_name: draft.name,
    p_category: draft.category,
    p_size: draft.size,
    p_sale_price: draft.salePrice.toString(),
  });
  if (error) throw error;
  return data as string;
}

export interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  consumptionUnit: UnitCode;
  quantity: Decimal;
  split: SplitRule;
}

export interface CurrentRecipe {
  recipeId: string;
  versionNumber: number;
  lines: RecipeLine[];
}

/** The most recent published version of a recipe, or null if it has none. */
export async function getCurrentRecipe(recipeId: string): Promise<CurrentRecipe | null> {
  const { data: versions, error: versionError } = await supabase
    .from('recipe_versions')
    .select('id, version_number')
    .eq('recipe_id', recipeId)
    .eq('published', true)
    .order('version_number', { ascending: false })
    .limit(1);
  if (versionError) throw versionError;
  const version = (versions as { id: string; version_number: number }[])[0];
  if (!version) return null;

  const { data: items, error: itemsError } = await supabase
    .from('recipe_items')
    .select('ingredient_id, quantity, split_rule, ingredients(name, consumption_unit)')
    .eq('version_id', version.id);
  if (itemsError) throw itemsError;

  type ItemRow = {
    ingredient_id: string;
    quantity: string | number;
    split_rule: SplitRule;
    ingredients: { name: string; consumption_unit: UnitCode } | null;
  };

  return {
    recipeId,
    versionNumber: version.version_number,
    lines: (items as unknown as ItemRow[]).map((row) => ({
      ingredientId: row.ingredient_id,
      ingredientName: row.ingredients?.name ?? 'Insumo',
      consumptionUnit: row.ingredients?.consumption_unit ?? 'un',
      quantity: Decimal.of(row.quantity),
      split: row.split_rule,
    })),
  };
}

/** Publishes a new immutable version. Lines are in each ingredient's consumption unit. */
export async function publishRecipe(recipeId: string, lines: { ingredientId: string; quantity: Decimal; split: SplitRule }[]): Promise<string> {
  const { data, error } = await supabase.rpc('publish_recipe_version', {
    p_recipe_id: recipeId,
    p_items: lines.map((line) => ({
      ingredient_id: line.ingredientId,
      quantity: line.quantity.toString(),
      split_rule: line.split,
    })),
  });
  if (error) throw error;
  return data as string;
}

export interface PreparoRecipeItem {
  id: string;
  name: string;
  outputIngredientId: string;
  outputName: string;
  yieldQuantity: Decimal;
  outputUnit: UnitCode;
  hasRecipe: boolean;
}

export async function listPreparoRecipes(): Promise<PreparoRecipeItem[]> {
  const [recipesResult, versionsResult] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, output_ingredient_id, yield_quantity, ingredients!output_ingredient_id(name, stock_unit)')
      .eq('kind', 'preparo')
      .eq('is_active', true)
      .order('name'),
    supabase.from('recipe_versions').select('recipe_id').eq('published', true),
  ]);
  if (recipesResult.error) throw recipesResult.error;
  if (versionsResult.error) throw versionsResult.error;

  const published = new Set((versionsResult.data as { recipe_id: string }[]).map((row) => row.recipe_id));

  type Row = {
    id: string;
    name: string;
    output_ingredient_id: string;
    yield_quantity: string | number;
    ingredients: { name: string; stock_unit: UnitCode } | null;
  };
  return (recipesResult.data as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    outputIngredientId: row.output_ingredient_id,
    outputName: row.ingredients?.name ?? 'Insumo',
    yieldQuantity: Decimal.of(row.yield_quantity),
    outputUnit: row.ingredients?.stock_unit ?? 'un',
    hasRecipe: published.has(row.id),
  }));
}

export async function createPreparoRecipe(name: string, outputIngredientId: string, yieldQuantity: Decimal): Promise<string> {
  const { data, error } = await supabase.rpc('create_preparo_recipe', {
    p_name: name,
    p_output_ingredient_id: outputIngredientId,
    p_yield_quantity: yieldQuantity.toString(),
  });
  if (error) throw error;
  return data as string;
}

export interface RequirementRow {
  ingredientId: string;
  name: string;
  unit: UnitCode;
  required: Decimal;
  available: Decimal;
  missing: Decimal;
}

/** What the order would consume and what is available now. Writes nothing. */
export async function previewPizzaRequirements(productA: string, productB: string | null, pizzas: number): Promise<RequirementRow[]> {
  const { data, error } = await supabase.rpc('preview_pizza_requirements', {
    p_product_a: productA,
    p_product_b: productB,
    p_pizzas: pizzas,
  });
  if (error) throw error;
  return (data as {
    out_ingredient_id: string;
    out_name: string;
    out_unit: UnitCode;
    out_required: string | number;
    out_available: string | number;
    out_missing: string | number;
  }[]).map((row) => ({
    ingredientId: row.out_ingredient_id,
    name: row.out_name,
    unit: row.out_unit,
    required: Decimal.of(row.out_required),
    available: Decimal.of(row.out_available),
    missing: Decimal.of(row.out_missing),
  }));
}

export async function registerPizzaProduction(
  requestId: string,
  productA: string,
  productB: string | null,
  pizzas: number,
  producedOn: string,
  notes: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('register_pizza_production', {
    p_client_request_id: requestId,
    p_product_a: productA,
    p_product_b: productB,
    p_pizzas: pizzas,
    p_produced_on: producedOn,
    p_notes: notes,
  });
  if (error) throw error;
  return data as string;
}

export async function registerPreparation(
  requestId: string,
  recipeId: string,
  batches: number,
  actualYield: Decimal,
  lotCode: string,
  expiresOn: string | null,
  notes: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('register_preparation_batch', {
    p_client_request_id: requestId,
    p_recipe_id: recipeId,
    p_batches: batches,
    p_actual_yield: actualYield.toString(),
    p_lot_code: lotCode,
    p_expires_on: expiresOn,
    p_notes: notes,
  });
  if (error) throw error;
  return data as string;
}

export interface ProductionOrderItem {
  id: string;
  kind: 'pizza' | 'preparo';
  title: string;
  quantityLabel: string;
  totalCost: Decimal;
  unitCost: Decimal;
  producedOn: string;
}

export async function listProductionOrders(limit = 40): Promise<ProductionOrderItem[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select(
      'id, kind, pizzas_quantity, batches, actual_yield, total_cost, unit_cost, produced_on, created_at, product_a:products!product_a_id(name), product_b:products!product_b_id(name), output:ingredients!output_ingredient_id(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: string;
    kind: 'pizza' | 'preparo';
    pizzas_quantity: number | null;
    batches: number | null;
    actual_yield: string | number | null;
    total_cost: string | number;
    unit_cost: string | number;
    produced_on: string;
    product_a: { name: string } | null;
    product_b: { name: string } | null;
    output: { name: string } | null;
  };

  return (data as unknown as Row[]).map((row) => {
    if (row.kind === 'pizza') {
      const flavours = row.product_b ? `${row.product_a?.name} + ${row.product_b.name}` : (row.product_a?.name ?? 'Pizza');
      return {
        id: row.id,
        kind: 'pizza',
        title: flavours,
        quantityLabel: `${row.pizzas_quantity} ${row.pizzas_quantity === 1 ? 'pizza' : 'pizzas'}`,
        totalCost: Decimal.of(row.total_cost),
        unitCost: Decimal.of(row.unit_cost),
        producedOn: row.produced_on,
      };
    }
    return {
      id: row.id,
      kind: 'preparo',
      title: row.output?.name ?? 'Preparo',
      quantityLabel: `${row.batches} ${row.batches === 1 ? 'lote' : 'lotes'} • rendimento ${Decimal.of(row.actual_yield ?? 0).toString()}`,
      totalCost: Decimal.of(row.total_cost),
      unitCost: Decimal.of(row.unit_cost),
      producedOn: row.produced_on,
    };
  });
}
