'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, MinusCircle } from 'lucide-react';
import Decimal from 'decimal.js';
import { recordUsageAction } from '@/app/actions/ledger';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import { allocateFefo, type BatchCandidate } from '@/server/ledger/allocate-fefo';

export interface ProductWithBatches {
  id: string;
  sku: string;
  name: string;
  baseUnit: BaseUnit;
  usableQuantity: string;
  batches: {
    id: string;
    productId: string;
    expiryDate: string | null;
    receivedAt: string;
    quantityOnHand: string;
  }[];
}

interface UseFormProps {
  products: ProductWithBatches[];
}

export function UseForm({ products }: UseFormProps) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Compute live FEFO preview
  const fefoPreview = useMemo(() => {
    if (!selectedProduct || !quantity || Number(quantity) <= 0) {
      return null;
    }

    const candidates: BatchCandidate[] = selectedProduct.batches.map((b) => ({
      id: b.id,
      productId: b.productId,
      expiryDate: b.expiryDate,
      receivedAt: b.receivedAt,
      quantityOnHand: b.quantityOnHand,
    }));

    try {
      return allocateFefo(candidates, quantity);
    } catch {
      return null;
    }
  }, [selectedProduct, quantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedProductId) {
      setErrorMessage('Please select a product.');
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      setErrorMessage('Please enter a usage quantity greater than zero.');
      return;
    }

    if (fefoPreview && !fefoPreview.ok) {
      setErrorMessage(
        `Insufficient stock! Shortfall of ${formatQuantity(fefoPreview.shortfall, selectedProduct?.baseUnit || 'each')}.`,
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await recordUsageAction({
        productId: selectedProductId,
        quantity: quantity.trim(),
        note: note.trim() || null,
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(
        `Recorded usage of ${formatQuantity(quantity, selectedProduct?.baseUnit || 'each')} of ${selectedProduct?.name}.`,
      );
      setTimeout(() => {
        router.push('/today');
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record usage';
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
          Usage Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Select Product <span className="text-rose-600">*</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setQuantity('');
              }}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — on hand: {formatQuantity(p.usableQuantity, p.baseUnit)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Quantity Used ({selectedProduct?.baseUnit || 'units'}) <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.001"
                placeholder={`e.g. ${selectedProduct?.baseUnit === 'each' ? '2' : '500'}`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              />
              <span className="absolute right-3 top-2 text-xs font-semibold text-[var(--color-ink-muted)]">
                {selectedProduct?.baseUnit}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
            Note (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Morning service prep, Bar shift consumption"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Live FEFO Allocation Preview */}
      {selectedProduct && quantity && Number(quantity) > 0 && (
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2">
            <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--color-ink)]">
              FEFO Depletion Preview
            </h3>
            <span className="text-xs text-[var(--color-ink-muted)]">
              Earliest expiry allocated first
            </span>
          </div>

          {fefoPreview?.ok ? (
            <div className="space-y-2">
              <p className="text-xs text-emerald-800 font-medium">
                Sufficient stock available! Allocation breakdown:
              </p>
              <ul className="divide-y divide-[var(--color-line)] text-sm">
                {fefoPreview.allocations.map((alloc, idx) => (
                  <li key={alloc.batchId} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--color-paper)] px-2 py-0.5 font-bold text-[var(--color-ink)]">
                        #{idx + 1}
                      </span>
                      <span>
                        Batch ID: <span className="font-mono text-slate-600">{alloc.batchId.slice(0, 8)}...</span>
                      </span>
                    </div>
                    <div className="font-semibold text-[var(--color-primary)]">
                      - {formatQuantity(alloc.quantity, selectedProduct.baseUnit)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : fefoPreview && !fefoPreview.ok ? (
            <div className="rounded bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertCircle className="h-4 w-4" />
                <span>Shortfall detected!</span>
              </div>
              <p>
                Only{' '}
                <strong>
                  {formatQuantity(fefoPreview.available, selectedProduct.baseUnit)}
                </strong>{' '}
                is usable on hand. You are short by{' '}
                <strong className="text-rose-900">
                  {formatQuantity(fefoPreview.shortfall, selectedProduct.baseUnit)}
                </strong>
                .
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Submit Button */}
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
          disabled={isSubmitting || (fefoPreview ? !fefoPreview.ok : false)}
          className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Recording Usage...</span>
            </>
          ) : (
            <span>Record Usage</span>
          )}
        </button>
      </div>
    </form>
  );
}
