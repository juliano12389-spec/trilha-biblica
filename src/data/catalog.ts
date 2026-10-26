import { Decimal } from '../domain/decimal';
import type { IngredientDraft } from '../domain/ingredient';
import { supabase } from '../lib/supabase';
import type { BalanceRow, CategoryRow, IngredientRow, SupplierRow } from './types';

export interface IngredientListItem {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  stockUnit: IngredientDraft['stockUnit'];
  purchaseUnit: IngredientDraft['purchaseUnit'];
  consumptionUnit: IngredientDraft['consumptionUnit'];
  balance: Decimal;
  minimumStock: Decimal;
  purchaseUnitCost: Decimal;
  /** null = this ingredient does not control shelf life. */
  shelfLifeDays: number | null;
}

/**
 * Active ingredients with their derived balance. RLS limits both queries to
 * the signed-in user's organization.
 */
export async function listIngredients(): Promise<IngredientListItem[]> {
  const [ingredientsResult, balancesResult] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, sku, name, category_id, purchase_unit, stock_unit, consumption_unit, minimum_stock, purchase_unit_cost, shelf_life_days, is_active, ingredient_categories(name)')
      .eq('is_active', true)
      .order('name'),
    supabase.from('ingredient_balances').select('ingredient_id, balance'),
  ]);

  if (ingredientsResult.error) throw ingredientsResult.error;
  if (balancesResult.error) throw balancesResult.error;

  const balances = new Map<string, Decimal>(
    (balancesResult.data as BalanceRow[]).map((row) => [row.ingredient_id, Decimal.of(row.balance)]),
  );

  return (ingredientsResult.data as unknown as IngredientRow[]).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryName: row.ingredient_categories?.name ?? 'Sem categoria',
    stockUnit: row.stock_unit,
    purchaseUnit: row.purchase_unit,
    consumptionUnit: row.consumption_unit,
    balance: balances.get(row.id) ?? Decimal.ZERO,
    minimumStock: Decimal.of(row.minimum_stock),
    purchaseUnitCost: Decimal.of(row.purchase_unit_cost),
    shelfLifeDays: row.shelf_life_days,
  }));
}

export async function listCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from('ingredient_categories').select('id, name').order('name');
  if (error) throw error;
  return data as CategoryRow[];
}

export async function listSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, document, phone, email, notes')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as SupplierRow[];
}

export interface SupplierDraft {
  name: string;
  /** CPF or CNPJ, digits only. Empty string when not informed. */
  document: string;
  phone: string;
  email: string;
  notes: string;
}

export async function createSupplier(draft: SupplierDraft): Promise<string> {
  const { data, error } = await supabase.rpc('create_supplier', {
    p_name: draft.name,
    p_document: draft.document,
    p_phone: draft.phone,
    p_email: draft.email,
    p_notes: draft.notes,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Writes the ingredient and its opening balance in one backend transaction.
 * Returns the ingredient id. A retry with the same requestId returns the
 * existing ingredient instead of creating another one.
 */
export async function createIngredient(draft: IngredientDraft, requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_ingredient', {
    p_client_request_id: requestId,
    p_sku: draft.sku,
    p_name: draft.name,
    p_category_id: draft.categoryId,
    p_purchase_unit: draft.purchaseUnit,
    p_stock_unit: draft.stockUnit,
    p_consumption_unit: draft.consumptionUnit,
    p_purchase_to_stock_factor: draft.purchaseToStockFactor.toString(),
    p_consumption_to_stock_factor: draft.consumptionToStockFactor.toString(),
    p_opening_quantity: draft.openingQuantity.toString(),
    p_minimum_stock: draft.minimumStock.toString(),
    p_maximum_stock: draft.maximumStock?.toString() ?? null,
    p_purchase_unit_cost: draft.purchaseUnitCost.toString(),
    p_supplier_id: draft.supplierId,
    p_storage_location: draft.storageLocation,
    p_shelf_life_days: draft.shelfLifeDays,
  });
  if (error) throw error;
  return data as string;
}
