import { pgTable, uuid, text, numeric, integer, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { suppliers } from './suppliers';
import { products } from './products';

export const supplierItems = pgTable(
  'supplier_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    supplierSku: text('supplier_sku'),
    description: text('description').notNull(),
    descriptionNormalized: text('description_normalized').notNull(),
    packLabel: text('pack_label').notNull(),
    packQuantity: numeric('pack_quantity', { precision: 14, scale: 3, mode: 'string' }).notNull(),
    lastPackCostCents: integer('last_pack_cost_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('supplier_items_pack_quantity_positive', sql`${table.packQuantity} > 0`),
    uniqueIndex('supplier_items_supplier_description_uq').on(table.supplierId, table.descriptionNormalized),
    uniqueIndex('supplier_items_supplier_sku_uq')
      .on(table.supplierId, table.supplierSku)
      .where(sql`${table.supplierSku} is not null`),
    index('supplier_items_description_normalized_trgm_idx').using('gin', sql`${table.descriptionNormalized} gin_trgm_ops`),
    index('supplier_items_product_id_idx').on(table.productId),
  ],
);

