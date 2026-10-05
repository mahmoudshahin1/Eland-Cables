/**
 * Fixed-precision decimal arithmetic for costing formulas.
 * Avoids JavaScript floating-point errors without external dependencies.
 */

const SCALE = 10;

function normalize(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER');
    return value.toString();
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error('EMPTY_VALUE');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error('INVALID_DECIMAL');
  return trimmed;
}

function toScaledInt(value: string): bigint {
  const neg = value.startsWith('-');
  const abs = neg ? value.slice(1) : value;
  const [whole, frac = ''] = abs.split('.');
  const padded = (frac + '0'.repeat(SCALE)).slice(0, SCALE);
  const combined = BigInt(whole + padded);
  return neg ? -combined : combined;
}

function fromScaledInt(scaled: bigint): string {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const str = abs.toString().padStart(SCALE + 1, '0');
  const whole = str.slice(0, -SCALE) || '0';
  const frac = str.slice(-SCALE).replace(/0+$/, '');
  const result = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${result}` : result;
}

function fromScaled(scaled: bigint): CostingDecimal {
  return new CostingDecimal(fromScaledInt(scaled), true);
}

export class CostingDecimal {
  readonly scaled: bigint;

  constructor(value: string | number, fromInternal = false) {
    if (fromInternal && typeof value === 'string') {
      this.scaled = toScaledInt(value);
      return;
    }
    this.scaled = toScaledInt(normalize(value));
  }

  static zero(): CostingDecimal {
    return fromScaled(0n);
  }

  static isZero(value: CostingDecimal): boolean {
    return value.scaled === 0n;
  }

  add(other: CostingDecimal): CostingDecimal {
    return fromScaled(this.scaled + other.scaled);
  }

  sub(other: CostingDecimal): CostingDecimal {
    return fromScaled(this.scaled - other.scaled);
  }

  mul(other: CostingDecimal): CostingDecimal {
    const product = this.scaled * other.scaled;
    const divisor = 10n ** BigInt(SCALE);
    return fromScaled(product / divisor);
  }

  div(other: CostingDecimal): CostingDecimal {
    if (other.scaled === 0n) {
      const err = new Error('Division by zero');
      (err as Error & { code: string }).code = 'DIVISION_BY_ZERO';
      throw err;
    }
    const dividend = this.scaled * 10n ** BigInt(SCALE);
    return fromScaled(dividend / other.scaled);
  }

  neg(): CostingDecimal {
    return fromScaled(-this.scaled);
  }

  toString(): string {
    return fromScaledInt(this.scaled);
  }

  toNumber(): number {
    return Number(this.toString());
  }

  compare(other: CostingDecimal): number {
    if (this.scaled < other.scaled) return -1;
    if (this.scaled > other.scaled) return 1;
    return 0;
  }
}
