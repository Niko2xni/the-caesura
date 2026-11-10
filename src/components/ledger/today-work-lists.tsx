'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  PackagePlus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { recordUsageAction, recordWasteAction } from '@/app/actions/ledger';
import { formatRelativeDays } from '@/lib/dates';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type {
  ExpiredBatchWorkItem,
  ReorderProductWorkItem,
  UseSoonBatchWorkItem,
} from '@/server/ledger/queries';

interface TodayWorkListsProps {
  businessDate: string;
  expiredBatches: ExpiredBatchWorkItem[];
  useSoonBatches: UseSoonBatchWorkItem[];
  reorderProducts: ReorderProductWorkItem[];
}

export function TodayWorkLists({
  businessDate,
  expiredBatches,
  useSoonBatches,
  reorderProducts,
}: TodayWorkListsProps) {
  const router = useRouter();

  // Inline Quick Action states
  const [writeOffBatch, setWriteOffBatch] = useState<ExpiredBatchWorkItem | null>(null);
  const [writeOffQuantity, setWriteOffQuantity] = useState('');
  const [writeOffNote, setWriteOffNote] = useState('');
  const [isWritingOff, setIsWritingOff] = useState(false);
  const [writeOffError, setWriteOffError] = useState<string | null>(null);

  const [useBatch, setUseBatch] = useState<UseSoonBatchWorkItem | null>(null);
  const [useQuantity, setUseQuantity] = useState('');
  const [useNote, setUseNote] = useState('');
  const [isUsing, setIsUsing] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);

  const handleOpenWriteOff = (batch: ExpiredBatchWorkItem) => {
    setWriteOffBatch(batch);
    setWriteOffQuantity(batch.quantityOnHand);
    setWriteOffNote('Expired stock write-off from Today work list');
    setWriteOffError(null);
  };

  const handleOpenUse = (batch: UseSoonBatchWorkItem) => {
    setUseBatch(batch);
    setUseQuantity('');
    setUseNote('');
    setUseError(null);
  };

  const handleConfirmWriteOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writeOffBatch) return;

    setIsWritingOff(true);
    setWriteOffError(null);

    try {
      const res = await recordWasteAction({
        batchId: writeOffBatch.batchId,
        quantity: writeOffQuantity.trim(),
        wasteReason: 'expired',
        note: writeOffNote.trim() || null,
      });

      if (!res.ok) {
        setWriteOffError(res.error);
        setIsWritingOff(false);
        return;
      }

      setWriteOffBatch(null);
      setIsWritingOff(false);
      router.refresh();
    } catch (err: unknown) {
      setWriteOffError(err instanceof Error ? err.message : 'Failed to record write-off');
      setIsWritingOff(false);
    }
  };

  const handleConfirmUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useBatch) return;

    setIsUsing(true);
    setUseError(null);

    try {
      const res = await recordUsageAction({
        productId: useBatch.productId,
        quantity: useQuantity.trim(),
        note: useNote.trim() || null,
      });

      if (!res.ok) {
        setUseError(res.error);
        setIsUsing(false);
        return;
      }

      setUseBatch(null);
      setIsUsing(false);
      router.refresh();
    } catch (err: unknown) {
      setUseError(err instanceof Error ? err.message : 'Failed to record usage');
      setIsUsing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Work List 1: Write Off (Expired Batches) */}
      <section className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-rose-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-700" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Write off ({expiredBatches.length})
            </h2>
          </div>
          <span className="text-xs font-medium text-rose-700">
            Stock past expiry date on shelves
          </span>
        </div>

        {expiredBatches.length === 0 ? (
          <div className="p-5 text-sm text-[var(--color-ink-muted)]">
            Nothing to write off. All on-hand batches are fresh and unexpired.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {expiredBatches.map((batch) => {
              const relText = formatRelativeDays(batch.expiryDate, businessDate);

              return (
                <li
                  key={batch.batchId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-[var(--color-paper)]/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${batch.productId}`}
                        className="font-semibold text-sm text-[var(--color-ink)] hover:text-[var(--color-primary)] hover:underline"
                      >
                        {batch.productName}
                      </Link>
                      <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                        {batch.productSku}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
                      <span>
                        On hand:{' '}
                        <strong className="text-rose-700 font-bold">
                          {formatQuantity(batch.quantityOnHand, batch.baseUnit)}
                        </strong>
                      </span>
                      <span>•</span>
                      {batch.lotCode && (
                        <>
                          <span>Lot: {batch.lotCode}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 border border-rose-200">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                        <span>{relText}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenWriteOff(batch)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors shadow-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      <span>Write off</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Work List 2: Use First (Batches Expiring Soon) */}
      <section className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-amber-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-700" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Use first ({useSoonBatches.length})
            </h2>
          </div>
          <span className="text-xs font-medium text-amber-800">
            Expiring within warning window
          </span>
        </div>

        {useSoonBatches.length === 0 ? (
          <div className="p-5 text-sm text-[var(--color-ink-muted)]">
            Nothing expiring soon. No batches require urgent prioritized usage.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {useSoonBatches.map((batch) => {
              const relText = formatRelativeDays(batch.expiryDate, businessDate);

              return (
                <li
                  key={batch.batchId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-[var(--color-paper)]/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${batch.productId}`}
                        className="font-semibold text-sm text-[var(--color-ink)] hover:text-[var(--color-primary)] hover:underline"
                      >
                        {batch.productName}
                      </Link>
                      <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                        {batch.productSku}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
                      <span>
                        On hand:{' '}
                        <strong className="text-[var(--color-ink)] font-semibold">
                          {formatQuantity(batch.quantityOnHand, batch.baseUnit)}
                        </strong>
                      </span>
                      <span>•</span>
                      {batch.lotCode && (
                        <>
                          <span>Lot: {batch.lotCode}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>{relText}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenUse(batch)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-primary)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-paper)] transition-colors shadow-xs"
                    >
                      <MinusCircle className="h-3.5 w-3.5" />
                      <span>Record usage</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Work List 3: Reorder (Low Stock Products) */}
      <section className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[var(--color-ink)]" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Reorder ({reorderProducts.length})
            </h2>
          </div>
          <span className="text-xs font-medium text-[var(--color-ink-muted)]">
            Usable stock at or below reorder threshold
          </span>
        </div>

        {reorderProducts.length === 0 ? (
          <div className="p-5 text-sm text-[var(--color-ink-muted)]">
            All stock levels healthy. No products are at or below their reorder points.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {reorderProducts.map((p) => {
              const receiveUrl = p.supplierId
                ? `/receive?productId=${p.productId}&supplierId=${p.supplierId}`
                : `/receive?productId=${p.productId}`;

              return (
                <li
                  key={p.productId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-[var(--color-paper)]/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${p.productId}`}
                        className="font-semibold text-sm text-[var(--color-ink)] hover:text-[var(--color-primary)] hover:underline"
                      >
                        {p.productName}
                      </Link>
                      <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                        {p.productSku}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
                      <span>
                        On hand:{' '}
                        <strong className="text-amber-800 font-bold">
                          {formatQuantity(p.usableQuantity, p.baseUnit)}
                        </strong>{' '}
                        (below reorder point of {formatQuantity(p.reorderPoint, p.baseUnit)})
                      </span>
                      <span>•</span>
                      {p.supplierName ? (
                        <span className="text-[var(--color-ink)] font-medium">
                          Supplier: {p.supplierName}
                          {p.supplierLeadTimeDays !== null ? `, ${p.supplierLeadTimeDays}d lead` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">No primary supplier mapped</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={receiveUrl}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:opacity-95 transition-opacity"
                    >
                      <PackagePlus className="h-3.5 w-3.5" />
                      <span>Receive</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Inline Modal: Quick Write-Off */}
      {writeOffBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-700" />
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                  Confirm Waste Write-Off
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWriteOffBatch(null)}
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {writeOffError && (
              <div className="mt-4 flex items-center gap-2 rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{writeOffError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmWriteOff} className="mt-4 space-y-4">
              <div className="text-xs text-[var(--color-ink-muted)] space-y-1">
                <div>
                  Product:{' '}
                  <strong className="text-[var(--color-ink)]">
                    {writeOffBatch.productName} ({writeOffBatch.productSku})
                  </strong>
                </div>
                <div>
                  Batch ID:{' '}
                  <span className="font-mono">{writeOffBatch.batchId.slice(0, 8)}...</span>
                </div>
                <div>
                  Expired:{' '}
                  <span className="font-bold text-rose-700">
                    {writeOffBatch.expiryDate} (
                    {formatRelativeDays(writeOffBatch.expiryDate, businessDate)})
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                  Quantity to Write Off ({writeOffBatch.baseUnit})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  value={writeOffQuantity}
                  onChange={(e) => setWriteOffQuantity(e.target.value)}
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                  Waste Reason
                </label>
                <input
                  type="text"
                  value="Expired"
                  disabled
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-slate-50 px-3 py-2 text-sm text-slate-700 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={writeOffNote}
                  onChange={(e) => setWriteOffNote(e.target.value)}
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWriteOffBatch(null)}
                  disabled={isWritingOff}
                  className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWritingOff}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-rose-700 px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-rose-800 transition-colors disabled:opacity-50"
                >
                  {isWritingOff ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Writing Off...</span>
                    </>
                  ) : (
                    <span>Confirm Write Off</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Modal: Quick Record Usage */}
      {useBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
              <div className="flex items-center gap-2">
                <MinusCircle className="h-5 w-5 text-[var(--color-primary)]" />
                <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                  Record Usage (Use First)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUseBatch(null)}
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {useError && (
              <div className="mt-4 flex items-center gap-2 rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{useError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmUsage} className="mt-4 space-y-4">
              <div className="text-xs text-[var(--color-ink-muted)] space-y-1">
                <div>
                  Product:{' '}
                  <strong className="text-[var(--color-ink)]">
                    {useBatch.productName} ({useBatch.productSku})
                  </strong>
                </div>
                <div>
                  Expiring Batch On Hand:{' '}
                  <strong className="text-[var(--color-ink)]">
                    {formatQuantity(useBatch.quantityOnHand, useBatch.baseUnit)}
                  </strong>
                </div>
                <div>
                  Expiry Date:{' '}
                  <span className="font-semibold text-amber-800">
                    {useBatch.expiryDate} ({formatRelativeDays(useBatch.expiryDate, businessDate)})
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                  Quantity Consumed ({useBatch.baseUnit})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  placeholder="e.g. 500"
                  value={useQuantity}
                  onChange={(e) => setUseQuantity(e.target.value)}
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bar service prep"
                  value={useNote}
                  onChange={(e) => setUseNote(e.target.value)}
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUseBatch(null)}
                  disabled={isUsing}
                  className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUsing}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  {isUsing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Record Usage</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


