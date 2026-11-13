'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPlus,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { createPurchaseOrderAction } from '@/app/actions/orders';
import { addDays } from '@/lib/dates';
import { centsToMajor, formatCents, majorToCents } from '@/lib/money';
import { formatQuantity, type BaseUnit } from '@/lib/units';

interface SupplierOption {
  id: string;
  name: string;
  leadTimeDays: number | null;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  baseUnit: BaseUnit;
}

interface SupplierItemPreset {
  id: string;
  supplierId: string;
  productId: string;
  description: string;
  packLabel: string;
  packQuantity: string;
  lastPackCostCents: number | null;
}

interface OrderLineState {
  id: string;
  productId: string;
  supplierItemId: string | null;
  packCount: string;
  packQuantity: string;
  agreedPackCostPesos: string;
}

interface NewOrderFormProps {
  suppliers: SupplierOption[];
  products: ProductOption[];
  supplierItems: SupplierItemPreset[];
  defaultDate: string;
  initialSupplierId?: string;
  initialProductId?: string;
}

function cleanDecimalDisplay(val: string): string {
  const num = Number(val);
  if (!Number.isFinite(num)) return val;
  return Number.isInteger(num) ? String(num) : String(num);
}

export function NewOrderForm({
  suppliers,
  products,
  supplierItems,
  defaultDate,
  initialSupplierId,
  initialProductId,
}: NewOrderFormProps) {
  const router = useRouter();

  const resolvedSupplierId =
    (initialSupplierId && suppliers.some((s) => s.id === initialSupplierId) ? initialSupplierId : null) ||
    suppliers[0]?.id ||
    '';
  const resolvedProductId =
    (initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : null) ||
    products[0]?.id ||
    '';

  const findPreset = (supId: string, prodId: string): SupplierItemPreset | undefined =>
    supplierItems.find((si) => si.supplierId === supId && si.productId === prodId);

  const buildLine = (supId: string, prodId: string): OrderLineState => {
    const preset = findPreset(supId, prodId);
    const prod = products.find((p) => p.id === prodId);
    const defaultPackQty = preset
      ? cleanDecimalDisplay(preset.packQuantity)
      : prod?.baseUnit === 'each'
        ? '1'
        : '1000';

    return {
      id: crypto.randomUUID(),
      productId: prodId,
      supplierItemId: preset?.id ?? null,
      packCount: '1',
      packQuantity: defaultPackQty,
      agreedPackCostPesos:
        preset?.lastPackCostCents !== null && preset?.lastPackCostCents !== undefined
          ? centsToMajor(preset.lastPackCostCents)
          : '',
    };
  };

  const initialSupplier = suppliers.find((s) => s.id === resolvedSupplierId);
  const initialEta =
    initialSupplier?.leadTimeDays !== null && initialSupplier?.leadTimeDays !== undefined
      ? addDays(defaultDate, initialSupplier.leadTimeDays)
      : '';

  const [supplierId, setSupplierId] = useState(resolvedSupplierId);
  const [orderDate, setOrderDate] = useState(defaultDate);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(initialEta);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<OrderLineState[]>(() =>
    resolvedProductId ? [buildLine(resolvedSupplierId, resolvedProductId)] : [],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSupplierChange = (newSupId: string) => {
    setSupplierId(newSupId);
    const sup = suppliers.find((s) => s.id === newSupId);
    if (sup?.leadTimeDays !== null && sup?.leadTimeDays !== undefined) {
      setExpectedDeliveryDate(addDays(orderDate, sup.leadTimeDays));
    }

    // Re-match supplier item presets for existing lines
    setLines((prev) =>
      prev.map((l) => {
        const preset = findPreset(newSupId, l.productId);
        if (!preset) {
          return { ...l, supplierItemId: null };
        }
        return {
          ...l,
          supplierItemId: preset.id,
          packQuantity: cleanDecimalDisplay(preset.packQuantity),
          agreedPackCostPesos:
            preset.lastPackCostCents !== null ? centsToMajor(preset.lastPackCostCents) : l.agreedPackCostPesos,
        };
      }),
    );
  };

  const handleProductChange = (lineId: string, newProdId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const fresh = buildLine(supplierId, newProdId);
        return {
          ...l,
          productId: newProdId,
          supplierItemId: fresh.supplierItemId,
          packQuantity: fresh.packQuantity,
          agreedPackCostPesos: fresh.agreedPackCostPesos,
        };
      }),
    );
  };

  const updateLineField = <K extends keyof OrderLineState>(
    lineId: string,
    key: K,
    value: OrderLineState[K],
  ) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, [key]: value } : l)));
  };

  const addLine = () => {
    const usedIds = new Set(lines.map((l) => l.productId));
    const nextProd = products.find((p) => !usedIds.has(p.id)) ?? products[0];
    if (!nextProd) return;
    setLines((prev) => [...prev, buildLine(supplierId, nextProd.id)]);
  };

  const removeLine = (lineId: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const estimatedTotalCents = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const packs = Number(l.packCount);
      const costStr = l.agreedPackCostPesos.trim();
      if (!Number.isFinite(packs) || packs <= 0 || !costStr) continue;
      const packCostNum = Number(costStr);
      if (!Number.isFinite(packCostNum) || packCostNum < 0) continue;

      const centsPerPack = majorToCents(costStr);
      total += new Decimal(packs).mul(centsPerPack).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    }
    return total;
  }, [lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supplierId) {
      setErrorMessage('Please select a supplier.');
      return;
    }

    if (lines.length === 0) {
      setErrorMessage('Add at least one line item.');
      return;
    }

    for (const [idx, l] of lines.entries()) {
      if (!l.productId) {
        setErrorMessage(`Item #${idx + 1}: Select a product.`);
        return;
      }
      if (!l.packCount || Number(l.packCount) <= 0) {
        setErrorMessage(`Item #${idx + 1}: Pack count must be greater than zero.`);
        return;
      }
      if (!l.packQuantity || Number(l.packQuantity) <= 0) {
        setErrorMessage(`Item #${idx + 1}: Pack quantity must be greater than zero.`);
        return;
      }
      if (l.agreedPackCostPesos.trim() && Number(l.agreedPackCostPesos) < 0) {
        setErrorMessage(`Item #${idx + 1}: Agreed pack cost cannot be negative.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        supplierId,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate.trim() || null,
        notes: notes.trim() || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          supplierItemId: l.supplierItemId,
          packCount: l.packCount,
          packQuantity: l.packQuantity,
          agreedPackCostCents: l.agreedPackCostPesos.trim()
            ? majorToCents(l.agreedPackCostPesos.trim())
            : null,
        })),
      };

      const res = await createPurchaseOrderAction(payload);
      if (!res.ok) {
        setErrorMessage(res.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(`Created purchase order ${res.data.poNumber}.`);
      router.push(`/orders/${res.data.purchaseOrderId}`);
      router.refresh();
    } catch {
      setErrorMessage('An unexpected error occurred while creating the purchase order.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[var(--color-line)] pb-4 space-y-2">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Purchase Orders</span>
        </Link>
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          <ClipboardPlus className="h-6 w-6 text-[var(--color-primary)]" />
          <span>New Purchase Order</span>
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Record planned supplier orders with negotiated pack quantities and agreed costs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Order Details Card */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
            Order Details
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="po-supplier" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                Supplier <span className="text-rose-500">*</span>
              </label>
              <select
                id="po-supplier"
                value={supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                required
                className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              >
                <option value="" disabled>
                  Select supplier...
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="po-order-date" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                Order Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="po-order-date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                required
                className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="po-eta" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
                Expected Delivery
              </label>
              <input
                id="po-eta"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label htmlFor="po-notes" className="block text-xs font-semibold uppercase text-[var(--color-ink-muted)]">
              Order Notes / Instructions
            </label>
            <textarea
              id="po-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Deliver before 9am; check seal dates on oat milk."
              className="mt-1 block w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Order Lines Card */}
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
                Order Items
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Specify ordered pack counts and agreed pack costs (in PHP) for variance tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-panel)]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => {
              const prod = products.find((p) => p.id === line.productId);
              const baseUnit = prod?.baseUnit ?? 'each';
              const totalBaseQty = Number(line.packCount || 0) * Number(line.packQuantity || 0);
              const lineSubtotalCents =
                line.agreedPackCostPesos.trim() && Number(line.packCount) > 0
                  ? new Decimal(line.packCount)
                      .mul(majorToCents(line.agreedPackCostPesos.trim()))
                      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
                      .toNumber()
                  : null;

              return (
                <div
                  key={line.id}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--color-ink)]">
                      Item #{idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="p-1 text-[var(--color-ink-muted)] hover:text-rose-600 rounded"
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold uppercase text-[var(--color-ink-muted)] mb-1">
                        Product <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={line.productId}
                        onChange={(e) => handleProductChange(line.id, e.target.value)}
                        required
                        className="block h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold uppercase text-[var(--color-ink-muted)] mb-1">
                        Packs <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={line.packCount}
                        onChange={(e) => updateLineField(line.id, 'packCount', e.target.value)}
                        required
                        className="block h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs tabular-nums text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold uppercase text-[var(--color-ink-muted)] mb-1">
                        Qty / Pack ({baseUnit})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={line.packQuantity}
                        onChange={(e) => updateLineField(line.id, 'packQuantity', e.target.value)}
                        required
                        className="block h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs tabular-nums text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold uppercase text-[var(--color-ink-muted)] mb-1">
                        Agreed Cost / Pack (PHP)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 850.00"
                        value={line.agreedPackCostPesos}
                        onChange={(e) => updateLineField(line.id, 'agreedPackCostPesos', e.target.value)}
                        className="block h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs tabular-nums text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-[var(--color-ink-muted)] pt-1">
                    <span>
                      Expected stock:{' '}
                      <strong className="text-[var(--color-ink)]">
                        {Number.isFinite(totalBaseQty) && totalBaseQty > 0
                          ? formatQuantity(totalBaseQty, baseUnit)
                          : '—'}
                      </strong>
                    </span>
                    {lineSubtotalCents !== null && (
                      <span>
                        Line est.:{' '}
                        <strong className="font-mono text-[var(--color-ink)]">
                          {formatCents(lineSubtotalCents)}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-4 text-sm">
            <span className="font-medium text-[var(--color-ink-muted)]">
              Estimated Order Total
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">
              {estimatedTotalCents > 0 ? formatCents(estimatedTotalCents) : '—'}
            </span>
          </div>
        </div>

        {/* Feedback */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/orders"
            className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating PO...</span>
              </>
            ) : (
              <span>Submit Purchase Order</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

