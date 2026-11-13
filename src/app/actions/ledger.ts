'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AuthError, requireRole } from '@/server/auth/guards';
import { receiveDelivery, type ReceiveDeliveryResult } from '@/server/ledger/receive-delivery';
import { recordAdjustment, type RecordAdjustmentResult } from '@/server/ledger/record-adjustment';
import { recordUsage, type RecordUsageResult } from '@/server/ledger/record-usage';
import { recordWaste, type RecordWasteResult } from '@/server/ledger/record-waste';
import {
  receiveDeliverySchema,
  recordAdjustmentSchema,
  recordUsageSchema,
  recordWasteSchema,
} from '@/server/validators/ledger';

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}

export async function receiveDeliveryAction(input: unknown): Promise<ReceiveDeliveryResult> {
  try {
    const session = await requireRole(['admin', 'staff']);

    const parsed = receiveDeliverySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const result = await receiveDelivery({
      ...parsed.data,
      userId: session.user.id,
    });

    if (result.ok) {
      revalidatePath('/today');
      revalidatePath('/receive');
      revalidatePath('/catalogue');
      if (parsed.data.purchaseOrderId) {
        revalidatePath('/orders');
        revalidatePath(`/orders/${parsed.data.purchaseOrderId}`);
      }
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while receiving delivery.' };
  }
}

export async function recordUsageAction(input: unknown): Promise<RecordUsageResult> {
  try {
    const session = await requireRole(['admin', 'staff']);

    const parsed = recordUsageSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const result = await recordUsage({
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
      userId: session.user.id,
    });

    if (result.ok) {
      revalidatePath('/today');
      revalidatePath('/use');
      revalidatePath(`/products/${parsed.data.productId}`);
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while recording usage.' };
  }
}

export async function recordWasteAction(input: unknown): Promise<RecordWasteResult> {
  try {
    const session = await requireRole(['admin', 'staff']);

    const parsed = recordWasteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const result = await recordWaste({
      batchId: parsed.data.batchId,
      quantity: parsed.data.quantity,
      wasteReason: parsed.data.wasteReason,
      note: parsed.data.note,
      userId: session.user.id,
    });

    if (result.ok) {
      revalidatePath('/today');
      revalidatePath('/waste');
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while recording waste.' };
  }
}

export async function recordAdjustmentAction(input: unknown): Promise<RecordAdjustmentResult> {
  try {
    const session = await requireRole(['admin']);

    const parsed = recordAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const result = await recordAdjustment({
      batchId: parsed.data.batchId,
      quantityDelta: parsed.data.quantityDelta,
      note: parsed.data.note,
      userId: session.user.id,
    });

    if (result.ok) {
      revalidatePath('/today');
      revalidatePath('/catalogue');
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while recording adjustment.' };
  }
}

