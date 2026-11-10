import Link from 'next/link';
import { PackagePlus } from 'lucide-react';
import { getBusinessToday } from '@/lib/dates';
import { requireSession } from '@/server/auth/guards';
import { listProducts } from '@/server/catalogue/products';
import { listSuppliers } from '@/server/catalogue/suppliers';
import { ReceiveForm } from '@/components/ledger/receive-form';

export default async function ReceivePage() {
  await requireSession();

  const today = getBusinessToday();
  const suppliers = await listSuppliers({ activeOnly: true });
  const products = await listProducts({ activeOnly: true });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-[var(--color-line)] pb-4">
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          <PackagePlus className="h-6 w-6 text-[var(--color-primary)]" />
          <span>Receive Delivery</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Record stock delivered by suppliers. Batches will be created and ledger movements logged atomically.
        </p>
      </div>

      {suppliers.length === 0 || products.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900 space-y-3">
          <p className="font-semibold">Setup Required Before Receiving Delivery</p>
          <p className="text-amber-800">
            {suppliers.length === 0 && products.length === 0
              ? 'You need to create at least one supplier and one product first.'
              : suppliers.length === 0
                ? 'You need to create at least one supplier first.'
                : 'You need to create at least one product first.'}
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
      ) : (
        <ReceiveForm
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          products={products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            baseUnit: p.baseUnit,
            tracksExpiry: p.tracksExpiry,
            shelfLifeDays: p.shelfLifeDays,
          }))}
          defaultDate={today}
        />
      )}
    </div>
  );
}
