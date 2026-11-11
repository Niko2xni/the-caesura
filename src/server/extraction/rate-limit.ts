import crypto from 'node:crypto';
import { db } from '@/db';
import { documentExtractions, settings } from '@/db/schema';
import { getBusinessToday } from '@/lib/dates';
import { eq, sql } from 'drizzle-orm';

const DEFAULT_SALT = 'the-caesura-salt-ip-2026';

/**
 * Computes a salted SHA-256 hash of the client IP address.
 * Strictly adheres to docs/rules.md §5: raw IPs are never stored in the database.
 */
export function hashClientIp(clientIp: string): string {
  const salt = process.env.IP_SALT || DEFAULT_SALT;
  const normalizedIp = (clientIp || '127.0.0.1').trim().toLowerCase();
  return crypto.createHash('sha256').update(`${salt}:${normalizedIp}`).digest('hex');
}

export interface RateLimitCheckResult {
  allowed: boolean;
  ipHash: string;
  reason?: string;
  caps?: {
    userCap: number;
    ipCap: number;
    globalCap: number;
    userCount: number;
    ipCount: number;
    globalCount: number;
  };
}

/**
 * Enforces per-user, per-IP, and global daily extraction limits before calling the vision model.
 * Time boundary is calendar day in Asia/Manila (business_today()).
 */
export async function checkExtractionRateLimits(
  userId: string,
  clientIp: string,
): Promise<RateLimitCheckResult> {
  const ipHash = hashClientIp(clientIp);
  const today = getBusinessToday();

  // 1. Fetch current settings caps
  const [settingRow] = await db
    .select({
      userCap: settings.extractionCapPerUserDaily,
      ipCap: settings.extractionCapPerIpDaily,
      globalCap: settings.extractionCapGlobalDaily,
    })
    .from(settings)
    .where(eq(settings.id, 1));

  const userCap = settingRow?.userCap ?? 5;
  const ipCap = settingRow?.ipCap ?? 10;
  const globalCap = settingRow?.globalCap ?? 50;

  // 2. Count extractions performed today
  const [userUsage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentExtractions)
    .where(
      sql`${documentExtractions.createdBy} = ${userId}
        AND (${documentExtractions.createdAt} AT TIME ZONE 'Asia/Manila')::date = ${today}::date`,
    );

  const [ipUsage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentExtractions)
    .where(
      sql`${documentExtractions.clientIpHash} = ${ipHash}
        AND (${documentExtractions.createdAt} AT TIME ZONE 'Asia/Manila')::date = ${today}::date`,
    );

  const [globalUsage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentExtractions)
    .where(
      sql`(${documentExtractions.createdAt} AT TIME ZONE 'Asia/Manila')::date = ${today}::date`,
    );

  const userCount = userUsage?.count ?? 0;
  const ipCount = ipUsage?.count ?? 0;
  const globalCount = globalUsage?.count ?? 0;

  const caps = {
    userCap,
    ipCap,
    globalCap,
    userCount,
    ipCount,
    globalCount,
  };

  if (userCount >= userCap) {
    return {
      allowed: false,
      ipHash,
      reason: `You have reached your daily extraction quota (${userCap} receipts/day). Please enter this delivery manually.`,
      caps,
    };
  }

  if (ipCount >= ipCap) {
    return {
      allowed: false,
      ipHash,
      reason: `This network/IP address has reached its daily extraction quota (${ipCap} receipts/day). Please enter this delivery manually.`,
      caps,
    };
  }

  if (globalCount >= globalCap) {
    return {
      allowed: false,
      ipHash,
      reason: `The system daily extraction ceiling has been reached (${globalCap} receipts/day). Please enter this delivery manually.`,
      caps,
    };
  }

  return {
    allowed: true,
    ipHash,
    caps,
  };
}


