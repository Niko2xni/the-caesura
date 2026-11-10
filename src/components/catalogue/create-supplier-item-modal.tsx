'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { createSupplierItemAction } from '@/app/actions/catalogue';
import { majorToCents } from '@/lib/money';
import type { BaseUnit } from '@/lib/units';

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  baseUnit: BaseUnit;
}

interface CreateSupplierItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultSupplierId?: string;
  onSuccess?: () => void;
}

export function CreateSupplierItemModal({
  isOpen,
  onClose,
  suppliers,
  products,
  defaultSupplierId,
  onSuccess,
}: CreateSupplierItemModalProps) {
  const [supplierId, setSupplierId] = useState(defaultSupplierId || suppliers[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [supplierSku, setSupplierSku] = useState('');
  const [description, setDescription] = useState('');
  const [packLabel, setPackLabel] = useState('1L carton');
  const [packQuantity, setPackQuantity] = useState('1000');
  const [lastPackCostPesos, setLastPackCostPesos] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!supplierId) {
      setErrorMessage('Please select a supplier.');
      return;
    }
    if (!productId) {
      setErrorMessage('Please select a product.');
      return;
    }
    if (!description.trim()) {
      setErrorMessage('Item description is required.');
      return;
    }
    if (!packLabel.trim()) {
      setErrorMessage('Pack label is required.');
      return;
    }
    if (!packQuantity || Number(packQuantity) <= 0) {
      setErrorMessage('Pack quantity must be greater than zero.');
      return;
    }

    setIsSubmitting(true);

    try {
      let lastPackCostCents: number | null = null;
      if (lastPackCostPesos.trim()) {
        lastPackCostCents = majorToCents(lastPackCostPesos);
      }

      const res = await createSupplierItemAction({
        supplierId,
        productId,
        supplierSku: supplierSku.trim() || null,
        description: description.trim(),
        packLabel: packLabel.trim(),
        packQuantity: packQuantity.trim(),
        lastPackCostCents,
      });

      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setDescription('');
      setSupplierSku('');
      setPackLabel('1L carton');
      setPackQuantity('1000');
      setLastPackCostPesos('');
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to map supplier item');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--color-ink)]">
            Map Supplier Item
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
                Supplier <span className="text-rose-600">*</span>
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Product to Map <span className="text-rose-600">*</span>
              </label>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  const p = products.find((prod) => prod.id === e.target.value);
                  if (p) {
                    setPackQuantity(p.baseUnit === 'each' ? '1' : '1000');
                  }
                }}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Description on Delivery Note / Invoice <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Torani Caramel Syrup 750ml"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              This is used by the OCR matching engine to automatically link items from delivery photos.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Pack Label <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 750ml bottle"
                value={packLabel}
                onChange={(e) => setPackLabel(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Qty / Pack ({selectedProduct?.baseUnit || 'units'}) <span className="text-rose-600">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                placeholder="e.g. 750"
                value={packQuantity}
                onChange={(e) => setPackQuantity(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
                Supplier SKU
              </label>
              <input
                type="text"
                placeholder="e.g. PBC-CAR-750"
                value={supplierSku}
                onChange={(e) => setSupplierSku(e.target.value)}
                className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Last Pack Cost (PHP Pesos)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 450.00"
              value={lastPackCostPesos}
              onChange={(e) => setLastPackCostPesos(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
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
              className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Mapping...</span>
                </>
              ) : (
                <span>Map Item</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
