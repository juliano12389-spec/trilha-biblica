import { Decimal } from './decimal';

/**
 * Units of measure. Codes match the `units_of_measure` table and the
 * `unit_conversions` seed in supabase/migrations.
 *
 * - massa / volume: fixed, universal factors (kg <-> g, L <-> ml).
 * - contagem: packaging and piece counts (un, pacote, caixa, fardo). They
 *   have no universal factor, so every conversion between them must be an
 *   explicit factor registered on the ingredient.
 */
export const UNIT_CODES = ['kg', 'g', 'l', 'ml', 'un', 'pacote', 'caixa', 'fardo'] as const;

export type UnitCode = (typeof UNIT_CODES)[number];

export type UnitDimension = 'massa' | 'volume' | 'contagem';

export interface UnitDefinition {
  code: UnitCode;
  label: string;
  dimension: UnitDimension;
}

export const UNITS: readonly UnitDefinition[] = [
  { code: 'kg', label: 'Quilograma (kg)', dimension: 'massa' },
  { code: 'g', label: 'Grama (g)', dimension: 'massa' },
  { code: 'l', label: 'Litro (L)', dimension: 'volume' },
  { code: 'ml', label: 'Mililitro (ml)', dimension: 'volume' },
  { code: 'un', label: 'Unidade (un)', dimension: 'contagem' },
  { code: 'pacote', label: 'Pacote', dimension: 'contagem' },
  { code: 'caixa', label: 'Caixa', dimension: 'contagem' },
  { code: 'fardo', label: 'Fardo', dimension: 'contagem' },
];

/** Fixed factors: `1 from = factor to`. Mirrors the unit_conversions seed. */
export const FIXED_CONVERSIONS: readonly { from: UnitCode; to: UnitCode; factor: string }[] = [
  { from: 'kg', to: 'g', factor: '1000' },
  { from: 'g', to: 'kg', factor: '0.001' },
  { from: 'l', to: 'ml', factor: '1000' },
  { from: 'ml', to: 'l', factor: '0.001' },
];

export class IncompatibleUnitsError extends Error {
  constructor(from: UnitCode, to: UnitCode) {
    super(
      `Não é possível converter ${from} em ${to} automaticamente. ` +
        'Cadastre um fator de conversão específico para o insumo.',
    );
    this.name = 'IncompatibleUnitsError';
  }
}

export function getUnit(code: string): UnitDefinition | undefined {
  return UNITS.find((unit) => unit.code === code);
}

export function isUnitCode(value: string): value is UnitCode {
  return (UNIT_CODES as readonly string[]).includes(value);
}

export function dimensionOf(code: UnitCode): UnitDimension {
  const unit = getUnit(code);
  if (!unit) {
    throw new RangeError(`Unidade desconhecida: ${code}`);
  }
  return unit.dimension;
}

/**
 * Universal factor for `from -> to`, or null when the pair has none.
 * Returns 1 for identical units.
 */
export function fixedConversionFactor(from: UnitCode, to: UnitCode): Decimal | null {
  if (from === to) {
    return Decimal.ONE;
  }
  const match = FIXED_CONVERSIONS.find((row) => row.from === from && row.to === to);
  return match ? Decimal.of(match.factor) : null;
}

/**
 * Converts a quantity between two units that have a universal factor.
 * Throws IncompatibleUnitsError for pairs without one (different dimensions,
 * or packaging units that need an explicit ingredient factor).
 */
export function convertFixed(quantity: Decimal, from: UnitCode, to: UnitCode): Decimal {
  const factor = fixedConversionFactor(from, to);
  if (!factor) {
    throw new IncompatibleUnitsError(from, to);
  }
  return quantity.multiply(factor);
}

/**
 * How a conversion between two units of an ingredient is obtained:
 * - identidade: same unit, factor is 1.
 * - tabela: universal catalog factor (kg/g, L/ml), filled automatically.
 * - manual: the user must type the factor (density, packaging).
 */
export type ConversionMode = 'identidade' | 'tabela' | 'manual';

export function conversionModeFor(from: UnitCode, to: UnitCode): ConversionMode {
  if (from === to) {
    return 'identidade';
  }
  return fixedConversionFactor(from, to) ? 'tabela' : 'manual';
}
