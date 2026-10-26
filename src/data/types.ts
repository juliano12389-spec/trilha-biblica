/**
 * Row shapes for the tables and views the Fase 1 app reads.
 * Keep in sync with supabase/migrations. Regenerate with the Supabase CLI
 * (`supabase gen types typescript`) once a project is linked.
 */

import type { UnitCode } from '../domain/units';

export interface ProfileRow {
  organization_id: string;
  full_name: string;
  role_code: string;
  organizations: { name: string } | null;
}

export interface CategoryRow {
  id: string;
  name: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface IngredientRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  purchase_unit: UnitCode;
  stock_unit: UnitCode;
  consumption_unit: UnitCode;
  minimum_stock: string | number;
  purchase_unit_cost: string | number;
  shelf_life_days: number | null;
  is_active: boolean;
  ingredient_categories: { name: string } | null;
}

export interface BalanceRow {
  ingredient_id: string;
  balance: string | number;
}
