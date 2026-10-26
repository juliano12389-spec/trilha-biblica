import { Decimal } from '../decimal';

describe('Decimal', () => {
  it('adds decimals exactly, where binary floats give 0.30000000000000004', () => {
    expect(Decimal.of('0.1').add('0.2').toString()).toBe('0.3');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('parses pt-BR input when a comma is present', () => {
    expect(Decimal.parseUserInput('1.234,56')?.toString()).toBe('1234.56');
    expect(Decimal.parseUserInput('2,5')?.toString()).toBe('2.5');
  });

  it('treats the dot as decimal mark when no comma is present', () => {
    expect(Decimal.parseUserInput('1.5')?.toString()).toBe('1.5');
    expect(Decimal.parseUserInput('1000')?.toString()).toBe('1000');
  });

  it('rejects unparseable or over-precise input', () => {
    expect(Decimal.parseUserInput('')).toBeNull();
    expect(Decimal.parseUserInput('abc')).toBeNull();
    expect(Decimal.parseUserInput('1,2,3')).toBeNull();
    expect(Decimal.parseUserInput('0.0000001')).toBeNull();
  });

  it('multiplies and rounds half away from zero at the internal scale', () => {
    expect(Decimal.of('250').multiply('0.001').toString()).toBe('0.25');
    expect(Decimal.of('-2.5').multiply('2').toString()).toBe('-5');
  });

  it('divides and rounds the result', () => {
    expect(Decimal.of('1').divide('3').toFixed(4)).toBe('0.3333');
    expect(() => Decimal.of('1').divide('0')).toThrow(RangeError);
  });

  it('compares values without floats', () => {
    expect(Decimal.of('10').compareTo('9.999')).toBe(1);
    expect(Decimal.of('5').compareTo('5.000000')).toBe(0);
    expect(Decimal.of('-1').compareTo(0)).toBe(-1);
  });

  it('formats with fixed decimals and rounds half away from zero', () => {
    expect(Decimal.of('38.5').toFixed(2)).toBe('38.50');
    expect(Decimal.of('2.345').toFixed(2)).toBe('2.35');
    expect(Decimal.of('-0.004').toFixed(2)).toBe('0.00');
  });

  it('never prints negative zero', () => {
    expect(Decimal.of('-0').toString()).toBe('0');
    expect(Decimal.of('-0.000000').toString()).toBe('0');
    expect(Decimal.of('-0.000001').multiply('0').toString()).toBe('0');
  });

  it('rejects non-finite numbers', () => {
    expect(() => Decimal.of(Number.NaN)).toThrow(RangeError);
    expect(() => Decimal.of(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
