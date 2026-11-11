import { db } from '@/db';
import { products, supplierItems, suppliers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ProductCandidate, SupplierItemCandidate } from './match';

export interface ExtractionContextResult {
  products: ProductCandidate[];
  supplierItems: SupplierItemCandidate[];
  chosenSupplierName: string | null;
}

/**
 * Retrieves catalogue products and supplier items to supply candidate matching
 * during delivery receipt extraction.
 */
export async function getExtractionCatalogueContext(
  supplierId?: string | null,
): Promise<ExtractionContextResult> {
  // 1. Fetch all active catalogue products
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      nameNormalized: products.nameNormalized,
      sku: products.sku,
      baseUnit: products.baseUnit,
      tracksExpiry: products.tracksExpiry,
      shelfLifeDays: products.shelfLifeDays,
    })
    .from(products)
    .where(eq(products.isActive, true));

  // 2. Fetch supplier items (filtered if supplierId is provided)
  let supplierItemQuery = db
    .select({
      id: supplierItems.id,
      supplierId: supplierItems.supplierId,
      productId: supplierItems.productId,
      productName: products.name,
      supplierSku: supplierItems.supplierSku,
      description: supplierItems.description,
      descriptionNormalized: supplierItems.descriptionNormalized,
      packLabel: supplierItems.packLabel,
      packQuantity: supplierItems.packQuantity,
      lastPackCostCents: supplierItems.lastPackCostCents,
    })
    .from(supplierItems)
    .innerJoin(products, eq(supplierItems.productId, products.id))
    .where(eq(products.isActive, true));

  if (supplierId) {
    supplierItemQuery = db
      .select({
        id: supplierItems.id,
        supplierId: supplierItems.supplierId,
        productId: supplierItems.productId,
        productName: products.name,
        supplierSku: supplierItems.supplierSku,
        description: supplierItems.description,
        descriptionNormalized: supplierItems.descriptionNormalized,
        packLabel: supplierItems.packLabel,
        packQuantity: supplierItems.packQuantity,
        lastPackCostCents: supplierItems.lastPackCostCents,
      })
      .from(supplierItems)
      .innerJoin(products, eq(supplierItems.productId, products.id))
      .where(eq(supplierItems.supplierId, supplierId));
  }

  const supplierItemRows = await supplierItemQuery;

  // 3. Resolve chosen supplier name if supplierId was supplied
  let chosenSupplierName: string | null = null;
  if (supplierId) {
    const [supp] = await db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    chosenSupplierName = supp?.name ?? null;
  }

  return {
    products: productRows,
    supplierItems: supplierItemRows,
    chosenSupplierName,
  };
}


