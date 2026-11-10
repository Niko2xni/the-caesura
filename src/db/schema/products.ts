import { pgTable, uuid, text, boolean, integer, numeric, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { unitEnum } from './enums';
import { categories } from './categories';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    baseUnit: unitEnum('base_unit').notNull(),
    tracksExpiry: boolean('tracks_expiry').notNull().default(false),
    shelfLifeDays: integer('shelf_life_days'),
    reorderPoint: numeric('reorder_point', { precision: 14, scale: 3, mode: 'string' }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('products_shelf_life_positive', sql`${table.shelfLifeDays} is null or ${table.shelfLifeDays} > 0`),
    check('products_shelf_life_requires_tracks_expiry', sql`${table.shelfLifeDays} is null or ${table.tracksExpiry}`),
    check('products_reorder_point_non_negative', sql`${table.reorderPoint} >= 0`),
    index('products_is_active_idx').on(table.isActive),
    index('products_name_normalized_trgm_idx').using('gin', sql`${table.nameNormalized} gin_trgm_ops`),
  ],
);

