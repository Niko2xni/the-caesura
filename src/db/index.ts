import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/caesura';

// Disable prefetch/prepare for transaction pooler compatibility (Neon / PgBouncer)
export const client = postgres(connectionString, {
  prepare: false,
});

export const db = drizzle(client, { schema });

