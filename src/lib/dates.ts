const BUSINESS_TIMEZONE = 'Asia/Manila';

const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns current calendar day in Asia/Manila as "YYYY-MM-DD".
 * Never construct local Date objects from this string.
 */
export function getBusinessToday(date: Date = new Date()): string {
  return manilaDateFormatter.format(date);
}

/**
 * Parses YYYY-MM-DD into UTC epoch milliseconds.
 * Strictly operates at UTC midnight to avoid local timezone shifts.
 */
function parseDateStrToUtcMidnight(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid calendar date string format: "${dateStr}" (expected YYYY-MM-DD)`);
  }
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function formatUtcMidnightToString(utcEpochMs: number): string {
  const d = new Date(utcEpochMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds an integer number of calendar days to a YYYY-MM-DD string.
 */
export function addDays(dateStr: string, days: number): string {
  const currentUtc = parseDateStrToUtcMidnight(dateStr);
  const newUtc = currentUtc + days * 86_400_000;
  return formatUtcMidnightToString(newUtc);
}

/**
 * Returns the calendar day difference (targetDate - baseDate).
 * Positive if target is in the future, negative if in the past.
 */
export function daysBetween(baseDateStr: string, targetDateStr: string): number {
  const baseUtc = parseDateStrToUtcMidnight(baseDateStr);
  const targetUtc = parseDateStrToUtcMidnight(targetDateStr);
  return Math.round((targetUtc - baseUtc) / 86_400_000);
}

/**
 * Formats relative calendar day labels per design.md §6:
 * "today", "tomorrow", "3 days", "expired 2 days ago".
 */
export function formatRelativeDays(
  targetDateStr: string,
  todayStr: string = getBusinessToday(),
): string {
  const diff = daysBetween(todayStr, targetDateStr);

  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 1) return `${diff} days`;
  if (diff === -1) return 'expired yesterday';
  return `expired ${Math.abs(diff)} days ago`;
}

/**
 * Checks whether an expiry date is strictly before today in the business timezone.
 */
export function isExpired(
  expiryDateStr: string,
  todayStr: string = getBusinessToday(),
): boolean {
  return expiryDateStr < todayStr;
}

