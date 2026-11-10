import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db';

const isDemoMode = process.env.DEMO_MODE === 'true';

function generateGuestName(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Guest ${suffix}`;
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-minimum-32-characters-placeholder-1234',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'staff',
        input: false, // Disallow client-provided role
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
          const userEmail = userData.email?.trim().toLowerCase();

          let assignedRole: 'admin' | 'staff' = 'staff';
          if (userData.isAnonymous) {
            assignedRole = 'admin';
          } else if (adminEmail && userEmail === adminEmail) {
            assignedRole = 'admin';
          }

          return {
            data: {
              ...userData,
              role: assignedRole,
            },
          };
        },
      },
    },
  },
  plugins: [
    nextCookies(),
    ...(isDemoMode
      ? [
          anonymous({
            generateName: generateGuestName,
          }),
        ]
      : []),
  ],
});

