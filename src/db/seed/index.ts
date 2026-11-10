import { client, db } from '@/db';
import { settings, user } from '@/db/schema';
import { auth } from '@/server/auth';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding Phase 0 baseline data…');

  // 1. Settings row (singleton id = 1)
  await db
    .insert(settings)
    .values({
      id: 1,
      businessName: 'The Caesura',
      currency: 'PHP',
      timezone: 'Asia/Manila',
      expiryWarningDays: 3,
      extractionCapPerUserDaily: 5,
      extractionCapPerIpDaily: 10,
      extractionCapGlobalDaily: 50,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        businessName: 'The Caesura',
        currency: 'PHP',
        timezone: 'Asia/Manila',
        expiryWarningDays: 3,
      },
    });

  console.log('✓ Settings initialized (Asia/Manila, PHP)');

  // 2. Owner account
  const adminEmail = (process.env.ADMIN_EMAIL || 'owner@thecaesura.local').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'caesura-dev-password-2026';

  const [existingUser] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, adminEmail));

  if (!existingUser) {
    // Creating through Better Auth API hashes password properly
    const res = await auth.api.signUpEmail({
      body: {
        name: 'Maya (Owner)',
        email: adminEmail,
        password: adminPassword,
      },
    });
    console.log(`✓ Owner account created: ${res.user.email} (role: admin)`);
  } else {
    // Ensure role is admin
    if (existingUser.role !== 'admin') {
      await db
        .update(user)
        .set({ role: 'admin' })
        .where(eq(user.id, existingUser.id));
    }
    console.log(`✓ Owner account already exists: ${existingUser.email} (role: admin)`);
  }

  console.log('Phase 0 seed completed successfully.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });

