import { pgTable, uuid, text, date, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { receiptSourceEnum } from './enums';
import { suppliers } from './suppliers';
import { documentExtractions } from './extractions';
import { purchaseOrders } from './purchase-orders';
import { user } from './auth';

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
  deliveryDate: date('delivery_date', { mode: 'string' }).notNull(),
  reference: text('reference'),
  source: receiptSourceEnum('source').notNull(),
  extractionId: uuid('extraction_id').references(() => documentExtractions.id, { onDelete: 'set null' }),
  idempotencyKey: uuid('idempotency_key').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

