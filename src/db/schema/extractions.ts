import { pgTable, uuid, text, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { extractionStatusEnum } from './enums';
import { user } from './auth';

export const documentExtractions = pgTable(
  'document_extractions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    reasoning: text('reasoning'),
    status: extractionStatusEnum('status').notNull(),
    rawOutput: jsonb('raw_output'),
    parsedOutput: jsonb('parsed_output'),
    errorMessage: text('error_message'),
    clientIpHash: text('client_ip_hash'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('document_extractions_created_by_created_at_idx').on(table.createdBy, table.createdAt),
    index('document_extractions_client_ip_hash_created_at_idx').on(table.clientIpHash, table.createdAt),
    index('document_extractions_created_at_idx').on(table.createdAt),
  ],
);

