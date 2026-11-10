'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, Package, Sliders } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatCents } from '@/lib/money';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type {
  BatchDetailRow,
  MovementHistoryRow,
} from '@/server/ledger/queries';
import { AdjustStockModal } from './adjust-stock-modal';

interface ProductDetailViewProps {
  product: {
    id: string;
    sku: string;
    name: string;
    categoryName: string | null;
    baseUnit: BaseUnit;
    tracksExpiry: boolean;
    shelfLifeDays: number | null;
    reorderPoint: string;
  };
  usableQuantity: string;
  expiredQuantity: string;
  batches: BatchDetailRow[];
  movements: MovementHistoryRow[];
  isAdmin: boolean;
}

export function ProductDetailView({
  product,
  usableQuantity,
  expiredQuantity,
  batches,
  movements,
  isAdmin,
}: ProductDetailViewProps) {
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  const usable = new Decimal(usableQuantity);
  const expired = new Decimal(expiredQuantity);
  const reorder = new Decimal(product.reorderPoint);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div className="space-y-1">
          <Link
            href="/catalogue"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-primary)] transition-colors mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Catalogue</span>
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            {product.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800">
              SKU: {product.sku}
            </span>
            <span>•</span>
            <span>Category: {product.categoryName || 'Uncategorized'}</span>
            <span>•</span>
            <span>Base Unit: {product.baseUnit}</span>
            {product.tracksExpiry && (
              <>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">
                  Expiry Tracked {product.shelfLifeDays ? `(${product.shelfLifeDays}d shelf life)` : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {isAdmin && batches.length > 0 && (
          <button
            type="button"
            onClick={() => setIsAdjustModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-900 shadow-xs hover:bg-amber-100 transition-colors"
          >
            <Sliders className="h-4 w-4 text-amber-700" />
            <span>Adjust Stock</span>
          </button>
        )}
      </div>

      {/* Stock KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ink-muted)]">
            Usable Stock
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--color-ink)]">
            {formatQuantity(usableQuantity, product.baseUnit)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {reorder.gt(0) && usable.lte(reorder) ? (
              <span className="text-amber-700 font-medium">⚠️ Below reorder point ({formatQuantity(product.reorderPoint, product.baseUnit)})</span>
            ) : (
              <span>Available for service</span>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ink-muted)]">
            Expired on Hand
          </div>
          <div className={`mt-1 text-2xl font-bold ${expired.gt(0) ? 'text-rose-600' : 'text-[var(--color-ink)]'}`}>
            {formatQuantity(expiredQuantity, product.baseUnit)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {expired.gt(0) ? (
              <Link href="/waste" className="text-rose-600 underline font-medium">
                Log waste write-off →
              </Link>
            ) : (
              'No expired stock'
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ink-muted)]">
            Active Batches
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--color-ink)]">
            {batches.filter((b) => Number(b.quantityOnHand) > 0).length}
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {batches.length} total recorded
          </div>
        </div>
      </div>

      {/* Batches Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
          <Package className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
            Batches on Hand (FEFO Priority Order)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Batch ID / Lot</th>
                <th className="py-2.5 px-3">Received Date</th>
                <th className="py-2.5 px-3">Expiry Date</th>
                <th className="py-2.5 px-3 text-right">Initial Qty</th>
                <th className="py-2.5 px-3 text-right">Remaining On Hand</th>
                <th className="py-2.5 px-3 text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No batches recorded yet. Deliveries will appear here.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.batchId} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-[var(--color-ink)]">
                      <span>{b.batchId.slice(0, 8)}...</span>
                      {b.lotCode && (
                        <span className="block text-slate-500 font-sans">Lot: {b.lotCode}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)]">
                      {b.receivedAt.slice(0, 10)}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {b.expiryDate ? (
                        b.isExpired ? (
                          <span className="font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Expired ({b.expiryDate})
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {b.expiryDate} {b.expirySource === 'estimated' ? '(est.)' : ''}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">Non-expiring</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-[var(--color-ink-muted)]">
                      {formatQuantity(b.initialQuantity, product.baseUnit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[var(--color-ink)]">
                      {formatQuantity(b.quantityOnHand, product.baseUnit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-[var(--color-ink-muted)]">
                      {b.unitCost ? `₱${b.unitCost}/${product.baseUnit}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Ledger History */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
          <History className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
            Movement Ledger History
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3">Details / Note</th>
                <th className="py-2.5 px-3">Logged By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No ledger transactions recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isPositive = Number(m.quantity) > 0;

                  let typeBadge = (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                      {m.type}
                    </span>
                  );

                  if (m.type === 'receipt') {
                    typeBadge = (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 border border-emerald-200">
                        Receipt
                      </span>
                    );
                  } else if (m.type === 'usage') {
                    typeBadge = (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 border border-sky-200">
                        Usage
                      </span>
                    );
                  } else if (m.type === 'waste') {
                    typeBadge = (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 border border-rose-200">
                        Waste ({m.wasteReason})
                      </span>
                    );
                  } else if (m.type === 'adjustment') {
                    typeBadge = (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                        Adjustment
                      </span>
                    );
                  }

                  return (
                    <tr key={m.id} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)] whitespace-nowrap">
                        {m.occurredAt.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-2.5 px-3">{typeBadge}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold text-xs whitespace-nowrap ${
                          isPositive ? 'text-emerald-700' : 'text-slate-800'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatQuantity(m.quantity, product.baseUnit)}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)] max-w-xs truncate">
                        {m.note || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink)]">
                        {m.createdByName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      <AdjustStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        batches={batches}
        productName={product.name}
        baseUnit={product.baseUnit}
      />
    </div>
  );
}

