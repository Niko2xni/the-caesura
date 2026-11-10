import Decimal from 'decimal.js';

// Configure standard banker/half-up rounding for money
const MoneyDecimal = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer centavos into standard Philippine Peso currency representation (e.g. ₱1,250.00).
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return '—';
  }
  const major = new MoneyDecimal(cents).div(100).toNumber();
  return phpFormatter.format(major);
}

/**
 * Converts major units (e.g. "1250.50") into integer minor units (centavos),
 * rounding half-up to the nearest centavo.
 */
export function majorToCents(majorUnits: string | number | Decimal): number {
  return new MoneyDecimal(majorUnits).mul(100).round().toNumber();
}

/**
 * Converts integer centavos to major unit string (e.g. 125050 -> "1250.50").
 */
export function centsToMajor(cents: number): string {
  return new MoneyDecimal(cents).div(100).toFixed(2);
}

/**
 * Calculates per-base-unit cost as a numeric(14,6) string from total line cost in cents
 * and total base units delivered.
 * E.g. line cost 12000 cents (₱120.00) for 1000 ml -> "0.120000" per ml.
 */
export function computeUnitCost(
  lineCostCents: number,
  totalBaseQuantity: string | number | Decimal,
): string {
  const qty = new MoneyDecimal(totalBaseQuantity);
  if (qty.isZero() || qty.isNegative()) {
    throw new Error('Total base quantity must be positive to compute unit cost');
  }

  const costMajor = new MoneyDecimal(lineCostCents).div(100);
  return costMajor.div(qty).toFixed(6);
}

