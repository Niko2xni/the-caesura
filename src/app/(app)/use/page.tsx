import Link from 'next/link';
import { MinusCircle } from 'lucide-react';
import Decimal from 'decimal.js';
import { requireSession } from '@/server/auth/guards';
import { getProductStockList, getUsableBatchesForProduct } from '@/server/ledger/queries';
import { UseForm, type ProductWithBatches } from '@/components/ledger/use-form';

interface UsePageProps {
  searchParams: Promise<{
    productId?: string;
  }>;
}

export default async function UsePage({ searchParams }: UsePageProps) {
  await requireSession();

  const { productId } = await searchParams;

  const stockList = await getProductStockList();

  // Load candidate batches for products with usable stock
  const productsWithBatches: ProductWithBatches[] = await Promise.all(
    stockList.map(async (p) => {
      const batches = await getUsableBatchesForProduct(p.id);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        baseUnit: p.baseUnit,
        usableQuantity: p.usableQuantity,
        batches,
      };
    }),
  );

  const availableProducts = productsWithBatches.filter((p) =>
    new Decimal(p.usableQuantity).gt(0),
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="border-b border-[var(--color-line)] pb-4">
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          <MinusCircle className="h-6 w-6 text-[var(--color-primary)]" />
          <span>Record Usage</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Deduct stock consumed during daily café service. Batches are automatically allocated in First-Expired, First-Out (FEFO) order.
        </p>
      </div>

      {availableProducts.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900 space-y-3">
          <p className="font-semibold">No Usable Stock Available</p>
          <p className="text-amber-800">
            There is currently no usable stock on hand for any product to record usage.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              href="/receive"
              className="rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Receive Delivery First →
            </Link>
          </div>
        </div>
      ) : (
        <UseForm products={availableProducts} initialProductId={productId} />
      )}
    </div>
  );
}

