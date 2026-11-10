import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, db } from '@/db';
import { batches, products, settings, stockMovements, user } from '@/db/schema';
import { getBusinessToday } from '@/lib/dates';
import { getWasteReport } from './reports';

const testRunId = crypto.randomUUID().slice(0, 8);
let testUserId: string;
let testProductId: string;
let testBatchId: string;

describe('Waste Reporting Integration Tests', () => {
  beforeAll(async () => {
    // Ensure settings
    await db
      .insert(settings)
      .values({
        id: 1,
        businessName: 'The Caesura Test Cafe',
        currency: 'PHP',
        timezone: 'Asia/Manila',
      })
      .onConflictDoNothing({ target: settings.id });

    // Create user
    testUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: testUserId,
      name: `Report User ${testRunId}`,
      email: `report-${testRunId}@test.local`,
      role: 'admin',
    });

    // Create product
    const [prod] = await db
      .insert(products)
      .values({
        sku: `REP-MILK-${testRunId}`,
        name: `Reporting Milk ${testRunId}`,
        nameNormalized: `reporting milk ${testRunId}`,
        baseUnit: 'ml',
        tracksExpiry: true,
      })
      .returning({ id: products.id });
    testProductId = prod.id;

    // Create batch with known unitCost: ₱0.095000 / ml
    const [batch] = await db
      .insert(batches)
      .values({
        productId: testProductId,
        unitCost: '0.095000',
        initialQuantity: '10000.000',
        expiryDate: '2026-11-20',
        expirySource: 'printed',
      })
      .returning({ id: batches.id });
    testBatchId = batch.id;

    // Receipt movement to back initial quantity
    await db.insert(stockMovements).values({
      batchId: testBatchId,
      productId: testProductId,
      type: 'receipt',
      quantity: '10000.000',
      createdBy: testUserId,
    });

    // Waste movement 1: 500 ml spoiled (₱47.50 = 4750 cents)
    await db.insert(stockMovements).values({
      batchId: testBatchId,
      productId: testProductId,
      type: 'waste',
      quantity: '-500.000',
      wasteReason: 'spoiled',
      note: 'Left out at room temperature',
      createdBy: testUserId,
    });

    // Waste movement 2: 200 ml expired (₱19.00 = 1900 cents)
    await db.insert(stockMovements).values({
      batchId: testBatchId,
      productId: testProductId,
      type: 'waste',
      quantity: '-200.000',
      wasteReason: 'expired',
      note: 'Batch past expiry date',
      createdBy: testUserId,
    });
  });

  afterAll(async () => {
    await client.end();
  });

  it('aggregates waste quantity and financial value accurately', async () => {
    const today = getBusinessToday();
    const report = await getWasteReport({
      startDate: today,
      endDate: today,
      productId: testProductId,
    });

    expect(report.totalIncidents).toBe(2);
    expect(report.totalQuantity).toBe('700.000');
    // 4750 + 1900 = 6650 cents (₱66.50)
    expect(report.totalCostCents).toBe(6650);

    // Check byReason breakdown
    const spoiled = report.byReason.find((r) => r.reason === 'spoiled');
    expect(spoiled).toBeDefined();
    expect(spoiled?.incidentCount).toBe(1);
    expect(spoiled?.totalQuantity).toBe('500.000');
    expect(spoiled?.totalCostCents).toBe(4750);
    // 4750 / 6650 * 100 = 71.4%
    expect(spoiled?.costPercentage).toBeCloseTo(71.4, 0);

    const expired = report.byReason.find((r) => r.reason === 'expired');
    expect(expired).toBeDefined();
    expect(expired?.incidentCount).toBe(1);
    expect(expired?.totalQuantity).toBe('200.000');
    expect(expired?.totalCostCents).toBe(1900);
    // 1900 / 6650 * 100 = 28.6%
    expect(expired?.costPercentage).toBeCloseTo(28.6, 0);

    // Check itemized incidents
    expect(report.incidents.length).toBe(2);
    expect(report.incidents[0]?.productSku).toBe(`REP-MILK-${testRunId}`);
    expect(report.incidents[0]?.createdByName).toBe(`Report User ${testRunId}`);
  });

  it('filters waste report by reason', async () => {
    const today = getBusinessToday();
    const report = await getWasteReport({
      startDate: today,
      endDate: today,
      productId: testProductId,
      reason: 'spoiled',
    });

    expect(report.totalIncidents).toBe(1);
    expect(report.totalQuantity).toBe('500.000');
    expect(report.totalCostCents).toBe(4750);
    expect(report.incidents.length).toBe(1);
    expect(report.incidents[0]?.wasteReason).toBe('spoiled');
  });
});

