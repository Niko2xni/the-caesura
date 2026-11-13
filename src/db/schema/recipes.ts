import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { salesImportSourceEnum } from './enums';
import { products } from './products';
import { user } from './auth';

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    posItemName: text('pos_item_name'),
    category: text('category').notNull().default('Beverages'),
    priceCents: integer('price_cents'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('menu_items_price_non_negative', sql`${table.priceCents} is null or ${table.priceCents} >= 0`),
    index('menu_items_is_active_idx').on(table.isActive),
    index('menu_items_name_normalized_idx').on(table.nameNormalized),
  ],
);

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('recipe_ingredients_menu_product_uidx').on(table.menuItemId, table.productId),
    check('recipe_ingredients_quantity_positive', sql`${table.quantity} > 0`),
    index('recipe_ingredients_menu_item_idx').on(table.menuItemId),
  ],
);

export const salesImports = pgTable(
  'sales_imports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    externalBatchId: text('external_batch_id').notNull().unique(),
    source: salesImportSourceEnum('source').notNull(),
    salesDate: date('sales_date', { mode: 'string' }).notNull(),
    fileName: text('file_name'),
    movementGroupId: uuid('movement_group_id').notNull(),
    totalItemsSold: integer('total_items_sold').notNull(),
    importedBy: text('imported_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('sales_imports_total_items_positive', sql`${table.totalItemsSold} > 0`),
    index('sales_imports_sales_date_idx').on(table.salesDate),
  ],
);

export const salesImportLines = pgTable(
  'sales_import_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    salesImportId: uuid('sales_import_id')
      .notNull()
      .references(() => salesImports.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'restrict' }),
    menuItemNameSnapshot: text('menu_item_name_snapshot').notNull(),
    quantitySold: integer('quantity_sold').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('sales_import_lines_qty_positive', sql`${table.quantitySold} > 0`),
    index('sales_import_lines_import_id_idx').on(table.salesImportId),
  ],
);

