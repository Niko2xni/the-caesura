'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AuthError, requireRole } from '@/server/auth/guards';
import { cancelPurchaseOrder, createPurchaseOrder, type OrderOperationResult } from '@/server/orders/orders';
import { cancelPurchaseOrderSchema, createPurchaseOrderSchema } from '@/server/validators/orders';

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}

export async function createPurchaseOrderAction(
  input: unknown,
): Promise<OrderOperationResult<{ purchaseOrderId: string; poNumber: string }>> {
  try {
    const session = await requireRole(['admin', 'staff']);

    const parsed = createPurchaseOrderSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await createPurchaseOrder({
      ...parsed.data,
      userId: session.user.id,
    });

    if (res.ok) {
      revalidatePath('/orders');
      revalidatePath('/receive');
    }

    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while creating purchase order.' };
  }
}

export async function cancelPurchaseOrderAction(
  input: unknown,
): Promise<OrderOperationResult<{ purchaseOrderId: string }>> {
  try {
    const session = await requireRole(['admin']);

    const parsed = cancelPurchaseOrderSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await cancelPurchaseOrder(
      parsed.data.purchaseOrderId,
      session.user.id,
      parsed.data.reason,
    );

    if (res.ok) {
      revalidatePath('/orders');
      revalidatePath(`/orders/${parsed.data.purchaseOrderId}`);
      revalidatePath('/receive');
    }

    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred while cancelling purchase order.' };
  }
}

