import Decimal from 'decimal.js';
import { z } from 'zod';

function isValidDecimal(val: string, opts?: { min?: number; positive?: boolean }): boolean {
  try {
    const d = new Decimal(val);
    if (!d.isFinite()) return false;
    if (opts?.positive && !d.gt(0)) return false;
    if (opts?.min !== undefined && d.lt(opts.min)) return false;
    return true;
  } catch {
    return false;
  }
}

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  id: z.uuid('Invalid category ID'),
  name: z.string().trim().min(1, 'Category name is required').max(100).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1, 'SKU is required').max(50),
    name: z.string().trim().min(1, 'Product name is required').max(200),
    categoryId: z.uuid('Invalid category ID').nullable().optional(),
    baseUnit: z.enum(['each', 'g', 'ml'], {
      message: 'Base unit must be each, g, or ml',
    }),
    tracksExpiry: z.boolean().default(false),
    shelfLifeDays: z.coerce.number().int().positive('Shelf life days must be greater than zero').nullable().optional(),
    reorderPoint: z
      .string()
      .trim()
      .default('0')
      .refine((val) => isValidDecimal(val, { min: 0 }), {
        message: 'Reorder point must be a non-negative number',
      }),
  })
  .refine(
    (data) => {
      if (data.shelfLifeDays != null && !data.tracksExpiry) {
        return false;
      }
      return true;
    },
    {
      message: 'Shelf life days requires expiry tracking to be enabled',
      path: ['shelfLifeDays'],
    },
  );

export const updateProductSchema = z
  .object({
    id: z.uuid('Invalid product ID'),
    sku: z.string().trim().min(1, 'SKU is required').max(50).optional(),
    name: z.string().trim().min(1, 'Product name is required').max(200).optional(),
    categoryId: z.uuid('Invalid category ID').nullable().optional(),
    baseUnit: z.enum(['each', 'g', 'ml']).optional(),
    tracksExpiry: z.boolean().optional(),
    shelfLifeDays: z.coerce.number().int().positive('Shelf life days must be greater than zero').nullable().optional(),
    reorderPoint: z
      .string()
      .trim()
      .refine((val) => isValidDecimal(val, { min: 0 }), {
        message: 'Reorder point must be a non-negative number',
      })
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If shelfLifeDays is provided and tracksExpiry is explicitly false, reject
      if (data.shelfLifeDays != null && data.tracksExpiry === false) {
        return false;
      }
      return true;
    },
    {
      message: 'Shelf life days requires expiry tracking to be enabled',
      path: ['shelfLifeDays'],
    },
  );

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(200),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0, 'Lead time must be non-negative').default(2),
  notes: z.string().trim().nullable().optional(),
});

export const updateSupplierSchema = z.object({
  id: z.uuid('Invalid supplier ID'),
  name: z.string().trim().min(1, 'Supplier name is required').max(200).optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0, 'Lead time must be non-negative').optional(),
  notes: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createSupplierItemSchema = z.object({
  supplierId: z.uuid('Invalid supplier ID'),
  productId: z.uuid('Invalid product ID'),
  supplierSku: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().min(1, 'Description is required').max(200),
  packLabel: z.string().trim().min(1, 'Pack label is required').max(100),
  packQuantity: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Pack quantity must be a positive number',
    }),
  lastPackCostCents: z.coerce.number().int().min(0, 'Cost must be non-negative').nullable().optional(),
});

export const updateSupplierItemSchema = z.object({
  id: z.uuid('Invalid supplier item ID'),
  supplierSku: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().min(1, 'Description is required').max(200).optional(),
  packLabel: z.string().trim().min(1, 'Pack label is required').max(100).optional(),
  packQuantity: z
    .string()
    .trim()
    .refine((val) => isValidDecimal(val, { positive: true }), {
      message: 'Pack quantity must be a positive number',
    })
    .optional(),
  lastPackCostCents: z.coerce.number().int().min(0, 'Cost must be non-negative').nullable().optional(),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type CreateSupplierInput = z.input<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
export type CreateSupplierItemInput = z.input<typeof createSupplierItemSchema>;
export type UpdateSupplierItemInput = z.input<typeof updateSupplierItemSchema>;

export type CreateCategoryOutput = z.output<typeof createCategorySchema>;
export type UpdateCategoryOutput = z.output<typeof updateCategorySchema>;
export type CreateProductOutput = z.output<typeof createProductSchema>;
export type UpdateProductOutput = z.output<typeof updateProductSchema>;
export type CreateSupplierOutput = z.output<typeof createSupplierSchema>;
export type UpdateSupplierOutput = z.output<typeof updateSupplierSchema>;
export type CreateSupplierItemOutput = z.output<typeof createSupplierItemSchema>;
export type UpdateSupplierItemOutput = z.output<typeof updateSupplierItemSchema>;
