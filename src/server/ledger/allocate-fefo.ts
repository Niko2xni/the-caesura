import Decimal from 'decimal.js';

export interface BatchCandidate {
  id: string;
  quantityOnHand: string | Decimal;
  expiryDate: string | null;
  receivedAt: Date | string | number;
}

export interface Allocation {
  batchId: string;
  quantity: string; // base units, 3 decimal places
}

export type AllocationResult =
  | { ok: true; allocations: Allocation[] }
  | { ok: false; shortfall: string; available: string };

/**
 * Pure function: allocates consumption across batches following First-Expired, First-Out (FEFO).
 * - Sort order: expiry ascending (NULLS LAST), then receivedAt ascending, then id ascending.
 * - Caller must filter out expired batches before calling this function.
 * - On shortfall, allocates nothing and returns the exact shortfall.
 * - Zero database or network imports.
 */
export function allocateFefo(
  candidates: readonly BatchCandidate[],
  requestedQuantity: string | number | Decimal,
): AllocationResult {
  const needed = new Decimal(requestedQuantity);

  if (needed.isZero() || needed.isNegative()) {
    throw new Error('Requested quantity must be positive');
  }

  // Filter non-positive batches and clone array for sorting
  const usableBatches = candidates
    .filter((b) => new Decimal(b.quantityOnHand).gt(0))
    .slice()
    .sort((a, b) => {
      // 1. Expiry ascending with NULLS LAST
      if (a.expiryDate !== null && b.expiryDate !== null) {
        const cmp = a.expiryDate.localeCompare(b.expiryDate);
        if (cmp !== 0) return cmp;
      } else if (a.expiryDate === null && b.expiryDate !== null) {
        return 1;
      } else if (a.expiryDate !== null && b.expiryDate === null) {
        return -1;
      }

      // 2. Received timestamp ascending
      const timeA = new Date(a.receivedAt).getTime();
      const timeB = new Date(b.receivedAt).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // 3. ID tie-breaker ascending
      return a.id.localeCompare(b.id);
    });

  let remainingNeeded = needed;
  let totalAvailable = new Decimal(0);
  const allocations: Allocation[] = [];

  for (const batch of usableBatches) {
    const onHand = new Decimal(batch.quantityOnHand);
    totalAvailable = totalAvailable.plus(onHand);

    if (remainingNeeded.gt(0)) {
      const toTake = Decimal.min(remainingNeeded, onHand);
      allocations.push({
        batchId: batch.id,
        quantity: toTake.toFixed(3),
      });
      remainingNeeded = remainingNeeded.minus(toTake);
    }
  }

  if (remainingNeeded.gt(0)) {
    return {
      ok: false,
      shortfall: remainingNeeded.toFixed(3),
      available: totalAvailable.toFixed(3),
    };
  }

  return {
    ok: true,
    allocations,
  };
}

