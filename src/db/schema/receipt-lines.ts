import { pgTable, uuid, text, numeric, integer, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { matchMethodEnum } from './enums';
import { receipts } from './receipts';
import { batches } from './batches';
import { supplierItems } from './supplier-items';

export const receiptLines = pgTable(
  'receipt_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id')
      .notNull()
      .unique()
      .references(() => batches.id, { onDelete: 'restrict' }),
    supplierItemId: uuid('supplier_item_id').references(() => supplierItems.id, { onDelete: 'set null' }),
    descriptionPrinted: text('description_printed'),
    packCount: numeric('pack_count', { precision: 14, scale: 3, mode: 'string' }).notNull(),
    packQuantity: numeric('pack_quantity', { precision: 14, scale: 3, mode: 'string' }).notNull(),
    lineCostCents: integer('line_cost_cents'),
    matchMethod: matchMethodEnum('match_method').notNull(),
  },
  (table) => [
    check('receipt_lines_pack_count_positive', sql`${table.packCount} > 0`),
    check('receipt_lines_pack_quantity_positive', sql`${table.packQuantity} > 0`),
  ],
);

