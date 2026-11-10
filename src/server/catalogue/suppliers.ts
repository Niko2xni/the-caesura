import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products, supplierItems, suppliers } from '@/db/schema';
import { normalizeText } from '@/lib/normalise';
import {
  createSupplierItemSchema,
  createSupplierSchema,
  updateSupplierItemSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type CreateSupplierItemInput,
  type UpdateSupplierInput,
  type UpdateSupplierItemInput,
} from '@/server/validators/catalogue';
import type { MutationResult } from './products';

export interface SupplierItemWithDetails {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  productSku: string;
  productBaseUnit: 'each' | 'g' | 'ml';
  supplierSku: string | null;
  description: string;
  descriptionNormalized: string;
  packLabel: string;
  packQuantity: string;
  lastPackCostCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listSuppliers(options?: {
  activeOnly?: boolean;
  search?: string;
}) {
  const activeOnly = options?.activeOnly ?? true;

  let query = db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactName: suppliers.contactName,
      email: suppliers.email,
      phone: suppliers.phone,
      leadTimeDays: suppliers.leadTimeDays,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
    })
    .from(suppliers)
    .$dynamic();

  const conditions = [];

  if (activeOnly) {
    conditions.push(eq(suppliers.isActive, true));
  }

  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(${suppliers.name} ILIKE ${term} OR ${suppliers.contactName} ILIKE ${term})`,
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(asc(suppliers.name));
}

export async function getSupplierById(id: string) {
  const [row] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactName: suppliers.contactName,
      email: suppliers.email,
      phone: suppliers.phone,
      leadTimeDays: suppliers.leadTimeDays,
      notes: suppliers.notes,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
    })
    .from(suppliers)
    .where(eq(suppliers.id, id));

  return row ?? null;
}

export async function createSupplier(input: CreateSupplierInput): Promise<MutationResult<{ id: string }>> {
  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const [created] = await db
      .insert(suppliers)
      .values({
        name: parsed.data.name.trim(),
        contactName: parsed.data.contactName?.trim() || null,
        email: parsed.data.email?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        leadTimeDays: parsed.data.leadTimeDays,
        notes: parsed.data.notes?.trim() || null,
      })
      .returning({ id: suppliers.id });

    return { ok: true, data: { id: created.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_supplier',
        error: `A supplier named "${parsed.data.name}" already exists.`,
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to create supplier.',
    };
  }
}

export async function updateSupplier(input: UpdateSupplierInput): Promise<MutationResult<{ id: string }>> {
  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.data.name !== undefined) updateValues.name = parsed.data.name.trim();
    if (parsed.data.contactName !== undefined) updateValues.contactName = parsed.data.contactName?.trim() || null;
    if (parsed.data.email !== undefined) updateValues.email = parsed.data.email?.trim() || null;
    if (parsed.data.phone !== undefined) updateValues.phone = parsed.data.phone?.trim() || null;
    if (parsed.data.leadTimeDays !== undefined) updateValues.leadTimeDays = parsed.data.leadTimeDays;
    if (parsed.data.notes !== undefined) updateValues.notes = parsed.data.notes?.trim() || null;
    if (parsed.data.isActive !== undefined) updateValues.isActive = parsed.data.isActive;

    const [updated] = await db
      .update(suppliers)
      .set(updateValues)
      .where(eq(suppliers.id, parsed.data.id))
      .returning({ id: suppliers.id });

    if (!updated) {
      return { ok: false, code: 'not_found', error: 'Supplier not found.' };
    }

    return { ok: true, data: { id: updated.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_supplier',
        error: 'A supplier with this name already exists.',
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to update supplier.',
    };
  }
}

export async function archiveSupplier(id: string): Promise<MutationResult<{ id: string }>> {
  const [updated] = await db
    .update(suppliers)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning({ id: suppliers.id });

  if (!updated) {
    return { ok: false, code: 'not_found', error: 'Supplier not found.' };
  }

  return { ok: true, data: { id: updated.id } };
}

export async function listSupplierItems(options?: {
  supplierId?: string;
  productId?: string;
}): Promise<SupplierItemWithDetails[]> {
  let query = db
    .select({
      id: supplierItems.id,
      supplierId: supplierItems.supplierId,
      supplierName: suppliers.name,
      productId: supplierItems.productId,
      productName: products.name,
      productSku: products.sku,
      productBaseUnit: products.baseUnit,
      supplierSku: supplierItems.supplierSku,
      description: supplierItems.description,
      descriptionNormalized: supplierItems.descriptionNormalized,
      packLabel: supplierItems.packLabel,
      packQuantity: supplierItems.packQuantity,
      lastPackCostCents: supplierItems.lastPackCostCents,
      createdAt: supplierItems.createdAt,
      updatedAt: supplierItems.updatedAt,
    })
    .from(supplierItems)
    .innerJoin(suppliers, eq(supplierItems.supplierId, suppliers.id))
    .innerJoin(products, eq(supplierItems.productId, products.id))
    .$dynamic();

  const conditions = [];

  if (options?.supplierId) {
    conditions.push(eq(supplierItems.supplierId, options.supplierId));
  }

  if (options?.productId) {
    conditions.push(eq(supplierItems.productId, options.productId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(asc(supplierItems.description));
}

export async function createSupplierItem(
  input: CreateSupplierItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createSupplierItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const descNorm = normalizeText(parsed.data.description);
    const [created] = await db
      .insert(supplierItems)
      .values({
        supplierId: parsed.data.supplierId,
        productId: parsed.data.productId,
        supplierSku: parsed.data.supplierSku?.trim() || null,
        description: parsed.data.description.trim(),
        descriptionNormalized: descNorm,
        packLabel: parsed.data.packLabel.trim(),
        packQuantity: parsed.data.packQuantity,
        lastPackCostCents: parsed.data.lastPackCostCents ?? null,
      })
      .returning({ id: supplierItems.id });

    return { ok: true, data: { id: created.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_supplier_item',
        error: 'An item with this description or SKU already exists for this supplier.',
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to map supplier item.',
    };
  }
}

export async function updateSupplierItem(
  input: UpdateSupplierItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = updateSupplierItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.data.supplierSku !== undefined) updateValues.supplierSku = parsed.data.supplierSku?.trim() || null;
    if (parsed.data.description !== undefined) {
      updateValues.description = parsed.data.description.trim();
      updateValues.descriptionNormalized = normalizeText(parsed.data.description);
    }
    if (parsed.data.packLabel !== undefined) updateValues.packLabel = parsed.data.packLabel.trim();
    if (parsed.data.packQuantity !== undefined) updateValues.packQuantity = parsed.data.packQuantity;
    if (parsed.data.lastPackCostCents !== undefined) updateValues.lastPackCostCents = parsed.data.lastPackCostCents;

    const [updated] = await db
      .update(supplierItems)
      .set(updateValues)
      .where(eq(supplierItems.id, parsed.data.id))
      .returning({ id: supplierItems.id });

    if (!updated) {
      return { ok: false, code: 'not_found', error: 'Supplier item not found.' };
    }

    return { ok: true, data: { id: updated.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_supplier_item',
        error: 'An item with this description or SKU already exists for this supplier.',
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to update supplier item.',
    };
  }
}
