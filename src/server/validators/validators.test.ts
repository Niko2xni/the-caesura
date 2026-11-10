import { describe, expect, it } from 'vitest';
import {
  createCategorySchema,
  createProductSchema,
  createSupplierItemSchema,
  createSupplierSchema,
  updateProductSchema,
} from './catalogue';
import {
  receiveDeliverySchema,
  recordAdjustmentSchema,
  recordUsageSchema,
  recordWasteSchema,
} from './ledger';

describe('Catalogue Validators', () => {
  it('validates a correct createCategory payload', () => {
    const valid = createCategorySchema.safeParse({ name: 'Dairy', sortOrder: 1 });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.name).toBe('Dairy');
      expect(valid.data.sortOrder).toBe(1);
    }
  });

  it('rejects empty category name', () => {
    const invalid = createCategorySchema.safeParse({ name: '   ' });
    expect(invalid.success).toBe(false);
  });

  it('validates a correct createProduct payload with expiry tracking', () => {
    const valid = createProductSchema.safeParse({
      sku: 'MILK-WB-1L',
      name: 'Fresh Whole Milk',
      baseUnit: 'ml',
      tracksExpiry: true,
      shelfLifeDays: 14,
      reorderPoint: '5000',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects shelfLifeDays when tracksExpiry is false', () => {
    const invalid = createProductSchema.safeParse({
      sku: 'SYRUP-VAN-1L',
      name: 'Vanilla Syrup',
      baseUnit: 'ml',
      tracksExpiry: false,
      shelfLifeDays: 90,
      reorderPoint: '1000',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toMatch(/requires expiry tracking/i);
    }
  });

  it('rejects negative reorderPoint in createProduct', () => {
    const invalid = createProductSchema.safeParse({
      sku: 'BEANS-ESP-1KG',
      name: 'Espresso Blend Beans',
      baseUnit: 'g',
      tracksExpiry: true,
      reorderPoint: '-10',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates createSupplier with optional fields', () => {
    const valid = createSupplierSchema.safeParse({
      name: 'Farm Fresh Dairy',
      contactName: 'Jane Doe',
      email: 'jane@farmfresh.ph',
      phone: '09171234567',
      leadTimeDays: 2,
    });
    expect(valid.success).toBe(true);
  });

  it('accepts empty string for supplier email', () => {
    const valid = createSupplierSchema.safeParse({
      name: 'Local Market',
      email: '',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid supplier email', () => {
    const invalid = createSupplierSchema.safeParse({
      name: 'Local Market',
      email: 'not-an-email',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates createSupplierItem with positive packQuantity', () => {
    const valid = createSupplierItemSchema.safeParse({
      supplierId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      productId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      description: 'Whole Milk 1L Tetra',
      packLabel: '1L carton',
      packQuantity: '1000',
      lastPackCostCents: 9500,
    });
    expect(valid.success).toBe(true);
  });

  it('rejects zero or negative packQuantity in supplier item', () => {
    const invalid = createSupplierItemSchema.safeParse({
      supplierId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      productId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      description: 'Whole Milk 1L Tetra',
      packLabel: '1L carton',
      packQuantity: '0',
    });
    expect(invalid.success).toBe(false);
  });
});

describe('Ledger Validators', () => {
  it('validates a complete receiveDelivery payload', () => {
    const valid = receiveDeliverySchema.safeParse({
      supplierId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      deliveryDate: '2026-11-10',
      reference: 'INV-2026-001',
      source: 'manual',
      idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      lines: [
        {
          productId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          packCount: '6',
          packQuantity: '1000',
          lineCostCents: 57000,
          expiryDate: '2026-11-24',
          expirySource: 'printed',
          matchMethod: 'manual',
        },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it('transforms empty expiryDate string to null', () => {
    const valid = receiveDeliverySchema.safeParse({
      supplierId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      deliveryDate: '2026-11-10',
      idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      lines: [
        {
          productId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          packCount: '1',
          packQuantity: '1000',
          expiryDate: '',
          matchMethod: 'manual',
        },
      ],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.lines[0]?.expiryDate).toBeNull();
    }
  });

  it('rejects delivery with empty lines array', () => {
    const invalid = receiveDeliverySchema.safeParse({
      supplierId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      deliveryDate: '2026-11-10',
      idempotencyKey: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      lines: [],
    });
    expect(invalid.success).toBe(false);
  });

  it('validates recordUsage schema', () => {
    const valid = recordUsageSchema.safeParse({
      productId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: '250',
      note: 'Morning bar prep',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects zero or negative quantity in recordUsage', () => {
    const invalid = recordUsageSchema.safeParse({
      productId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: '0',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates recordWaste schema with allowed waste reason', () => {
    const valid = recordWasteSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: '500',
      wasteReason: 'spoiled',
      note: 'Left out overnight',
    });
    expect(valid.success).toBe(true);
  });

  it('rejects invalid waste reason in recordWaste', () => {
    const invalid = recordWasteSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: '500',
      wasteReason: 'dropped_on_floor', // not an allowed enum
    });
    expect(invalid.success).toBe(false);
  });

  it('validates recordAdjustment schema with non-zero delta and non-empty note', () => {
    const validPositive = recordAdjustmentSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantityDelta: '200',
      note: 'Physical count found 1 extra carton',
    });
    expect(validPositive.success).toBe(true);

    const validNegative = recordAdjustmentSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantityDelta: '-150.5',
      note: 'Found leak in bottom container',
    });
    expect(validNegative.success).toBe(true);
  });

  it('rejects zero quantity delta or empty note in recordAdjustment', () => {
    const zeroDelta = recordAdjustmentSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantityDelta: '0',
      note: 'Count check',
    });
    expect(zeroDelta.success).toBe(false);

    const emptyNote = recordAdjustmentSchema.safeParse({
      batchId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantityDelta: '50',
      note: '   ',
    });
    expect(emptyNote.success).toBe(false);
  });
});

