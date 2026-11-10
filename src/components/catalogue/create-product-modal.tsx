'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { createProductAction } from '@/app/actions/catalogue';
import type { BaseUnit } from '@/lib/units';

interface CategoryOption {
  id: string;
  name: string;
}

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  onSuccess?: () => void;
}

export function CreateProductModal({ isOpen, onClose, categories, onSuccess }: CreateProductModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('ml');
  const [tracksExpiry, setTracksExpiry] = useState(false);
  const [shelfLifeDays, setShelfLifeDays] = useState('');
  const [reorderPoint, setReorderPoint] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sku.trim()) {
      setErrorMessage('SKU is required.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Product name is required.');
      return;
    }

    if (tracksExpiry && shelfLifeDays && Number(shelfLifeDays) <= 0) {
      setErrorMessage('Shelf life days must be greater than zero.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createProductAction({
        sku: sku.trim(),
        name: name.trim(),
        categoryId: categoryId || null,
        baseUnit,
        tracksExpiry,
        shelfLifeDays: tracksExpiry && shelfLifeDays ? Number(shelfLifeDays) : null,
        reorderPoint: reorderPoint.trim() || '0',
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      // Reset form
      setSku('');
      setName('');
      setCategoryId('');
      setBaseUnit('ml');
      setTracksExpiry(false);
      setShelfLifeDays('');
      setReorderPoint('0');
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create product');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink)]">
            New Product
          </h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                SKU <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. MILK-WHOLE-1L"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              >
                <option value="">No Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Product Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Fresh Whole Milk (Barista Grade)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Base Tracking Unit <span className="text-rose-600">*</span>
              </label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value as BaseUnit)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              >
                <option value="ml">Millilitres (ml) — liquids</option>
                <option value="g">Grams (g) — beans, powders, food</option>
                <option value="each">Each — cups, lids, bottles, items</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Reorder Point ({baseUnit})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 5000"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Expiry Tracking Section */}
          <div className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)]/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tracksExpiry"
                checked={tracksExpiry}
                onChange={(e) => {
                  setTracksExpiry(e.target.checked);
                  if (!e.target.checked) setShelfLifeDays('');
                }}
                className="h-4 w-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <label htmlFor="tracksExpiry" className="text-sm font-semibold text-[var(--color-ink)] cursor-pointer">
                Track Batch Expiry & FEFO
              </label>
            </div>

            {tracksExpiry && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                  Default Shelf Life (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 14 (auto-estimates expiry date if missing from delivery note)"
                  value={shelfLifeDays}
                  onChange={(e) => setShelfLifeDays(e.target.value)}
                  className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                />
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  If set, Caesura will quietly estimate the expiry date (+X days from delivery) when no printed date is found.
                </p>
              </div>
            )}
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
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Create Product</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

