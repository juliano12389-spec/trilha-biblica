/**
 * Fixed-point decimal used for every quantity and monetary value.
 *
 * Values are stored as a BigInt scaled by 10^SCALE, so no binary floating
 * point is involved in stock or cost arithmetic. SCALE matches the widest
 * precision the database stores (numeric(18,6) for conversion factors).
 */

const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class Decimal {
  private constructor(private readonly scaled: bigint) {}

  static readonly ZERO = new Decimal(0n);
  static readonly ONE = new Decimal(SCALE_FACTOR);

  static of(value: number | string | Decimal): Decimal {
    if (value instanceof Decimal) {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new RangeError('Decimal.of recebeu um número não finito');
      }
      return Decimal.parseCanonical(value.toFixed(SCALE));
    }
    return Decimal.parseCanonical(value);
  }

  /**
   * Parses user-typed numbers.
   *
   * If the text contains a comma it is treated as pt-BR ("1.234,56"): dots
   * are thousands separators and the comma is the decimal mark. Otherwise the
   * dot is the decimal mark ("1.5"). Returns null for anything unparseable.
   */
  static parseUserInput(text: string): Decimal | null {
    const compact = text.trim().replace(/\s+/g, '');
    if (compact === '') {
      return null;
    }
    const normalized = compact.includes(',')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact;
    if (!DECIMAL_PATTERN.test(normalized)) {
      return null;
    }
    const fractionDigits = normalized.split('.')[1]?.length ?? 0;
    if (fractionDigits > SCALE) {
      return null;
    }
    return Decimal.parseCanonical(normalized);
  }

  private static parseCanonical(text: string): Decimal {
    if (!DECIMAL_PATTERN.test(text)) {
      throw new RangeError(`Valor decimal inválido: "${text}"`);
    }
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [whole, fraction = ''] = unsigned.split('.');
    if (fraction.length > SCALE) {
      throw new RangeError(`Mais de ${SCALE} casas decimais: "${text}"`);
    }
    const scaled =
      BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(SCALE, '0'));
    return new Decimal(negative ? -scaled : scaled);
  }

  add(other: Decimal | number | string): Decimal {
    return new Decimal(this.scaled + Decimal.of(other).scaled);
  }

  subtract(other: Decimal | number | string): Decimal {
    return new Decimal(this.scaled - Decimal.of(other).scaled);
  }

  multiply(other: Decimal | number | string): Decimal {
    // Both operands carry SCALE digits, so divide once to restore the scale.
    // Rounds half away from zero.
    const product = this.scaled * Decimal.of(other).scaled;
    return new Decimal(roundedDivide(product, SCALE_FACTOR));
  }

  divide(other: Decimal | number | string): Decimal {
    const divisor = Decimal.of(other);
    if (divisor.scaled === 0n) {
      throw new RangeError('Divisão por zero');
    }
    const numerator = this.scaled * SCALE_FACTOR;
    return new Decimal(roundedDivide(numerator, divisor.scaled));
  }

  compareTo(other: Decimal | number | string): -1 | 0 | 1 {
    const delta = this.scaled - Decimal.of(other).scaled;
    if (delta === 0n) {
      return 0;
    }
    return delta < 0n ? -1 : 1;
  }

  isZero(): boolean {
    return this.scaled === 0n;
  }

  isNegative(): boolean {
    return this.scaled < 0n;
  }

  isPositive(): boolean {
    return this.scaled > 0n;
  }

  /** Canonical string with up to SCALE decimals and no trailing zeros. */
  toString(): string {
    const negative = this.scaled < 0n;
    const digits = (negative ? -this.scaled : this.scaled).toString().padStart(SCALE + 1, '0');
    const whole = digits.slice(0, -SCALE);
    const fraction = digits.slice(-SCALE).replace(/0+$/, '');
    const body = fraction === '' ? whole : `${whole}.${fraction}`;
    return negative && body !== '0' ? `-${body}` : body;
  }

  /** Fixed number of fraction digits, rounded half away from zero. */
  toFixed(decimals: number): string {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > SCALE) {
      throw new RangeError(`Casas decimais fora do intervalo: ${decimals}`);
    }
    const step = 10n ** BigInt(SCALE - decimals);
    const rounded = roundedDivide(this.scaled, step) * step;
    const sign = rounded < 0n ? '-' : '';
    const absolute = (rounded < 0n ? -rounded : rounded).toString().padStart(SCALE + 1, '0');
    const whole = absolute.slice(0, -SCALE);
    const fraction = absolute.slice(-SCALE).slice(0, decimals);
    return decimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
  }
}

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = (absNumerator + absDenominator / 2n) / absDenominator;
  return negative ? -quotient : quotient;
}
