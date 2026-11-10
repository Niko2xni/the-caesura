import Link from 'next/link';
import {
  Layers,
  MinusCircle,
  PackagePlus,
  Trash2,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { formatQuantity } from '@/lib/units';
import { requireSession } from '@/server/auth/guards';
import { getProductStockList, getTodayWorkLists } from '@/server/ledger/queries';
import { TodayWorkLists } from '@/components/ledger/today-work-lists';

export default async function TodayPage() {
  await requireSession();

  const [workLists, products] = await Promise.all([
    getTodayWorkLists(),
    getProductStockList(),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            Today
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Business date: <span className="font-semibold text-[var(--color-ink)]">{workLists.businessDate}</span> (Asia/Manila)
          </p>
        </div>

        {/* Quick Action Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/receive"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
          >
            <PackagePlus className="h-4 w-4" />
            <span>Receive Delivery</span>
          </Link>
          <Link
            href="/use"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
          >
            <MinusCircle className="h-4 w-4" />
            <span>Record Usage</span>
          </Link>
          <Link
            href="/waste"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span>Log Waste</span>
          </Link>
        </div>
      </div>

      {/* The 3 Actionable Work Lists (FR-11): Write Off, Use First, Reorder */}
      <TodayWorkLists
        businessDate={workLists.businessDate}
        expiredBatches={workLists.expiredBatches}
        useSoonBatches={workLists.useSoonBatches}
        reorderProducts={workLists.reorderProducts}
      />

      {/* Stock Overview Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Inventory On Hand
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)]">Current stock levels across all tracked products</p>
          </div>
          <Link
            href="/catalogue"
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            Manage Catalogue →
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Usable Stock</th>
                <th className="py-2.5 px-3 text-right">Expired</th>
                <th className="py-2.5 px-3 text-right">Reorder Point</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No products found. Start by adding items in the{' '}
                    <Link href="/catalogue" className="text-[var(--color-primary)] underline">
                      Catalogue
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const usable = new Decimal(p.usableQuantity);
                  const expired = new Decimal(p.expiredQuantity);
                  const reorder = new Decimal(p.reorderPoint);

                  let statusBadge = (
                    <span className="rounded bg-[var(--color-fresh-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--color-fresh-ink)]">
                      Fresh
                    </span>
                  );

                  if (usable.isZero() && expired.isZero()) {
                    statusBadge = (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        Out of Stock
                      </span>
                    );
                  } else if (expired.gt(0)) {
                    statusBadge = (
                      <span className="rounded bg-[var(--color-expired-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--color-expired-ink)]">
                        Expired Stock
                      </span>
                    );
                  } else if (reorder.gt(0) && usable.lte(reorder)) {
                    statusBadge = (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-300">
                        Low Stock
                      </span>
                    );
                  }

                  return (
                    <tr key={p.id} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                        <Link
                          href={`/products/${p.id}`}
                          className="hover:text-[var(--color-primary)] hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="block text-xs font-mono text-[var(--color-ink-muted)]">{p.sku}</span>
                      </td>
                      <td className="py-2.5 px-3 text-sm text-[var(--color-ink-muted)]">
                        {p.categoryName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[var(--color-ink)]">
                        {formatQuantity(p.usableQuantity, p.baseUnit)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm">
                        {expired.gt(0) ? (
                          <span className="font-semibold text-rose-600">
                            {formatQuantity(p.expiredQuantity, p.baseUnit)}
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm text-[var(--color-ink-muted)]">
                        {reorder.gt(0) ? formatQuantity(p.reorderPoint, p.baseUnit) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">{statusBadge}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

