import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface BusinessSettings {
  id: number;
  businessName: string;
  currency: string;
  timezone: string;
  expiryWarningDays: number;
  extractionCapPerUserDaily: number;
  extractionCapPerIpDaily: number;
  extractionCapGlobalDaily: number;
  updatedAt: Date;
}

/**
 * Retrieves the singleton system settings row (id = 1).
 * Returns safe fallback values if the database has not been seeded yet.
 */
export async function getBusinessSettings(): Promise<BusinessSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1));

  if (!row) {
    return {
      id: 1,
      businessName: 'The Caesura',
      currency: 'PHP',
      timezone: 'Asia/Manila',
      expiryWarningDays: 3,
      extractionCapPerUserDaily: 5,
      extractionCapPerIpDaily: 10,
      extractionCapGlobalDaily: 50,
      updatedAt: new Date(),
    };
  }

  return {
    id: row.id,
    businessName: row.businessName,
    currency: row.currency.trim(),
    timezone: row.timezone,
    expiryWarningDays: row.expiryWarningDays,
    extractionCapPerUserDaily: row.extractionCapPerUserDaily,
    extractionCapPerIpDaily: row.extractionCapPerIpDaily,
    extractionCapGlobalDaily: row.extractionCapGlobalDaily,
    updatedAt: row.updatedAt,
  };
}


