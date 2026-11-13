import Decimal from 'decimal.js';
import { z } from 'zod';

function isPositiveDecimal(val: string): boolean {
  try {
    const d = new Decimal(val);
    return d.isFinite() && d.gt(0);
  } catch {
    return false;
  }
}

export const recipeIngredientInputSchema = z.object({
  productId: z.uuid('Invalid ingredient product ID'),
  quantity: z
    .string()
    .trim()
    .refine(isPositiveDecimal, { message: 'Ingredient quantity must be greater than zero' }),
});

const ingredientsListSchema = z
  .array(recipeIngredientInputSchema)
  .min(1, 'A recipe must include at least one ingredient')
  .max(50, 'Recipe cannot exceed 50 ingredients')
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
    message: 'Duplicate ingredient products are not allowed in the same recipe',
  });

export const createMenuItemSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(60, 'SKU cannot exceed 60 characters'),
  name: z.string().trim().min(1, 'Menu item name is required').max(120, 'Name cannot exceed 120 characters'),
  posItemName: z.string().trim().max(120, 'POS alias cannot exceed 120 characters').nullable().optional(),
  category: z.string().trim().min(1).max(60).default('Beverages'),
  priceCents: z
    .number()
    .int('Price must be an integer in centavos')
    .nonnegative('Price cannot be negative')
    .nullable()
    .optional(),
  ingredients: ingredientsListSchema,
});

export const updateMenuItemSchema = createMenuItemSchema.extend({
  id: z.uuid('Invalid menu item ID'),
});

export const salesImportLineSchema = z
  .object({
    menuItemId: z.uuid('Invalid menu item ID').optional(),
    sku: z.string().trim().max(60).optional(),
    itemName: z.string().trim().max(120).optional(),
    quantitySold: z.coerce
      .number()
      .int('Quantity sold must be a whole integer')
      .positive('Quantity sold must be greater than zero'),
  })
  .refine((line) => Boolean(line.menuItemId || line.sku || line.itemName), {
    message: 'Each sales line must specify menuItemId, sku, or itemName',
  });

export const importSalesSchema = z.object({
  externalBatchId: z
    .string()
    .trim()
    .min(1, 'Batch idempotency key is required')
    .max(200, 'Batch idempotency key cannot exceed 200 characters'),
  source: z.enum(['csv', 'webhook', 'manual']).default('csv'),
  salesDate: z.iso.date('Sales date must be YYYY-MM-DD'),
  fileName: z.string().trim().max(200).nullable().optional(),
  lines: z
    .array(salesImportLineSchema)
    .min(1, 'Sales import must contain at least one sold item')
    .max(500, 'Cannot exceed 500 lines per sales import'),
});

export type CreateMenuItemInput = z.input<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.input<typeof updateMenuItemSchema>;
export type SalesImportLineInput = z.input<typeof salesImportLineSchema>;
export type ImportSalesInput = z.input<typeof importSalesSchema>;

