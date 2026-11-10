'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { recordWasteAction } from '@/app/actions/ledger';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type { OnHandBatchOption } from '@/server/ledger/queries';

interface WasteFormProps {
  batches: OnHandBatchOption[];
}

export function WasteForm({ batches }: WasteFormProps) {
  const router = useRouter();
  const [batchId, setBatchId] = useState(batches[0]?.batchId || '');
  const [quantity, setQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState<'expired' | 'spoiled' | 'damaged' | 'other'>('expired');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedBatch = batches.find((b) => b.batchId === batchId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!batchId) {
      setErrorMessage('Please select a batch.');
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      setErrorMessage('Please enter a write-off quantity greater than zero.');
      return;
    }

    if (selectedBatch) {
      const requested = new Decimal(quantity);
      const onHand = new Decimal(selectedBatch.quantityOnHand);
      if (requested.gt(onHand)) {
        setErrorMessage(
          `Cannot write off more than available on hand (${formatQuantity(selectedBatch.quantityOnHand, selectedBatch.baseUnit)}).`,
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await recordWasteAction({
        batchId,
        quantity: quantity.trim(),
        wasteReason,
        note: note.trim() || null,
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(
        `Recorded waste of ${formatQuantity(quantity, selectedBatch?.baseUnit || 'each')} (${wasteReason}).`,
      );
      setTimeout(() => {
        router.push('/today');
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record waste';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
          Waste Details
        </h2>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
            Target Batch <span className="text-rose-600">*</span>
          </label>
          <select
            value={batchId}
            onChange={(e) => {
              setBatchId(e.target.value);
              setQuantity('');
            }}
            className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
            required
          >
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.productName} ({b.productSku}) —{' '}
                {b.isExpired ? '⚠️ EXPIRED • ' : b.expiryDate ? `Exp: ${b.expiryDate} • ` : ''}
                {formatQuantity(b.quantityOnHand, b.baseUnit)} on hand
                {b.lotCode ? ` (Lot: ${b.lotCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Quantity to Write Off ({selectedBatch?.baseUnit || 'units'}){' '}
              <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.001"
                placeholder="e.g. 500"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              />
              <span className="absolute right-3 top-2 text-xs font-semibold text-[var(--color-ink-muted)]">
                {selectedBatch?.baseUnit}
              </span>
            </div>
            {selectedBatch && (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Maximum write-off:{' '}
                <strong>{formatQuantity(selectedBatch.quantityOnHand, selectedBatch.baseUnit)}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Waste Reason <span className="text-rose-600">*</span>
            </label>
            <select
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value as any)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            >
              <option value="expired">Expired (Past expiry date)</option>
              <option value="spoiled">Spoiled (Sour milk, mould, off smell)</option>
              <option value="damaged">Damaged (Dropped container, torn packaging)</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
            Note (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Fridge temperature fluctuation overnight"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/today')}
          disabled={isSubmitting}
          className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper)] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-rose-700 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-rose-800 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Logging Waste...</span>
            </>
          ) : (
            <span>Log Waste Write-Off</span>
          )}
        </button>
      </div>
    </form>
  );
}
