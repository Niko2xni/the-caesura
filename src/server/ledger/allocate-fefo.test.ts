import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { allocateFefo, BatchCandidate } from './allocate-fefo';

describe('FEFO Allocation Engine (allocateFefo)', () => {
  it('allocates across batches by earliest expiry date first (PRD FR-6)', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'batch-b',
        quantityOnHand: '10.000',
        expiryDate: '2026-11-06',
        receivedAt: '2026-11-01T08:00:00Z',
      },
      {
        id: 'batch-a',
        quantityOnHand: '4.000',
        expiryDate: '2026-11-03',
        receivedAt: '2026-11-01T08:00:00Z',
      },
    ];

    const result = allocateFefo(batches, '6.000');

    expect(result).toEqual({
      ok: true,
      allocations: [
        { batchId: 'batch-a', quantity: '4.000' },
        { batchId: 'batch-b', quantity: '2.000' },
      ],
    });
  });

  it('detects shortfalls and allocates nothing when usable stock is insufficient', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'batch-a',
        quantityOnHand: '4.000',
        expiryDate: '2026-11-03',
        receivedAt: '2026-11-01T08:00:00Z',
      },
      {
        id: 'batch-b',
        quantityOnHand: '10.000',
        expiryDate: '2026-11-06',
        receivedAt: '2026-11-01T08:00:00Z',
      },
    ];

    const result = allocateFefo(batches, '20.000');

    expect(result).toEqual({
      ok: false,
      shortfall: '6.000',
      available: '14.000',
    });
  });

  it('places non-perishable batches (null expiry) after perishable batches', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'non-perishable',
        quantityOnHand: '20.000',
        expiryDate: null,
        receivedAt: '2026-10-01T08:00:00Z', // older arrival
      },
      {
        id: 'perishable-later',
        quantityOnHand: '5.000',
        expiryDate: '2026-11-20',
        receivedAt: '2026-11-01T08:00:00Z',
      },
      {
        id: 'perishable-earlier',
        quantityOnHand: '3.000',
        expiryDate: '2026-11-10',
        receivedAt: '2026-11-02T08:00:00Z',
      },
    ];

    const result = allocateFefo(batches, '10.000');

    expect(result).toEqual({
      ok: true,
      allocations: [
        { batchId: 'perishable-earlier', quantity: '3.000' },
        { batchId: 'perishable-later', quantity: '5.000' },
        { batchId: 'non-perishable', quantity: '2.000' },
      ],
    });
  });

  it('breaks expiry ties using receivedAt ascending, then id ascending', () => {
    const batches: BatchCandidate[] = [
      {
        id: 'batch-2',
        quantityOnHand: '5.000',
        expiryDate: '2026-11-15',
        receivedAt: '2026-11-02T10:00:00Z',
      },
      {
        id: 'batch-1',
        quantityOnHand: '5.000',
        expiryDate: '2026-11-15',
        receivedAt: '2026-11-01T10:00:00Z', // earlier arrival
      },
      {
        id: 'batch-b-same-time',
        quantityOnHand: '2.000',
        expiryDate: '2026-11-20',
        receivedAt: '2026-11-01T08:00:00Z',
      },
      {
        id: 'batch-a-same-time',
        quantityOnHand: '2.000',
        expiryDate: '2026-11-20',
        receivedAt: '2026-11-01T08:00:00Z', // alphabetical id tie-breaker
      },
    ];

    const result = allocateFefo(batches, '12.000');

    expect(result).toEqual({
      ok: true,
      allocations: [
        { batchId: 'batch-1', quantity: '5.000' },
        { batchId: 'batch-2', quantity: '5.000' },
        { batchId: 'batch-a-same-time', quantity: '2.000' },
      ],
    });
  });

  it('rejects zero or negative requested quantities', () => {
    expect(() => allocateFefo([], '0.000')).toThrow(/Requested quantity must be positive/);
    expect(() => allocateFefo([], '-5.000')).toThrow(/Requested quantity must be positive/);
  });

  it('satisfies invariant properties over 50 randomized scenarios', () => {
    for (let i = 0; i < 50; i++) {
      const batchCount = Math.floor(Math.random() * 6) + 1;
      const batches: BatchCandidate[] = [];
      let totalStock = new Decimal(0);

      for (let b = 0; b < batchCount; b++) {
        const qty = new Decimal((Math.random() * 10 + 0.5).toFixed(3));
        totalStock = totalStock.plus(qty);
        const dayOffset = Math.floor(Math.random() * 20);
        batches.push({
          id: `rand-batch-${b}`,
          quantityOnHand: qty.toFixed(3),
          expiryDate: Math.random() > 0.2 ? `2026-11-${String(dayOffset + 1).padStart(2, '0')}` : null,
          receivedAt: new Date(1762000000000 + b * 100000),
        });
      }

      // Random requested amount from 0.1 to totalStock + 5
      const requested = new Decimal((Math.random() * (totalStock.toNumber() + 5) + 0.1).toFixed(3));
      const res = allocateFefo(batches, requested.toFixed(3));

      if (res.ok) {
        // Invariant 1: Sum of allocations must exactly equal requested quantity
        const sumAllocated = res.allocations.reduce(
          (acc, cur) => acc.plus(new Decimal(cur.quantity)),
          new Decimal(0),
        );
        expect(sumAllocated.toFixed(3)).toBe(requested.toFixed(3));

        // Invariant 2: No batch is overdrawn
        for (const alloc of res.allocations) {
          const original = batches.find((b) => b.id === alloc.batchId);
          expect(original).toBeDefined();
          expect(new Decimal(alloc.quantity).lte(new Decimal(original!.quantityOnHand))).toBe(true);
        }
      } else {
        // Invariant 3: On shortfall, shortfall + available == requested
        const shortfall = new Decimal(res.shortfall);
        const available = new Decimal(res.available);
        expect(shortfall.plus(available).toFixed(3)).toBe(requested.toFixed(3));
        expect(available.toFixed(3)).toBe(totalStock.toFixed(3));
      }
    }
  });
});

