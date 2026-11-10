import { pgEnum } from 'drizzle-orm/pg-core';

export const unitEnum = pgEnum('unit', ['each', 'g', 'ml']);
export const movementTypeEnum = pgEnum('movement_type', ['receipt', 'usage', 'waste', 'adjustment']);
export const wasteReasonEnum = pgEnum('waste_reason', ['expired', 'spoiled', 'damaged', 'other']);
export const expirySourceEnum = pgEnum('expiry_source', ['printed', 'estimated', 'manual']);
export const receiptSourceEnum = pgEnum('receipt_source', ['manual', 'ai_extraction']);
export const matchMethodEnum = pgEnum('match_method', ['exact', 'suggested', 'manual', 'new_item']);
export const extractionStatusEnum = pgEnum('extraction_status', ['succeeded', 'failed_model', 'failed_validation']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'staff']);

