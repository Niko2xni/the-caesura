import { pgTable, bigint, uuid, numeric, text, timestamp, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { movementTypeEnum, wasteReasonEnum } from './enums';
import { batches } from './batches';
import { user } from './auth';

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    movementGroupId: uuid('movement_group_id').notNull().default(sql`gen_random_uuid()`),
    batchId: uuid('batch_id').notNull(),
    productId: uuid('product_id').notNull(),
    type: movementTypeEnum('type').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 3, mode: 'string' }).notNull(),
    wasteReason: wasteReasonEnum('waste_reason'),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.batchId, table.productId],
      foreignColumns: [batches.id, batches.productId],
    }),
    check('stock_movements_quantity_non_zero', sql`${table.quantity} <> 0`),
    check('stock_movements_receipt_positive', sql`${table.type} <> 'receipt' or ${table.quantity} > 0`),
    check('stock_movements_usage_waste_negative', sql`${table.type} not in ('usage', 'waste') or ${table.quantity} < 0`),
    check('stock_movements_waste_reason_match', sql`(${table.type} = 'waste') = (${table.wasteReason} is not null)`),
    index('stock_movements_batch_id_idx').on(table.batchId),
    index('stock_movements_product_occurred_at_idx').on(table.productId, table.occurredAt.desc()),
    index('stock_movements_group_id_idx').on(table.movementGroupId),
  ],
);

