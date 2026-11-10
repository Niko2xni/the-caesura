import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { client, db } from '@/db';
import { user } from '@/db/schema';
import { auth } from './index';
import { checkGuestSignInRateLimit, hashClientIp } from '../rate-limit';

const testRunId = crypto.randomUUID().slice(0, 8);
const adminEmail = `admin-${testRunId}@thecaesura.local`;

describe('Authentication, role guards, and rate limits', () => {
  beforeAll(() => {
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.DEMO_MODE = 'true';
  });

  afterAll(async () => {
    await client.end();
  });

  it('assigns admin role to anonymous guest users in database hook', async () => {
    const guestUser = await auth.api.signInAnonymous();
    expect(guestUser).toBeDefined();

    const [dbUser] = await db
      .select({ role: user.role, isAnonymous: user.isAnonymous, name: user.name })
      .from(user)
      .where(eq(user.id, guestUser.user.id));

    expect(dbUser?.isAnonymous).toBe(true);
    expect(dbUser?.role).toBe('admin');
    expect(dbUser?.name).toMatch(/^Guest [2-9A-HJ-NP-Z]{4}$/);
  });

  it('assigns admin role to owner account matching ADMIN_EMAIL', async () => {
    const owner = await auth.api.signUpEmail({
      body: {
        name: 'Owner Maya',
        email: adminEmail,
        password: 'secure-owner-password-1234',
      },
    });

    const [dbUser] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, owner.user.id));

    expect(dbUser?.role).toBe('admin');
  });

  it('assigns staff role to standard accounts and ignores client-provided role', async () => {
    const staffEmail = `barista-${testRunId}@thecaesura.local`;

    // Attempt to pass role: 'admin' in input
    const barista = await auth.api.signUpEmail({
      body: {
        name: 'Barista Sam',
        email: staffEmail,
        password: 'secure-staff-password-1234',
        // @ts-expect-error - testing client injection
        role: 'admin',
      },
    });

    const [dbUser] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, barista.user.id));

    expect(dbUser?.role).toBe('staff');
  });

  it('rate limits guest sign-in attempts by IP hash', () => {
    const rawIp = `192.168.1.${Math.floor(Math.random() * 200 + 1)}`;
    const ipHash = hashClientIp(rawIp);

    // Default limit in rate-limit.ts is 10
    for (let i = 0; i < 10; i++) {
      const res = checkGuestSignInRateLimit(ipHash, 10, 60000);
      expect(res.allowed).toBe(true);
    }

    const blocked = checkGuestSignInRateLimit(ipHash, 10, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});

