import { pgTable, uuid, text, integer, boolean, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull().unique(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    leadTimeDays: integer('lead_time_days').notNull().default(2),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('suppliers_lead_time_non_negative', sql`${table.leadTimeDays} >= 0`),
  ],
);

