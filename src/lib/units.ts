import Decimal from 'decimal.js';

export type BaseUnit = 'each' | 'g' | 'ml';
export type DisplayUnit = 'each' | 'g' | 'kg' | 'ml' | 'L';

export interface QuantityParts {
  value: string;
  unit: string;
}

/**
 * Converts a base-unit quantity into display parts for UI rendering.
 * Automatically promotes grams to kg and milliliters to L at >= 1000.
 */
export function formatQuantityParts(
  baseQuantity: string | number | Decimal,
  baseUnit: BaseUnit,
): QuantityParts {
  const d = new Decimal(baseQuantity);

  if (baseUnit === 'g' && d.abs().gte(1000)) {
    const valKg = d.div(1000);
    // If integer kg show 1 decimal or strip trailing zeros cleanly
    return {
      value: valKg.decimalPlaces() === 0 ? valKg.toFixed(1) : valKg.toString(),
      unit: 'kg',
    };
  }

  if (baseUnit === 'ml' && d.abs().gte(1000)) {
    const valL = d.div(1000);
    return {
      value: valL.decimalPlaces() === 0 ? valL.toFixed(1) : valL.toString(),
      unit: 'L',
    };
  }

  return {
    value: baseUnit === 'each' && d.isInteger() ? d.toFixed(0) : d.toString(),
    unit: baseUnit,
  };
}

/**
 * Returns a formatted quantity string (e.g. "12.0 L", "450 g", "6 each").
 */
export function formatQuantity(
  baseQuantity: string | number | Decimal,
  baseUnit: BaseUnit,
): string {
  const parts = formatQuantityParts(baseQuantity, baseUnit);
  return `${parts.value} ${parts.unit}`;
}

/**
 * Converts user display input back to base unit decimal string with 3 decimal places.
 * E.g. "1.5" kg -> "1500.000", "2" L -> "2000.000".
 */
export function toBaseQuantity(
  displayValue: string | number | Decimal,
  displayUnit: DisplayUnit,
): string {
  const d = new Decimal(displayValue);

  if (displayUnit === 'kg' || displayUnit === 'L') {
    return d.mul(1000).toFixed(3);
  }

  return d.toFixed(3);
}

