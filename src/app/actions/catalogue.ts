'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AuthError, requireRole } from '@/server/auth/guards';
import {
  archiveProduct,
  createCategory,
  createProduct,
  updateProduct,
} from '@/server/catalogue/products';
import {
  archiveSupplier,
  createSupplier,
  createSupplierItem,
  updateSupplier,
  updateSupplierItem,
} from '@/server/catalogue/suppliers';
import {
  createCategorySchema,
  createProductSchema,
  createSupplierItemSchema,
  createSupplierSchema,
  updateCategorySchema,
  updateProductSchema,
  updateSupplierItemSchema,
  updateSupplierSchema,
} from '@/server/validators/catalogue';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join('; ');
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = createCategorySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await createCategory(parsed.data);
    if (res.ok) {
      revalidatePath('/catalogue');
      revalidatePath('/today');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await createProduct(parsed.data);
    if (res.ok) {
      revalidatePath('/catalogue');
      revalidatePath('/today');
      revalidatePath('/receive');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function updateProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = updateProductSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await updateProduct(parsed.data);
    if (res.ok) {
      revalidatePath('/catalogue');
      revalidatePath(`/products/${parsed.data.id}`);
      revalidatePath('/today');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function archiveProductAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsedId = z.uuid('Invalid product ID').safeParse(id);
    if (!parsedId.success) {
      return { ok: false, code: 'validation_error', error: 'Invalid product ID' };
    }

    const res = await archiveProduct(parsedId.data);
    if (res.ok) {
      revalidatePath('/catalogue');
      revalidatePath(`/products/${parsedId.data}`);
      revalidatePath('/today');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function createSupplierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = createSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await createSupplier(parsed.data);
    if (res.ok) {
      revalidatePath('/suppliers');
      revalidatePath('/receive');
      revalidatePath('/catalogue');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function updateSupplierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = updateSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await updateSupplier(parsed.data);
    if (res.ok) {
      revalidatePath('/suppliers');
      revalidatePath('/receive');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function archiveSupplierAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsedId = z.uuid('Invalid supplier ID').safeParse(id);
    if (!parsedId.success) {
      return { ok: false, code: 'validation_error', error: 'Invalid supplier ID' };
    }

    const res = await archiveSupplier(parsedId.data);
    if (res.ok) {
      revalidatePath('/suppliers');
      revalidatePath('/receive');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function createSupplierItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = createSupplierItemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await createSupplierItem(parsed.data);
    if (res.ok) {
      revalidatePath('/suppliers');
      revalidatePath('/receive');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}

export async function updateSupplierItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole(['admin']);

    const parsed = updateSupplierItemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'validation_error', error: formatZodError(parsed.error) };
    }

    const res = await updateSupplierItem(parsed.data);
    if (res.ok) {
      revalidatePath('/suppliers');
      revalidatePath('/receive');
    }
    return res;
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: 'server_error', error: 'An unexpected error occurred.' };
  }
}
