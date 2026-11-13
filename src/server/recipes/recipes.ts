import Decimal from 'decimal.js';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { menuItems, products, recipeIngredients } from '@/db/schema';
import { normalizeText } from '@/lib/normalise';
import type { BaseUnit } from '@/lib/units';
import type { CreateMenuItemInput, UpdateMenuItemInput } from '../validators/recipes';

export class RecipeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecipeError';
  }
}

export type RecipeOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

export interface MenuItemIngredientDetail {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  baseUnit: BaseUnit;
  quantity: string;
  usableQuantity: string;
}

export interface MenuItemSummary {
  id: string;
  sku: string;
  name: string;
  posItemName: string | null;
  category: string;
  priceCents: number | null;
  isActive: boolean;
  ingredients: MenuItemIngredientDetail[];
  maxServableUnits: number;
  createdAt: Date;
  updatedAt: Date;
}

function isPgUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ('code' in err && (err as { code?: unknown }).code === '23505') return true;
  if ('cause' in err) return isPgUniqueViolation((err as { cause?: unknown }).cause);
  return false;
}

/**
 * Lists menu items with their ingredient bills of material and real-time servable capacity.
 */
export async function listMenuItems(opts?: {
  includeArchived?: boolean;
}): Promise<MenuItemSummary[]> {
  const rows = await db
    .select({
      id: menuItems.id,
      sku: menuItems.sku,
      name: menuItems.name,
      posItemName: menuItems.posItemName,
      category: menuItems.category,
      priceCents: menuItems.priceCents,
      isActive: menuItems.isActive,
      createdAt: menuItems.createdAt,
      updatedAt: menuItems.updatedAt,
    })
    .from(menuItems)
    .where(opts?.includeArchived ? undefined : eq(menuItems.isActive, true))
    .orderBy(asc(menuItems.category), asc(menuItems.name));

  if (rows.length === 0) return [];

  const menuIds = rows.map((r) => r.id);
  const idList = sql.join(
    menuIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const ingredientRows = await db.execute<{
    id: string;
    menu_item_id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    base_unit: BaseUnit;
    quantity: string;
    usable_quantity: string;
  }>(sql`
    SELECT
      ri.id,
      ri.menu_item_id,
      ri.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      p.base_unit,
      ri.quantity::text AS quantity,
      coalesce(ps.usable_quantity, 0)::numeric(14,3)::text AS usable_quantity
    FROM recipe_ingredients ri
    INNER JOIN products p ON p.id = ri.product_id
    LEFT JOIN product_stock ps ON ps.product_id = p.id
    WHERE ri.menu_item_id IN (${idList})
    ORDER BY p.name ASC
  `);

  const ingredientsByMenu = new Map<string, MenuItemIngredientDetail[]>();
  for (const ing of ingredientRows) {
    const list = ingredientsByMenu.get(ing.menu_item_id) ?? [];
    list.push({
      id: ing.id,
      productId: ing.product_id,
      productName: ing.product_name,
      productSku: ing.product_sku,
      baseUnit: ing.base_unit,
      quantity: ing.quantity,
      usableQuantity: ing.usable_quantity,
    });
    ingredientsByMenu.set(ing.menu_item_id, list);
  }

  return rows.map((row) => {
    const ingredients = ingredientsByMenu.get(row.id) ?? [];
    let maxServableUnits = 0;

    if (ingredients.length > 0) {
      let minCap = Infinity;
      for (const ing of ingredients) {
        const qtyNeeded = new Decimal(ing.quantity);
        if (qtyNeeded.lte(0)) continue;
        const servable = new Decimal(ing.usableQuantity).div(qtyNeeded).floor().toNumber();
        if (servable < minCap) {
          minCap = servable;
        }
      }
      maxServableUnits = Number.isFinite(minCap) ? Math.max(0, minCap) : 0;
    }

    return {
      ...row,
      ingredients,
      maxServableUnits,
    };
  });
}

export async function getMenuItemDetail(menuItemId: string): Promise<MenuItemSummary | null> {
  const all = await listMenuItems({ includeArchived: true });
  return all.find((m) => m.id === menuItemId) ?? null;
}

/**
 * Creates a menu item and its ingredient recipe atomically.
 */
export async function createMenuItem(
  input: CreateMenuItemInput,
): Promise<RecipeOperationResult<{ menuItemId: string }>> {
  if (input.ingredients.length === 0) {
    return {
      ok: false,
      code: 'empty_ingredients',
      error: 'A recipe must contain at least one ingredient.',
    };
  }

  const uniqueProductIds = Array.from(new Set(input.ingredients.map((i) => i.productId)));
  if (uniqueProductIds.length !== input.ingredients.length) {
    return {
      ok: false,
      code: 'duplicate_ingredient',
      error: 'Duplicate ingredient products are not allowed in the same recipe.',
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const productRows = await tx
        .select({ id: products.id, isActive: products.isActive })
        .from(products)
        .where(inArray(products.id, uniqueProductIds));

      if (productRows.length !== uniqueProductIds.length || productRows.some((p) => !p.isActive)) {
        throw new RecipeError(
          'invalid_product',
          'One or more selected ingredient products do not exist or have been archived.',
        );
      }

      const [inserted] = await tx
        .insert(menuItems)
        .values({
          sku: input.sku.trim(),
          name: input.name.trim(),
          nameNormalized: normalizeText(input.name),
          posItemName: input.posItemName?.trim() || null,
          category: input.category?.trim() || 'Beverages',
          priceCents: input.priceCents ?? null,
        })
        .returning({ id: menuItems.id });

      await tx.insert(recipeIngredients).values(
        input.ingredients.map((ing) => ({
          menuItemId: inserted.id,
          productId: ing.productId,
          quantity: new Decimal(ing.quantity).toFixed(3),
        })),
      );

      return { menuItemId: inserted.id };
    });

    return { ok: true, data: result };
  } catch (err: unknown) {
    if (err instanceof RecipeError) {
      return { ok: false, code: err.code, error: err.message };
    }
    if (isPgUniqueViolation(err)) {
      return {
        ok: false,
        code: 'duplicate_sku',
        error: `Menu SKU "${input.sku.trim()}" already exists.`,
      };
    }
    const message = err instanceof Error ? err.message : 'Failed to create menu item';
    return { ok: false, code: 'db_error', error: message };
  }
}

/**
 * Updates a menu item's metadata and replaces its ingredient recipe atomically.
 */
export async function updateMenuItem(
  input: UpdateMenuItemInput,
): Promise<RecipeOperationResult<{ menuItemId: string }>> {
  const uniqueProductIds = Array.from(new Set(input.ingredients.map((i) => i.productId)));
  if (uniqueProductIds.length !== input.ingredients.length) {
    return {
      ok: false,
      code: 'duplicate_ingredient',
      error: 'Duplicate ingredient products are not allowed in the same recipe.',
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.id, input.id));

      if (!existing) {
        throw new RecipeError('not_found', 'Menu item was not found.');
      }

      const productRows = await tx
        .select({ id: products.id, isActive: products.isActive })
        .from(products)
        .where(inArray(products.id, uniqueProductIds));

      if (productRows.length !== uniqueProductIds.length || productRows.some((p) => !p.isActive)) {
        throw new RecipeError(
          'invalid_product',
          'One or more selected ingredient products do not exist or have been archived.',
        );
      }

      await tx
        .update(menuItems)
        .set({
          sku: input.sku.trim(),
          name: input.name.trim(),
          nameNormalized: normalizeText(input.name),
          posItemName: input.posItemName?.trim() || null,
          category: input.category?.trim() || 'Beverages',
          priceCents: input.priceCents ?? null,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, input.id));

      await tx.delete(recipeIngredients).where(eq(recipeIngredients.menuItemId, input.id));

      await tx.insert(recipeIngredients).values(
        input.ingredients.map((ing) => ({
          menuItemId: input.id,
          productId: ing.productId,
          quantity: new Decimal(ing.quantity).toFixed(3),
        })),
      );

      return { menuItemId: input.id };
    });

    return { ok: true, data: result };
  } catch (err: unknown) {
    if (err instanceof RecipeError) {
      return { ok: false, code: err.code, error: err.message };
    }
    if (isPgUniqueViolation(err)) {
      return {
        ok: false,
        code: 'duplicate_sku',
        error: `Menu SKU "${input.sku.trim()}" already exists.`,
      };
    }
    const message = err instanceof Error ? err.message : 'Failed to update menu item';
    return { ok: false, code: 'db_error', error: message };
  }
}

/**
 * Soft-archives a menu item so historical sales import references stay intact.
 */
export async function archiveMenuItem(
  menuItemId: string,
): Promise<RecipeOperationResult<{ menuItemId: string }>> {
  const [updated] = await db
    .update(menuItems)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(menuItems.id, menuItemId))
    .returning({ id: menuItems.id });

  if (!updated) {
    return { ok: false, code: 'not_found', error: 'Menu item not found.' };
  }

  return { ok: true, data: { menuItemId: updated.id } };
}

