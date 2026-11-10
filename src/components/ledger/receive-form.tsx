'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { receiveDeliveryAction } from '@/app/actions/ledger';
import { majorToCents } from '@/lib/money';
import { formatQuantity, type BaseUnit } from '@/lib/units';

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  baseUnit: BaseUnit;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface LineItemState {
  id: string; // client temporary key
  productId: string;
  packCount: string;
  packQuantity: string;
  lineCostPesos: string;
  expiryDate: string;
  lotCode: string;
}

interface ReceiveFormProps {
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultDate: string;
}

export function ReceiveForm({ suppliers, products, defaultDate }: ReceiveFormProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState(defaultDate);
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [lines, setLines] = useState<LineItemState[]>([
    {
      id: crypto.randomUUID(),
      productId: products[0]?.id || '',
      packCount: '1',
      packQuantity: '1000',
      lineCostPesos: '',
      expiryDate: '',
      lotCode: '',
    },
  ]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: products[0]?.id || '',
        packCount: '1',
        packQuantity: '1000',
        lineCostPesos: '',
        expiryDate: '',
        lotCode: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, updates: Partial<LineItemState>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...updates };

        // If product changed, update default pack quantity or check expiry
        if (updates.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          if (prod && !updated.packQuantity) {
            updated.packQuantity = prod.baseUnit === 'each' ? '1' : '1000';
          }
        }
        return updated;
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supplierId) {
      setErrorMessage('Please select a supplier.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('At least one line item is required.');
      return;
    }

    for (const [idx, line] of lines.entries()) {
      if (!line.productId) {
        setErrorMessage(`Line ${idx + 1}: Please select a product.`);
        return;
      }
      if (!line.packCount || Number(line.packCount) <= 0) {
        setErrorMessage(`Line ${idx + 1}: Pack count must be greater than zero.`);
        return;
      }
      if (!line.packQuantity || Number(line.packQuantity) <= 0) {
        setErrorMessage(`Line ${idx + 1}: Pack quantity must be greater than zero.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        supplierId,
        deliveryDate,
        reference: reference.trim() || null,
        source: 'manual' as const,
        idempotencyKey,
        lines: lines.map((l) => {
          let lineCostCents: number | null = null;
          if (l.lineCostPesos.trim()) {
            lineCostCents = majorToCents(l.lineCostPesos);
          }

          return {
            productId: l.productId,
            packCount: l.packCount.trim(),
            packQuantity: l.packQuantity.trim(),
            lineCostCents,
            expiryDate: l.expiryDate.trim() || null,
            expirySource: l.expiryDate.trim() ? ('printed' as const) : null,
            lotCode: l.lotCode.trim() || null,
            matchMethod: 'manual' as const,
          };
        }),
      };

      const result = await receiveDeliveryAction(payload);

      if (!result.ok) {
        setErrorMessage(result.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage('Delivery received and batches added to inventory successfully.');
      setTimeout(() => {
        router.push('/today');
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit delivery';
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

      {/* Header Fields */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
          Delivery Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              Delivery Date <span className="text-rose-600">*</span>
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] mb-1">
              Invoice / Delivery Note #
            </label>
            <input
              type="text"
              placeholder="e.g. INV-98124"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Items Received
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Add individual products, pack quantities, costs, and expiry dates.
            </p>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-slate-200 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Row</span>
          </button>
        </div>

        <div className="space-y-4">
          {lines.map((line, idx) => {
            const product = products.find((p) => p.id === line.productId);
            const totalQuantity =
              Number(line.packCount || 0) * Number(line.packQuantity || 0);

            return (
              <div
                key={line.id}
                className="relative rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)]/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--color-ink)]">
                    Item #{idx + 1}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                      Product <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                      className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      required
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                      Packs <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder="e.g. 6"
                      value={line.packCount}
                      onChange={(e) => updateLine(line.id, { packCount: e.target.value })}
                      className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                      Qty per Pack ({product?.baseUnit || 'units'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder="e.g. 1000"
                      value={line.packQuantity}
                      onChange={(e) => updateLine(line.id, { packQuantity: e.target.value })}
                      className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                      Line Cost (PHP)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 570.00"
                      value={line.lineCostPesos}
                      onChange={(e) => updateLine(line.id, { lineCostPesos: e.target.value })}
                      className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--color-ink-muted)] mb-1">
                      Expiry Date {product?.tracksExpiry && <span className="text-amber-600 font-bold">*</span>}
                    </label>
                    <input
                      type="date"
                      value={line.expiryDate}
                      onChange={(e) => updateLine(line.id, { expiryDate: e.target.value })}
                      className="w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-[var(--color-ink-muted)] pt-1 border-t border-[var(--color-line)]/50">
                  <div className="flex items-center gap-4">
                    <span>
                      Total Added:{' '}
                      <strong className="text-[var(--color-ink)]">
                        {formatQuantity(totalQuantity.toString(), product?.baseUnit || 'each')}
                      </strong>
                    </span>
                    {line.expiryDate ? (
                      <span className="text-emerald-700 font-medium">Expiry: {line.expiryDate}</span>
                    ) : product?.shelfLifeDays ? (
                      <span className="text-amber-700">
                        Will estimate automatically (+{product.shelfLifeDays} days)
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span>Lot code:</span>
                    <input
                      type="text"
                      placeholder="Optional lot code"
                      value={line.lotCode}
                      onChange={(e) => updateLine(line.id, { lotCode: e.target.value })}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-0.5 text-xs text-[var(--color-ink)] w-32"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
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
          className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Recording Delivery...</span>
            </>
          ) : (
            <span>Receive Delivery</span>
          )}
        </button>
      </div>
    </form>
  );
}

