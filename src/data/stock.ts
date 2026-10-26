import { Decimal } from '../domain/decimal';
import type { UnitCode } from '../domain/units';
import type { ReceiptItem } from '../domain/stock';
import { supabase } from '../lib/supabase';

export interface LotItem {
  lotId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientSku: string;
  lotCode: string;
  unit: UnitCode;
  balance: Decimal;
  manufacturedOn: string | null;
  receivedOn: string;
  expiresOn: string | null;
}

interface LotRow {
  lot_id: string;
  ingredient_id: string;
  lot_code: string;
  unit: UnitCode;
  balance: string | number;
  manufactured_on: string | null;
  received_on: string;
  expires_on: string | null;
}

interface IngredientNameRow {
  id: string;
  name: string;
  sku: string;
}

/**
 * Lots with stock left, in FEFO order: earliest expiry first, lots without an
 * expiry date last. Balances come from the ledger view, not stored fields.
 */
export async function listLots(): Promise<LotItem[]> {
  const [lotsResult, ingredientsResult] = await Promise.all([
    supabase.from('inventory_lot_balances').select('*').gt('balance', 0),
    supabase.from('ingredients').select('id, name, sku'),
  ]);
  if (lotsResult.error) throw lotsResult.error;
  if (ingredientsResult.error) throw ingredientsResult.error;

  const names = new Map((ingredientsResult.data as IngredientNameRow[]).map((row) => [row.id, row]));

  const lots = (lotsResult.data as LotRow[]).map((row) => {
    const ingredient = names.get(row.ingredient_id);
    return {
      lotId: row.lot_id,
      ingredientId: row.ingredient_id,
      ingredientName: ingredient?.name ?? 'Insumo',
      ingredientSku: ingredient?.sku ?? '',
      lotCode: row.lot_code,
      unit: row.unit,
      balance: Decimal.of(row.balance),
      manufacturedOn: row.manufactured_on,
      receivedOn: row.received_on,
      expiresOn: row.expires_on,
    };
  });

  return lots.sort((a, b) => {
    if (a.expiresOn !== b.expiresOn) {
      if (a.expiresOn === null) return 1;
      if (b.expiresOn === null) return -1;
      return a.expiresOn < b.expiresOn ? -1 : 1;
    }
    return a.receivedOn < b.receivedOn ? -1 : a.receivedOn > b.receivedOn ? 1 : 0;
  });
}

export interface MovementItem {
  id: string;
  type: string;
  delta: Decimal;
  unit: UnitCode;
  balanceAfter: Decimal;
  reason: string | null;
  occurredAt: string;
  ingredientName: string;
}

interface MovementRow {
  id: string;
  movement_type: string;
  quantity_delta: string | number;
  unit: UnitCode;
  balance_after: string | number;
  reason: string | null;
  occurred_at: string;
  ingredients: { name: string } | null;
}

export async function listMovements(limit = 60): Promise<MovementItem[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, movement_type, quantity_delta, unit, balance_after, reason, occurred_at, ingredients(name)')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data as unknown as MovementRow[]).map((row) => ({
    id: row.id,
    type: row.movement_type,
    delta: Decimal.of(row.quantity_delta),
    unit: row.unit,
    balanceAfter: Decimal.of(row.balance_after),
    reason: row.reason,
    occurredAt: row.occurred_at,
    ingredientName: row.ingredients?.name ?? 'Insumo',
  }));
}

export interface ReceiptDraft {
  supplierId: string;
  documentNumber: string;
  receivedOn: string;
  notes: string;
}

/**
 * Registers one receipt with all its lines in a single backend transaction.
 * The same requestId on a retry returns the receipt already created.
 */
export async function createReceipt(draft: ReceiptDraft, items: readonly ReceiptItem[], requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('register_goods_receipt', {
    p_client_request_id: requestId,
    p_supplier_id: draft.supplierId,
    p_document_number: draft.documentNumber,
    p_received_on: draft.receivedOn,
    p_notes: draft.notes,
    p_items: items.map((item) => ({
      ingredient_id: item.ingredientId,
      quantity: item.quantity.toString(),
      unit_cost: item.unitCost.toString(),
      lot_code: item.lotCode,
      manufactured_on: item.manufacturedOn,
      expires_on: item.expiresOn,
    })),
  });
  if (error) throw error;
  return data as string;
}

/** Signed quantity in the ingredient's stock unit. Returns the movement id. */
export async function registerAdjustment(
  lotId: string,
  quantity: Decimal,
  reason: string,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('register_stock_adjustment', {
    p_client_request_id: requestId,
    p_lot_id: lotId,
    p_quantity: quantity.toString(),
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}
