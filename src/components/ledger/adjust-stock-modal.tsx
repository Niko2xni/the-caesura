'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Sliders, X } from 'lucide-react';
import { recordAdjustmentAction } from '@/app/actions/ledger';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type { BatchDetailRow } from '@/server/ledger/queries';

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: BatchDetailRow[];
  productName: string;
  baseUnit: BaseUnit;
}

export function AdjustStockModal({
  isOpen,
  onClose,
  batches,
  productName,
  baseUnit,
}: AdjustStockModalProps) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(batches[0]?.batchId || '');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedBatch = batches.find((b) => b.batchId === batchId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!batchId) {
      setErrorMessage('Please select a batch to adjust.');
      return;
    }

    if (!quantityDelta || Number(quantityDelta) === 0) {
      setErrorMessage('Adjustment delta must be non-zero (positive for found stock, negative for missing stock).');
      return;
    }

    if (!note.trim()) {
      setErrorMessage('Enter an explanation note for the inventory audit trail.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await recordAdjustmentAction({
        batchId,
        quantityDelta: quantityDelta.trim(),
        note: note.trim(),
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setQuantityDelta('');
      setNote('');
      setIsSubmitting(false);
      onClose();
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to adjust stock');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-600" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink)]">
              Admin Stock Adjustment
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Target Batch <span className="text-rose-600">*</span>
            </label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            >
              {batches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  Batch {b.batchId.slice(0, 8)}... — on hand: {formatQuantity(b.quantityOnHand, baseUnit)}
                  {b.lotCode ? ` (Lot: ${b.lotCode})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Quantity Delta ({baseUnit}) <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                placeholder="e.g. +500 or -200"
                value={quantityDelta}
                onChange={(e) => setQuantityDelta(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              />
              <span className="absolute right-3 top-2 text-xs font-semibold text-[var(--color-ink-muted)]">
                {baseUnit}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Use positive (+) if physical count found extra, negative (-) for count shortage.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Audit Explanation Note <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Physical inventory count verified on Nov 10; found 1 unlogged carton."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Logging...</span>
                </>
              ) : (
                <span>Log Adjustment</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

