import { pgTable, uuid, text, timestamp, date, numeric, unique, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { expirySourceEnum } from './enums';
import { products } from './products';
import { suppliers } from './suppliers';

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    lotCode: text('lot_code'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    expiryDate: date('expiry_date', { mode: 'string' }),
    expirySource: expirySourceEnum('expiry_source'),
    unitCost: numeric('unit_cost', { precision: 14, scale: 6, mode: 'string' }),
    initialQuantity: numeric('initial_quantity', { precision: 14, scale: 3, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('batches_id_product_id_uq').on(table.id, table.productId),
    check('batches_expiry_nullability_match', sql`(${table.expiryDate} is null) = (${table.expirySource} is null)`),
    check('batches_unit_cost_non_negative', sql`${table.unitCost} is null or ${table.unitCost} >= 0`),
    check('batches_initial_quantity_positive', sql`${table.initialQuantity} > 0`),
    index('batches_fefo_idx').on(table.productId, table.expiryDate, table.receivedAt, table.id),
  ],
);

