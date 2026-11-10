import Decimal from 'decimal.js';
import { z } from 'zod';

function isValidDecimal(val: string, opts?: { min?: number; positive?: boolean; nonZero?: boolean }): boolean {
  try {
    const d = new Decimal(val);
    if (!d.isFinite()) return false;
    if (opts?.positive && !d.gt(0)) return false;
    if (opts?.nonZero && d.isZero()) return false;
    if (opts?.min !== undefined && d.lt(opts.min)) return false;
    return true;
  } catch {
    return false;
  }
}

export const optionalIsoDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => (val === '' || val === undefined ? null : val))
  .pipe(z.iso.date().nullable());

export const receiveLineSchema = z.object({
  productId: z.uuid('Invalid product ID'),
  supplierItemId: z.uuid('Invalid supplier item ID').nullable().optional(),
  descriptionPrinted: z.string().trim().max(200).nullable().optional(),
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
  lineCostCents: z.coerce.number().int().min(0, 'Cost must be non-negative').nullable().optional(),
  expiryDate: optionalIsoDateSchema,
  expirySource: z.enum(['printed', 'estimated', 'manual']).nullable().optional(),
  lotCode: z.string().trim().max(100).nullable().optional(),
  matchMethod: z.enum(['exact', 'suggested', 'manual', 'new_item']).default('manual'),
});

export const receiveDeliverySchema = z.object({
  supplierId: z.uuid('Invalid supplier ID'),
  deliveryDate: z.iso.date('Delivery date must be YYYY-MM-DD'),
  reference: z.string().trim().max(100).nullable().optional(),
  source: z.enum(['manual', 'ai_extraction']).default('manual'),
  extractionId: z.uuid('Invalid extraction ID').nullable().optional(),
  idempotencyKey: z.uuid('Idempotency key must be a valid UUID'),
  lines: z.array(receiveLineSchema).min(1, 'Delivery must contain at least one line item'),
});

export const recordUsageSchema = z.object({
  productId: z.uuid('Invalid product ID'),
  quantity: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Usage quantity must be greater than zero',
    }),
  note: z.string().trim().max(500).nullable().optional(),
});

export const recordWasteSchema = z.object({
  batchId: z.uuid('Invalid batch ID'),
  quantity: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Waste quantity must be greater than zero',
    }),
  wasteReason: z.enum(['expired', 'spoiled', 'damaged', 'other'], {
    message: 'Waste reason must be expired, spoiled, damaged, or other',
  }),
  note: z.string().trim().max(500).nullable().optional(),
});

export const recordAdjustmentSchema = z.object({
  batchId: z.uuid('Invalid batch ID'),
  quantityDelta: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { nonZero: true }), {
      message: 'Adjustment quantity delta must be a non-zero number',
    }),
  note: z.string().trim().min(1, 'Adjustment note is required').max(500),
});

export type ReceiveLineParsed = z.infer<typeof receiveLineSchema>;
export type ReceiveDeliveryParsed = z.infer<typeof receiveDeliverySchema>;
export type RecordUsageParsed = z.infer<typeof recordUsageSchema>;
export type RecordWasteParsed = z.infer<typeof recordWasteSchema>;
export type RecordAdjustmentParsed = z.infer<typeof recordAdjustmentSchema>;
