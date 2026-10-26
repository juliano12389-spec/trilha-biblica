import { Decimal } from '../decimal';
import {
  IncompatibleUnitsError,
  conversionModeFor,
  convertFixed,
  dimensionOf,
  fixedConversionFactor,
  isUnitCode,
} from '../units';

describe('unit conversion', () => {
  it('Teste 7: 5 kg corresponds to 5.000 g', () => {
    expect(convertFixed(Decimal.of(5), 'kg', 'g').toString()).toBe('5000');
  });

  it('converts grams to kilograms exactly', () => {
    expect(convertFixed(Decimal.of(250), 'g', 'kg').toString()).toBe('0.25');
  });

  it('converts litres and millilitres both ways', () => {
    expect(convertFixed(Decimal.of('1.5'), 'l', 'ml').toString()).toBe('1500');
    expect(convertFixed(Decimal.of(750), 'ml', 'l').toString()).toBe('0.75');
  });

  it('treats identical units as factor 1', () => {
    expect(fixedConversionFactor('caixa', 'caixa')?.toString()).toBe('1');
  });

  it('refuses mass <-> volume without an explicit ingredient factor', () => {
    expect(() => convertFixed(Decimal.of(1), 'l', 'kg')).toThrow(IncompatibleUnitsError);
  });

  it('refuses packaging units, which have no universal factor', () => {
    expect(() => convertFixed(Decimal.of(1), 'caixa', 'un')).toThrow(IncompatibleUnitsError);
    expect(() => convertFixed(Decimal.of(1), 'pacote', 'un')).toThrow(IncompatibleUnitsError);
  });

  it('classifies units by dimension', () => {
    expect(dimensionOf('kg')).toBe('massa');
    expect(dimensionOf('ml')).toBe('volume');
    expect(dimensionOf('fardo')).toBe('contagem');
  });

  it('recognises only catalogued unit codes', () => {
    expect(isUnitCode('kg')).toBe(true);
    expect(isUnitCode('libra')).toBe(false);
    expect(isUnitCode('')).toBe(false);
  });
});

describe('conversionModeFor', () => {
  it('uses the catalog for universal pairs, identity for equal units, and manual otherwise', () => {
    expect(conversionModeFor('kg', 'g')).toBe('tabela');
    expect(conversionModeFor('un', 'un')).toBe('identidade');
    expect(conversionModeFor('l', 'kg')).toBe('manual');
    expect(conversionModeFor('caixa', 'un')).toBe('manual');
  });
});
