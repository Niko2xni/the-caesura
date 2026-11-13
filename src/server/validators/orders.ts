import Decimal from 'decimal.js';
import { z } from 'zod';
import { optionalIsoDateSchema } from './ledger';

function isValidDecimal(val: string, opts?: { positive?: boolean }): boolean {
  try {
    const d = new Decimal(val);
    if (!d.isFinite()) return false;
    if (opts?.positive && !d.gt(0)) return false;
    return true;
  } catch {
    return false;
  }
}

export const createPurchaseOrderLineSchema = z.object({
  productId: z.uuid('Invalid product ID'),
  supplierItemId: z.uuid('Invalid supplier item ID').nullable().optional(),
  packCount: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Pack count must be greater than zero',
    }),
  packQuantity: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Pack quantity must be greater than zero',
    }),
  agreedPackCostCents: z
    .number()
    .int('Cost must be an integer in centavos')
    .nonnegative('Cost cannot be negative')
    .nullable()
    .optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.uuid('Invalid supplier ID'),
  orderDate: z.iso.date('Order date must be a valid YYYY-MM-DD string'),
  expectedDeliveryDate: optionalIsoDateSchema,
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
  lines: z
    .array(createPurchaseOrderLineSchema)
    .min(1, 'At least one line item is required')
    .max(100, 'Cannot exceed 100 lines per purchase order'),
});

export const cancelPurchaseOrderSchema = z.object({
  purchaseOrderId: z.uuid('Invalid purchase order ID'),
  reason: z.string().trim().max(500, 'Cancellation reason cannot exceed 500 characters').optional(),
});

export type CreatePurchaseOrderInput = z.input<typeof createPurchaseOrderSchema>;
export type CreatePurchaseOrderParsed = z.infer<typeof createPurchaseOrderSchema>;
export type CreatePurchaseOrderLineInput = z.input<typeof createPurchaseOrderLineSchema>;
export type CancelPurchaseOrderInput = z.input<typeof cancelPurchaseOrderSchema>;

