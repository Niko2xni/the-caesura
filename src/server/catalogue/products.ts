import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { categories, products } from '@/db/schema';
import { normalizeText } from '@/lib/normalise';
import {
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
  type CreateCategoryInput,
  type CreateProductInput,
  type UpdateCategoryInput,
  type UpdateProductInput,
} from '@/server/validators/catalogue';

export interface ProductWithCategory {
  id: string;
  sku: string;
  name: string;
  nameNormalized: string;
  categoryId: string | null;
  categoryName: string | null;
  baseUnit: 'each' | 'g' | 'ml';
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
  reorderPoint: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

export async function listCategories() {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function createCategory(input: CreateCategoryInput): Promise<MutationResult<{ id: string }>> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const [created] = await db
      .insert(categories)
      .values({
        name: parsed.data.name.trim(),
        sortOrder: parsed.data.sortOrder,
      })
      .returning({ id: categories.id });

    return { ok: true, data: { id: created.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_category',
        error: `Category "${parsed.data.name}" already exists.`,
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to create category.',
    };
  }
}

export async function listProducts(options?: {
  activeOnly?: boolean;
  categoryId?: string;
  search?: string;
}): Promise<ProductWithCategory[]> {
  const activeOnly = options?.activeOnly ?? true;

  let query = db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      nameNormalized: products.nameNormalized,
      categoryId: products.categoryId,
      categoryName: categories.name,
      baseUnit: products.baseUnit,
      tracksExpiry: products.tracksExpiry,
      shelfLifeDays: products.shelfLifeDays,
      reorderPoint: products.reorderPoint,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .$dynamic();

  const conditions = [];

  if (activeOnly) {
    conditions.push(eq(products.isActive, true));
  }

  if (options?.categoryId) {
    conditions.push(eq(products.categoryId, options.categoryId));
  }

  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(${products.nameNormalized} ILIKE ${term} OR ${products.sku} ILIKE ${term})`,
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query.orderBy(asc(products.name));
}

export async function getProductById(id: string): Promise<ProductWithCategory | null> {
  const [row] = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      nameNormalized: products.nameNormalized,
      categoryId: products.categoryId,
      categoryName: categories.name,
      baseUnit: products.baseUnit,
      tracksExpiry: products.tracksExpiry,
      shelfLifeDays: products.shelfLifeDays,
      reorderPoint: products.reorderPoint,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id));

  return row ?? null;
}

export async function createProduct(input: CreateProductInput): Promise<MutationResult<{ id: string }>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation_error',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    };
  }

  try {
    const nameNorm = normalizeText(parsed.data.name);
    const [created] = await db
      .insert(products)
      .values({
        sku: parsed.data.sku.trim(),
        name: parsed.data.name.trim(),
        nameNormalized: nameNorm,
        categoryId: parsed.data.categoryId ?? null,
        baseUnit: parsed.data.baseUnit,
        tracksExpiry: parsed.data.tracksExpiry,
        shelfLifeDays: parsed.data.shelfLifeDays ?? null,
        reorderPoint: parsed.data.reorderPoint,
      })
      .returning({ id: products.id });

    return { ok: true, data: { id: created.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'sku_exists',
        error: `A product with SKU "${parsed.data.sku}" already exists.`,
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to create product.',
    };
  }
}

export async function updateProduct(input: UpdateProductInput): Promise<MutationResult<{ id: string }>> {
  const parsed = updateProductSchema.safeParse(input);
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

    if (parsed.data.sku !== undefined) updateValues.sku = parsed.data.sku.trim();
    if (parsed.data.name !== undefined) {
      updateValues.name = parsed.data.name.trim();
      updateValues.nameNormalized = normalizeText(parsed.data.name);
    }
    if (parsed.data.categoryId !== undefined) updateValues.categoryId = parsed.data.categoryId;
    if (parsed.data.baseUnit !== undefined) updateValues.baseUnit = parsed.data.baseUnit;
    if (parsed.data.tracksExpiry !== undefined) updateValues.tracksExpiry = parsed.data.tracksExpiry;
    if (parsed.data.shelfLifeDays !== undefined) updateValues.shelfLifeDays = parsed.data.shelfLifeDays;
    if (parsed.data.reorderPoint !== undefined) updateValues.reorderPoint = parsed.data.reorderPoint;
    if (parsed.data.isActive !== undefined) updateValues.isActive = parsed.data.isActive;

    const [updated] = await db
      .update(products)
      .set(updateValues)
      .where(eq(products.id, parsed.data.id))
      .returning({ id: products.id });

    if (!updated) {
      return { ok: false, code: 'not_found', error: 'Product not found.' };
    }

    return { ok: true, data: { id: updated.id } };
  } catch (err: unknown) {
    const dbErr = err as { code?: string; cause?: { code?: string }; message?: string };
    if (dbErr?.code === '23505' || dbErr?.cause?.code === '23505') {
      return {
        ok: false,
        code: 'sku_exists',
        error: 'A product with this SKU already exists.',
      };
    }
    return {
      ok: false,
      code: 'db_error',
      error: dbErr?.message ?? 'Failed to update product.',
    };
  }
}

export async function archiveProduct(id: string): Promise<MutationResult<{ id: string }>> {
  const [updated] = await db
    .update(products)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning({ id: products.id });

  if (!updated) {
    return { ok: false, code: 'not_found', error: 'Product not found.' };
  }

  return { ok: true, data: { id: updated.id } };
}
