import { Decimal } from '../domain/decimal';
import type { UnitCode } from '../domain/units';
import { supabase } from '../lib/supabase';

export interface StockPositionRow {
  ingredientId: string;
  name: string;
  sku: string;
  categoryName: string;
  unit: UnitCode;
  balance: Decimal;
  minimumStock: Decimal;
  averageCost: Decimal;
  stockValue: Decimal;
}

export async function listStockPosition(): Promise<StockPositionRow[]> {
  const { data, error } = await supabase
    .from('stock_position')
    .select('ingredient_id, name, sku, category_name, unit, balance, minimum_stock, average_stock_unit_cost, stock_value')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  type Row = {
    ingredient_id: string;
    name: string;
    sku: string;
    category_name: string;
    unit: UnitCode;
    balance: string | number;
    minimum_stock: string | number;
    average_stock_unit_cost: string | number;
    stock_value: string | number;
  };
  return (data as Row[]).map((row) => ({
    ingredientId: row.ingredient_id,
    name: row.name,
    sku: row.sku,
    categoryName: row.category_name,
    unit: row.unit,
    balance: Decimal.of(row.balance),
    minimumStock: Decimal.of(row.minimum_stock),
    averageCost: Decimal.of(row.average_stock_unit_cost),
    stockValue: Decimal.of(row.stock_value),
  }));
}

export interface CountSubmitLine {
  ingredientId: string;
  counted: Decimal;
  reason: string | null;
}

export async function submitStocktake(requestId: string, notes: string, lines: CountSubmitLine[]): Promise<string> {
  const { data, error } = await supabase.rpc('submit_stocktake', {
    p_client_request_id: requestId,
    p_notes: notes,
    p_items: lines.map((line) => ({
      ingredient_id: line.ingredientId,
      counted: line.counted.toString(),
      ...(line.reason ? { reason: line.reason } : {}),
    })),
  });
  if (error) throw error;
  return data as string;
}

export interface StocktakeRow {
  id: string;
  status: 'aguardando_aprovacao' | 'aprovado' | 'recusado';
  countedAt: string;
  netValue: Decimal;
  notes: string | null;
  decisionNote: string | null;
}

export async function listStocktakes(limit = 30): Promise<StocktakeRow[]> {
  const { data, error } = await supabase
    .from('stocktakes')
    .select('id, status, counted_at, net_difference_value, notes, decision_note')
    .order('counted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    id: string;
    status: StocktakeRow['status'];
    counted_at: string;
    net_difference_value: string | number;
    notes: string | null;
    decision_note: string | null;
  };
  return (data as Row[]).map((row) => ({
    id: row.id,
    status: row.status,
    countedAt: row.counted_at,
    netValue: Decimal.of(row.net_difference_value),
    notes: row.notes,
    decisionNote: row.decision_note,
  }));
}

export interface StocktakeItemRow {
  ingredientName: string;
  unit: UnitCode;
  systemQuantity: Decimal;
  countedQuantity: Decimal;
  difference: Decimal;
  financialImpact: Decimal;
  reason: string | null;
}

export async function listStocktakeItems(stocktakeId: string): Promise<StocktakeItemRow[]> {
  const { data, error } = await supabase
    .from('stocktake_items')
    .select('system_quantity, counted_quantity, difference, financial_impact, reason, ingredients(name, stock_unit)')
    .eq('stocktake_id', stocktakeId);
  if (error) throw error;
  type Row = {
    system_quantity: string | number;
    counted_quantity: string | number;
    difference: string | number;
    financial_impact: string | number;
    reason: string | null;
    ingredients: { name: string; stock_unit: UnitCode } | null;
  };
  return (data as unknown as Row[]).map((row) => ({
    ingredientName: row.ingredients?.name ?? 'Insumo',
    unit: row.ingredients?.stock_unit ?? 'un',
    systemQuantity: Decimal.of(row.system_quantity),
    countedQuantity: Decimal.of(row.counted_quantity),
    difference: Decimal.of(row.difference),
    financialImpact: Decimal.of(row.financial_impact),
    reason: row.reason,
  }));
}

export async function approveStocktake(stocktakeId: string, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('approve_stocktake', { p_stocktake: stocktakeId, p_note: note });
  if (error) throw error;
  return data as number;
}

export async function rejectStocktake(stocktakeId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('reject_stocktake', { p_stocktake: stocktakeId, p_note: note });
  if (error) throw error;
}

export async function registerWaste(
  requestId: string,
  ingredientId: string,
  lotId: string | null,
  quantity: Decimal,
  reason: string,
  notes: string,
  occurredOn: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('register_waste', {
    p_client_request_id: requestId,
    p_ingredient: ingredientId,
    p_lot: lotId,
    p_quantity: quantity.toString(),
    p_reason: reason,
    p_notes: notes,
    p_occurred_on: occurredOn,
  });
  if (error) throw error;
  return data as string;
}

export interface WasteRow {
  id: string;
  ingredientName: string;
  quantity: Decimal;
  unit: UnitCode;
  reason: string;
  costEstimate: Decimal;
  occurredOn: string;
}

export async function listWaste(limit = 30): Promise<WasteRow[]> {
  const { data, error } = await supabase
    .from('waste_records')
    .select('id, quantity, unit, reason, cost_estimate, occurred_on, ingredients(name)')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    id: string;
    quantity: string | number;
    unit: UnitCode;
    reason: string;
    cost_estimate: string | number;
    occurred_on: string;
    ingredients: { name: string } | null;
  };
  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    ingredientName: row.ingredients?.name ?? 'Insumo',
    quantity: Decimal.of(row.quantity),
    unit: row.unit,
    reason: row.reason,
    costEstimate: Decimal.of(row.cost_estimate),
    occurredOn: row.occurred_on,
  }));
}

export interface ProductCostRow {
  productId: string;
  name: string;
  price: Decimal;
  cost: Decimal;
}

/** Theoretical ingredient cost per pizza, at current average costs. */
export async function productCosts(products: { id: string; name: string; salePrice: Decimal; hasRecipe: boolean }[]): Promise<ProductCostRow[]> {
  const withRecipe = products.filter((product) => product.hasRecipe);
  return Promise.all(
    withRecipe.map(async (product) => {
      const { data, error } = await supabase.rpc('product_theoretical_cost', { p_product: product.id });
      if (error) throw error;
      return { productId: product.id, name: product.name, price: product.salePrice, cost: Decimal.of(data as number) };
    }),
  );
}

export interface ConsumptionRow {
  ingredientId: string;
  name: string;
  unit: UnitCode;
  theoretical: Decimal;
  real: Decimal;
}

/** Theoretical (recipes x pizzas) against real (ledger) consumption over a period. */
export async function consumptionReport(from: string, to: string): Promise<ConsumptionRow[]> {
  const [theoreticalResult, realResult, positions] = await Promise.all([
    supabase.rpc('theoretical_consumption', { p_from: from, p_to: to }),
    supabase.rpc('real_consumption', { p_from: from, p_to: to }),
    listStockPosition(),
  ]);
  if (theoreticalResult.error) throw theoreticalResult.error;
  if (realResult.error) throw realResult.error;

  const theory = new Map<string, Decimal>(
    (theoreticalResult.data as { out_ingredient_id: string; out_quantity: string | number }[]).map((row) => [
      row.out_ingredient_id,
      Decimal.of(row.out_quantity),
    ]),
  );
  const real = new Map<string, Decimal>(
    (realResult.data as { out_ingredient_id: string; out_quantity: string | number }[]).map((row) => [
      row.out_ingredient_id,
      Decimal.of(row.out_quantity),
    ]),
  );

  const ids = new Set([...theory.keys(), ...real.keys()]);
  return positions
    .filter((position) => ids.has(position.ingredientId))
    .map((position) => ({
      ingredientId: position.ingredientId,
      name: position.name,
      unit: position.unit,
      theoretical: theory.get(position.ingredientId) ?? Decimal.ZERO,
      real: real.get(position.ingredientId) ?? Decimal.ZERO,
    }));
}

export interface ReorderRow {
  ingredientId: string;
  name: string;
  unit: UnitCode;
  balance: Decimal;
  minimum: Decimal;
  dailyConsumption: Decimal;
  leadTimeDays: number;
  suggested: Decimal;
}

export async function reorderSuggestions(): Promise<ReorderRow[]> {
  const { data, error } = await supabase.rpc('reorder_suggestions');
  if (error) throw error;
  type Row = {
    out_ingredient_id: string;
    out_name: string;
    out_unit: UnitCode;
    out_balance: string | number;
    out_minimum: string | number;
    out_daily_consumption: string | number;
    out_lead_time_days: number;
    out_suggested: string | number;
  };
  return (data as Row[]).map((row) => ({
    ingredientId: row.out_ingredient_id,
    name: row.out_name,
    unit: row.out_unit,
    balance: Decimal.of(row.out_balance),
    minimum: Decimal.of(row.out_minimum),
    dailyConsumption: Decimal.of(row.out_daily_consumption),
    leadTimeDays: row.out_lead_time_days,
    suggested: Decimal.of(row.out_suggested),
  }));
}

export interface DashboardSummary {
  stockValue: Decimal;
  activeIngredients: number;
  belowMinimum: number;
  expiring7d: number;
  expired: number;
  pizzasProducedToday: number;
  pizzasSoldToday: number;
  revenueToday: Decimal;
  wasteValueMonth: Decimal;
  pendingStocktakes: number;
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dashboard_summary');
  if (error) throw error;
  const s = data as Record<string, string | number>;
  return {
    stockValue: Decimal.of(s.stock_value),
    activeIngredients: Number(s.active_ingredients),
    belowMinimum: Number(s.below_minimum),
    expiring7d: Number(s.expiring_7d),
    expired: Number(s.expired),
    pizzasProducedToday: Number(s.pizzas_produced_today),
    pizzasSoldToday: Number(s.pizzas_sold_today),
    revenueToday: Decimal.of(s.revenue_today),
    wasteValueMonth: Decimal.of(s.waste_value_month),
    pendingStocktakes: Number(s.pending_stocktakes),
  };
}
