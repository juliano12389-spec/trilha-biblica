import { Decimal } from '../domain/decimal';
import type { SalesModeCode } from '../domain/sales';
import { supabase } from '../lib/supabase';

export async function getSalesMode(): Promise<SalesModeCode> {
  const { data, error } = await supabase.from('organization_settings').select('sales_mode').maybeSingle();
  if (error) throw error;
  // No row means the default mode, the same rule as sales_mode_of in the database.
  return ((data as { sales_mode: SalesModeCode } | null)?.sales_mode ?? 'baixa_na_producao');
}

export async function setSalesMode(mode: SalesModeCode): Promise<void> {
  const { error } = await supabase.rpc('set_sales_mode', { p_mode: mode });
  if (error) throw error;
}

export interface SaleItemInput {
  productA: string;
  productB: string | null;
  pizzas: number;
}

export async function registerSale(
  requestId: string,
  channel: string,
  externalId: string,
  items: SaleItemInput[],
  discount: Decimal,
  payment: string | null,
  notes: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('register_sale', {
    p_client_request_id: requestId,
    p_channel: channel,
    p_external_id: externalId === '' ? null : externalId,
    p_items: items.map((item) => ({
      product_a: item.productA,
      ...(item.productB ? { product_b: item.productB } : {}),
      pizzas: item.pizzas,
    })),
    p_discount: discount.toString(),
    p_payment_method: payment,
    p_notes: notes,
    p_sold_at: null,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelSale(saleId: string, reason: string, recovered: { itemId: string; recovered: number }[]): Promise<void> {
  const { error } = await supabase.rpc('cancel_sale', {
    p_sale_id: saleId,
    p_reason: reason,
    p_recovered: recovered.map((row) => ({ item_id: row.itemId, recovered: row.recovered })),
  });
  if (error) throw error;
}

export interface SaleItem {
  id: string;
  productAName: string;
  productBName: string | null;
  pizzas: number;
  unitPrice: Decimal;
  lineTotal: Decimal;
}

export interface SaleRow {
  id: string;
  saleNumber: number;
  channel: string;
  status: 'confirmada' | 'cancelada';
  payment: string | null;
  total: Decimal;
  discount: Decimal;
  soldAt: string;
  salesMode: SalesModeCode;
  cancelReason: string | null;
}

export async function listSales(limit = 40): Promise<SaleRow[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('id, sale_number, channel, status, payment_method, total, discount_amount, sold_at, sales_mode, cancel_reason')
    .order('sale_number', { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: string;
    sale_number: number;
    channel: string;
    status: 'confirmada' | 'cancelada';
    payment_method: string | null;
    total: string | number;
    discount_amount: string | number;
    sold_at: string;
    sales_mode: SalesModeCode;
    cancel_reason: string | null;
  };
  return (data as Row[]).map((row) => ({
    id: row.id,
    saleNumber: row.sale_number,
    channel: row.channel,
    status: row.status,
    payment: row.payment_method,
    total: Decimal.of(row.total),
    discount: Decimal.of(row.discount_amount),
    soldAt: row.sold_at,
    salesMode: row.sales_mode,
    cancelReason: row.cancel_reason,
  }));
}

export async function listSaleItems(saleId: string): Promise<SaleItem[]> {
  const { data, error } = await supabase
    .from('sale_items')
    .select('id, pizzas_quantity, unit_price, line_total, product_a:products!product_a_id(name), product_b:products!product_b_id(name)')
    .eq('sale_id', saleId)
    .order('id');
  if (error) throw error;

  type Row = {
    id: string;
    pizzas_quantity: number;
    unit_price: string | number;
    line_total: string | number;
    product_a: { name: string } | null;
    product_b: { name: string } | null;
  };
  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    productAName: row.product_a?.name ?? 'Sabor',
    productBName: row.product_b?.name ?? null,
    pizzas: row.pizzas_quantity,
    unitPrice: Decimal.of(row.unit_price),
    lineTotal: Decimal.of(row.line_total),
  }));
}

export interface FinishedGoodsRow {
  productAId: string;
  productBId: string | null;
  label: string;
  balance: number;
}

/** Ready pizzas in stock (baixa na produção). Only positive balances. */
export async function listFinishedGoods(): Promise<FinishedGoodsRow[]> {
  const [balancesResult, productsResult] = await Promise.all([
    supabase.from('finished_goods_balances').select('product_a_id, product_b_id, balance').gt('balance', 0),
    supabase.from('products').select('id, name'),
  ]);
  if (balancesResult.error) throw balancesResult.error;
  if (productsResult.error) throw productsResult.error;

  // A view has no foreign keys, so names are looked up separately, as for lots.
  const names = new Map((productsResult.data as { id: string; name: string }[]).map((row) => [row.id, row.name]));

  return (balancesResult.data as { product_a_id: string; product_b_id: string | null; balance: number }[]).map((row) => {
    const first = names.get(row.product_a_id) ?? 'Sabor';
    const second = row.product_b_id ? names.get(row.product_b_id) : null;
    return {
      productAId: row.product_a_id,
      productBId: row.product_b_id,
      label: second ? `${first} / ${second}` : first,
      balance: row.balance,
    };
  });
}
