import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { client } from '@/db';
import {
  archiveProduct,
  createCategory,
  createProduct,
  getProductById,
  listCategories,
  listProducts,
  updateProduct,
} from './products';
import {
  archiveSupplier,
  createSupplier,
  createSupplierItem,
  getSupplierById,
  listSupplierItems,
  listSuppliers,
  updateSupplier,
  updateSupplierItem,
} from './suppliers';

const testRunId = crypto.randomUUID().slice(0, 8);

describe('Catalogue Services Integration Tests', () => {
  afterAll(async () => {
    await client.end();
  });

  describe('Categories', () => {
    it('creates and lists categories in order', async () => {
      const catName = `Dairy-${testRunId}`;
      const res = await createCategory({ name: catName, sortOrder: 10 });
      expect(res.ok).toBe(true);

      const all = await listCategories();
      const found = all.find((c) => c.name === catName);
      expect(found).toBeDefined();
      expect(found?.sortOrder).toBe(10);
    });

    it('rejects duplicate category name', async () => {
      const catName = `Syrups-${testRunId}`;
      const first = await createCategory({ name: catName, sortOrder: 5 });
      expect(first.ok).toBe(true);

      const duplicate = await createCategory({ name: catName, sortOrder: 6 });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.code).toBe('duplicate_category');
      }
    });
  });

  describe('Products', () => {
    it('creates a product with normalized name and retrieves it', async () => {
      const sku = `OAT-${testRunId}`;
      const name = `Oatly Barista Edition (1L) ${testRunId}`;
      const res = await createProduct({
        sku,
        name,
        baseUnit: 'ml',
        tracksExpiry: true,
        shelfLifeDays: 30,
        reorderPoint: '12000',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const product = await getProductById(res.data.id);
      expect(product).not.toBeNull();
      expect(product?.sku).toBe(sku);
      // Verify punctuation was stripped and lowercased
      expect(product?.nameNormalized).toMatch(/oatly barista edition 1l/);
      expect(product?.tracksExpiry).toBe(true);
      expect(product?.shelfLifeDays).toBe(30);
    });

    it('rejects duplicate SKU', async () => {
      const sku = `DUP-SKU-${testRunId}`;
      const first = await createProduct({
        sku,
        name: `Product 1 ${testRunId}`,
        baseUnit: 'g',
        tracksExpiry: false,
      });
      expect(first.ok).toBe(true);

      const duplicate = await createProduct({
        sku,
        name: `Product 2 ${testRunId}`,
        baseUnit: 'g',
        tracksExpiry: false,
      });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.code).toBe('sku_exists');
      }
    });

    it('updates a product and normalizes updated name', async () => {
      const sku = `UPD-SKU-${testRunId}`;
      const created = await createProduct({
        sku,
        name: `Initial Name ${testRunId}`,
        baseUnit: 'each',
        tracksExpiry: false,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updateRes = await updateProduct({
        id: created.data.id,
        name: `Renamed Product! ${testRunId}`,
      });
      expect(updateRes.ok).toBe(true);

      const updated = await getProductById(created.data.id);
      expect(updated?.name).toBe(`Renamed Product! ${testRunId}`);
      expect(updated?.nameNormalized).toContain('renamed product');
    });

    it('archives a product and excludes from activeOnly list', async () => {
      const sku = `ARCH-SKU-${testRunId}`;
      const created = await createProduct({
        sku,
        name: `To Archive ${testRunId}`,
        baseUnit: 'g',
        tracksExpiry: false,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const archiveRes = await archiveProduct(created.data.id);
      expect(archiveRes.ok).toBe(true);

      const activeList = await listProducts({ activeOnly: true, search: sku });
      expect(activeList.find((p) => p.id === created.data.id)).toBeUndefined();

      const allList = await listProducts({ activeOnly: false, search: sku });
      expect(allList.find((p) => p.id === created.data.id)).toBeDefined();
    });
  });

  describe('Suppliers and Supplier Items', () => {
    it('creates supplier and maps supplier items', async () => {
      const supplierName = `Pacific Bev Co ${testRunId}`;
      const supRes = await createSupplier({
        name: supplierName,
        contactName: 'Alex Rivera',
        email: 'alex@pacificbev.local',
        leadTimeDays: 3,
      });
      expect(supRes.ok).toBe(true);
      if (!supRes.ok) return;

      const supplier = await getSupplierById(supRes.data.id);
      expect(supplier?.name).toBe(supplierName);
      expect(supplier?.leadTimeDays).toBe(3);

      // Create a product to map to
      const prodRes = await createProduct({
        sku: `SYR-CAR-${testRunId}`,
        name: `Caramel Syrup ${testRunId}`,
        baseUnit: 'ml',
        tracksExpiry: false,
      });
      expect(prodRes.ok).toBe(true);
      if (!prodRes.ok) return;

      // Map supplier item
      const itemRes = await createSupplierItem({
        supplierId: supRes.data.id,
        productId: prodRes.data.id,
        supplierSku: `PBC-CAR-750`,
        description: 'Torani Caramel Syrup 750ml',
        packLabel: '750ml glass bottle',
        packQuantity: '750',
        lastPackCostCents: 45000,
      });
      expect(itemRes.ok).toBe(true);
      if (!itemRes.ok) return;

      const items = await listSupplierItems({ supplierId: supRes.data.id });
      expect(items.length).toBe(1);
      expect(items[0]?.supplierSku).toBe('PBC-CAR-750');
      expect(items[0]?.descriptionNormalized).toBe('torani caramel syrup 750ml');
      expect(items[0]?.lastPackCostCents).toBe(45000);
    });

    it('soft archives supplier', async () => {
      const supplierName = `Old Supplier ${testRunId}`;
      const supRes = await createSupplier({ name: supplierName });
      expect(supRes.ok).toBe(true);
      if (!supRes.ok) return;

      const archRes = await archiveSupplier(supRes.data.id);
      expect(archRes.ok).toBe(true);

      const activeSuppliers = await listSuppliers({ activeOnly: true, search: supplierName });
      expect(activeSuppliers.find((s) => s.id === supRes.data.id)).toBeUndefined();
    });
  });
});
