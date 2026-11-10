import { pgTable, smallint, text, char, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const settings = pgTable(
  'settings',
  {
    id: smallint('id').primaryKey(),
    businessName: text('business_name').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    timezone: text('timezone').notNull(),
    expiryWarningDays: integer('expiry_warning_days').notNull().default(3),
    extractionCapPerUserDaily: integer('extraction_cap_per_user_daily').notNull().default(5),
    extractionCapPerIpDaily: integer('extraction_cap_per_ip_daily').notNull().default(10),
    extractionCapGlobalDaily: integer('extraction_cap_global_daily').notNull().default(50),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('settings_id_check', sql`${table.id} = 1`),
    check('settings_expiry_warning_days_check', sql`${table.expiryWarningDays} >= 0`),
  ],
);

