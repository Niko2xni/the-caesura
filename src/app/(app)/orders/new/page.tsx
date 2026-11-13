import Link from 'next/link';
import { getBusinessToday } from '@/lib/dates';
import { requireSession } from '@/server/auth/guards';
import { listProducts } from '@/server/catalogue/products';
import { listSupplierItems, listSuppliers } from '@/server/catalogue/suppliers';
import { NewOrderForm } from '@/components/orders/new-order-form';

interface NewOrderPageProps {
  searchParams: Promise<{
    supplierId?: string;
    productId?: string;
  }>;
}

export default async function NewOrderPage({ searchParams }: NewOrderPageProps) {
  await requireSession();
  const { supplierId, productId } = await searchParams;

  const today = getBusinessToday();
  const suppliers = await listSuppliers({ activeOnly: true });
  const products = await listProducts({ activeOnly: true });
  const supplierItems = await listSupplierItems();

  if (suppliers.length === 0 || products.length === 0) {
    return (
      <div className="max-w-3xl mx-auto rounded-[var(--radius-panel)] border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900 space-y-3">
        <p className="font-semibold">Setup Required Before Creating a Purchase Order</p>
        <p className="text-amber-800">
          {suppliers.length === 0 && products.length === 0
            ? 'You need at least one active supplier and one active product first.'
            : suppliers.length === 0
              ? 'You need at least one active supplier first.'
              : 'You need at least one active product first.'}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {suppliers.length === 0 && (
            <Link
              href="/suppliers"
              className="rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Add Supplier →
            </Link>
          )}
          {products.length === 0 && (
            <Link
              href="/catalogue"
              className="rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Add Product →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <NewOrderForm
      suppliers={suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        leadTimeDays: s.leadTimeDays,
      }))}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        baseUnit: p.baseUnit,
      }))}
      supplierItems={supplierItems.map((si) => ({
        id: si.id,
        supplierId: si.supplierId,
        productId: si.productId,
        description: si.description,
        packLabel: si.packLabel,
        packQuantity: si.packQuantity,
        lastPackCostCents: si.lastPackCostCents,
      }))}
      defaultDate={today}
      initialSupplierId={supplierId}
      initialProductId={productId}
    />
  );
}

