import { describe, expect, it } from 'vitest';
import { formatQuantity, formatQuantityParts, toBaseQuantity } from './units';
import { centsToMajor, computeUnitCost, formatCents, majorToCents } from './money';
import { addDays, daysBetween, formatRelativeDays, getBusinessToday, isExpired } from './dates';
import { normalizeText } from './normalise';

describe('Units helper', () => {
  it('formats base quantities and promotes g/ml at >= 1000', () => {
    expect(formatQuantity('450.000', 'g')).toBe('450 g');
    expect(formatQuantity('1000.000', 'g')).toBe('1.0 kg');
    expect(formatQuantity('1500.000', 'g')).toBe('1.5 kg');
    expect(formatQuantity('250.000', 'ml')).toBe('250 ml');
    expect(formatQuantity('12000.000', 'ml')).toBe('12.0 L');
    expect(formatQuantity('6.000', 'each')).toBe('6 each');
  });

  it('provides quantity parts for separated styling', () => {
    expect(formatQuantityParts('12000.000', 'ml')).toEqual({
      value: '12.0',
      unit: 'L',
    });
    expect(formatQuantityParts('500.000', 'g')).toEqual({
      value: '500',
      unit: 'g',
    });
  });

  it('converts display input to base quantities with exact 3 decimals', () => {
    expect(toBaseQuantity('1.5', 'kg')).toBe('1500.000');
    expect(toBaseQuantity('2', 'L')).toBe('2000.000');
    expect(toBaseQuantity('250', 'ml')).toBe('250.000');
    expect(toBaseQuantity('12', 'each')).toBe('12.000');
  });
});

describe('Money helper', () => {
  it('formats integer centavos using en-PH currency standards', () => {
    // en-PH format produces ₱1,250.00 (PHP symbol and comma separators)
    const formatted = formatCents(125000);
    expect(formatted).toMatch(/₱\s?1,250\.00/);
    expect(formatCents(0)).toMatch(/₱\s?0\.00/);
    expect(formatCents(null)).toBe('—');
  });

  it('converts major units to centavos with half-up rounding', () => {
    expect(majorToCents('1250.00')).toBe(125000);
    expect(majorToCents('12.505')).toBe(1251);
    expect(majorToCents('12.504')).toBe(1250);
    expect(majorToCents('0.01')).toBe(1);
  });

  it('converts centavos back to 2-decimal major strings', () => {
    expect(centsToMajor(125050)).toBe('1250.50');
    expect(centsToMajor(5)).toBe('0.05');
  });

  it('computes per-base-unit cost to 6 decimal places', () => {
    // ₱120.00 (12000 cents) for 1000 ml = 0.120000 / ml
    expect(computeUnitCost(12000, '1000.000')).toBe('0.120000');
    // ₱150.00 (15000 cents) for 12 each = 12.500000 / each
    expect(computeUnitCost(15000, '12.000')).toBe('12.500000');
  });
});

describe('Dates helper', () => {
  it('returns valid YYYY-MM-DD in Asia/Manila', () => {
    const today = getBusinessToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('adds calendar days across month and leap-year boundaries without local time drift', () => {
    expect(addDays('2026-11-08', 3)).toBe('2026-11-11');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // Leap year check
  });

  it('computes days between two calendar dates', () => {
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3);
    expect(daysBetween('2026-11-04', '2026-11-01')).toBe(-3);
    expect(daysBetween('2026-11-04', '2026-11-04')).toBe(0);
  });

  it('formats relative day labels per design.md copy specifications', () => {
    expect(formatRelativeDays('2026-11-05', '2026-11-05')).toBe('today');
    expect(formatRelativeDays('2026-11-06', '2026-11-05')).toBe('tomorrow');
    expect(formatRelativeDays('2026-11-08', '2026-11-05')).toBe('3 days');
    expect(formatRelativeDays('2026-11-04', '2026-11-05')).toBe('expired yesterday');
    expect(formatRelativeDays('2026-11-03', '2026-11-05')).toBe('expired 2 days ago');
  });

  it('evaluates isExpired correctly against reference date', () => {
    expect(isExpired('2026-11-04', '2026-11-05')).toBe(true);
    expect(isExpired('2026-11-05', '2026-11-05')).toBe(false);
    expect(isExpired('2026-11-06', '2026-11-05')).toBe(false);
  });
});

describe('Normalise helper', () => {
  it('normalizes item names and descriptions by stripping punctuation and collapsing whitespace', () => {
    expect(normalizeText('Oat Milk (Barista Edition) - 1 L!')).toBe('oat milk barista edition 1 l');
    expect(normalizeText('  Fresh   Eggs (Case of 30)  ')).toBe('fresh eggs case of 30');
    expect(normalizeText('Pandesal: Traditional')).toBe('pandesal traditional');
  });
});

