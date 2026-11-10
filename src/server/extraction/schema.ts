import { z } from 'zod';

/**
 * Zod 4 schema for an individual line item transcribed verbatim from a delivery receipt.
 * The model transcribes only what is printed; code converts units and computes centavos.
 */
export const ExtractedLineSchema = z.object({
  description: z
    .string()
    .describe('Verbatim item description as printed on the receipt, invoice, or delivery note'),
  supplierSku: z
    .string()
    .nullable()
    .describe('Supplier product/item code or SKU if explicitly printed on the document, otherwise null'),
  packCount: z
    .number()
    .positive()
    .describe('Number of delivered packs, cartons, or units. Must be a positive number'),
  packLabel: z
    .string()
    .nullable()
    .describe('Packaging unit description if printed (e.g., "case of 6", "1kg bag", "sleeve"), otherwise null'),
  unitPrice: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Unit price per pack in major currency units as printed (e.g., 95.50), otherwise null'),
  lineTotal: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Total amount for the line item in major currency units as printed, otherwise null'),
  expiryDate: z.iso
    .date()
    .nullable()
    .describe('Printed expiration date in YYYY-MM-DD ISO format if clearly visible, otherwise null'),
  lotCode: z
    .string()
    .nullable()
    .describe('Batch number or lot code if printed on the document, otherwise null'),
});

/**
 * Zod 4 schema for a transcribed Philippine Delivery Receipt (DR) or Sales Invoice (SI).
 * Constrained by AI SDK 7 Output.object({ schema: ExtractedDocumentSchema }).
 */
export const ExtractedDocumentSchema = z.object({
  supplierName: z
    .string()
    .nullable()
    .describe('Company or supplier trade name printed in the document header, otherwise null'),
  documentNumber: z
    .string()
    .nullable()
    .describe('Delivery receipt #, Sales invoice (SI) #, or reference number, otherwise null'),
  deliveryDate: z.iso
    .date()
    .nullable()
    .describe('Delivery date or invoice issue date formatted strictly as YYYY-MM-DD, otherwise null'),
  currency: z
    .string()
    .length(3)
    .nullable()
    .describe('Three-letter currency code (e.g., "PHP") if indicated, otherwise null'),
  subtotal: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Subtotal amount before VAT/taxes in major currency units if printed, otherwise null'),
  vatAmount: z
    .number()
    .nonnegative()
    .nullable()
    .describe('VAT or tax amount in major currency units if printed, otherwise null'),
  total: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Final total amount due in major currency units as printed on the document, otherwise null'),
  lines: z
    .array(ExtractedLineSchema)
    .min(1)
    .max(100)
    .describe('Delivered line items transcribed verbatim (at least 1 item, at most 100)'),
});

export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;


