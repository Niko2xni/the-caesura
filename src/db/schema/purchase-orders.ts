import { pgTable, uuid, text, date, timestamp, numeric, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchaseOrderStatusEnum } from './enums';
import { suppliers } from './suppliers';
import { products } from './products';
import { supplierItems } from './supplier-items';
import { user } from './auth';

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  poNumber: text('po_number').notNull().unique(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  orderDate: date('order_date', { mode: 'string' }).notNull(),
  expectedDeliveryDate: date('expected_delivery_date', { mode: 'string' }),
  status: purchaseOrderStatusEnum('status').notNull().default('submitted'),
  notes: text('notes'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  supplierItemId: uuid('supplier_item_id')
    .references(() => supplierItems.id, { onDelete: 'set null' }),
  packCount: numeric('pack_count', { precision: 12, scale: 3 }).notNull(),
  packQuantity: numeric('pack_quantity', { precision: 12, scale: 3 }).notNull(),
  agreedPackCostCents: integer('agreed_pack_cost_cents'),
  receivedPackCount: numeric('received_pack_count', { precision: 12, scale: 3 })
    .notNull()
    .default('0.000'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

