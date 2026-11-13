'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackagePlus,
  ReceiptText,
  Sparkles,
  User,
  XCircle,
} from 'lucide-react';
import { cancelPurchaseOrderAction } from '@/app/actions/orders';
import { formatCents } from '@/lib/money';
import { formatQuantity, type BaseUnit } from '@/lib/units';
import type { PurchaseOrderDetail } from '@/server/orders/orders';
import { PoStatusBadge } from './po-status-badge';

interface OrderDetailViewProps {
  order: PurchaseOrderDetail;
  isAdmin: boolean;
  today: string;
}

function formatPacks(val: string): string {
  const num = Number(val);
  if (!Number.isFinite(num)) return val;
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

export function OrderDetailView({ order, isAdmin, today }: OrderDetailViewProps) {
  const router = useRouter();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isOpen = order.status === 'submitted' || order.status === 'partially_received';
  const hasAnyReceived = order.lines.some((l) => Number(l.receivedPackCount) > 0);
  const canCancel = isAdmin && order.status === 'submitted' && !hasAnyReceived;
  const isOverdue = Boolean(
    isOpen && order.expectedDeliveryDate && order.expectedDeliveryDate < today,
  );

  const totalEstimatedCents = order.lines.reduce((acc, l) => {
    if (l.agreedPackCostCents === null) return acc;
    return acc + Math.round(Number(l.packCount) * l.agreedPackCostCents);
  }, 0);

  const handleCancelOrder = async () => {
    setCancelError(null);
    setIsCancelling(true);
    try {
      const res = await cancelPurchaseOrderAction({
        purchaseOrderId: order.id,
        reason: cancelReason.trim() || undefined,
      });
      if (!res.ok) {
        setCancelError(res.error);
        setIsCancelling(false);
        return;
      }
      setShowCancelConfirm(false);
      router.refresh();
    } catch {
      setCancelError('Failed to cancel purchase order.');
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-[var(--color-line)] pb-4 space-y-3">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Purchase Orders</span>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
                <ClipboardList className="h-6 w-6 text-[var(--color-primary)]" />
                <span className="font-mono">{order.poNumber}</span>
              </h1>
              <PoStatusBadge status={order.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-ink-muted)]">
              <span className="font-semibold text-[var(--color-ink)]">{order.supplierName}</span>
              {order.supplierContact && <span>Contact: {order.supplierContact}</span>}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Ordered: {order.orderDate}
              </span>
              {order.expectedDeliveryDate && (
                <span className={`inline-flex items-center gap-1 ${isOverdue ? 'font-semibold text-rose-700' : ''}`}>
                  {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                  Expected: {order.expectedDeliveryDate}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Created by {order.createdByName}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOpen && (
              <Link
                href={`/receive?poId=${order.id}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
              >
                <PackagePlus className="h-4 w-4" />
                <span>Receive Delivery</span>
              </Link>
            )}

            {canCancel && !showCancelConfirm && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                <span>Cancel PO</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Cancel Confirmation */}
      {showCancelConfirm && (
        <div className="rounded-[var(--radius-panel)] border border-rose-300 bg-rose-50 p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Cancel {order.poNumber}?</p>
              <p className="text-xs text-rose-800">
                Cancelled orders cannot receive deliveries. This action cannot be undone.
              </p>
            </div>
          </div>

          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Optional cancellation reason (e.g. Supplier out of stock)"
            className="block w-full rounded-[var(--radius-field)] border border-rose-200 bg-white px-3 py-2 text-xs text-[var(--color-ink)] focus:border-rose-400 focus:outline-hidden"
          />

          {cancelError && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-800">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{cancelError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCancelConfirm(false);
                setCancelError(null);
              }}
              disabled={isCancelling}
              className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)]"
            >
              Keep Order
            </button>
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Cancelling...</span>
                </>
              ) : (
                <span>Confirm Cancel</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Line Items Table */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5 bg-[var(--color-paper)]">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Ordered vs. Received Items
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Tracks remaining pack balances and short deliveries against planned quantities.
            </p>
          </div>
          {totalEstimatedCents > 0 && (
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]">
                Estimated Value
              </div>
              <div className="font-mono text-sm font-bold text-[var(--color-ink)]">
                {formatCents(totalEstimatedCents)}
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-paper)]/60 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Pack Size</th>
                <th className="px-4 py-3 text-right">Ordered</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3 text-right">Agreed / Pack</th>
                <th className="px-4 py-3">Line Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {order.lines.map((line) => {
                const ordered = Number(line.packCount);
                const received = Number(line.receivedPackCount);
                const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;

                return (
                  <tr key={line.id} className="hover:bg-[var(--color-paper)]/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${line.productId}`}
                        className="font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)] hover:underline"
                      >
                        {line.productName}
                      </Link>
                      <div className="text-xs font-mono text-[var(--color-ink-muted)]">
                        {line.productSku}
                        {line.supplierSku && ` · Sup SKU: ${line.supplierSku}`}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs text-[var(--color-ink-muted)]">
                      {formatQuantity(Number(line.packQuantity), line.baseUnit as BaseUnit)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[var(--color-ink)]">
                      {formatPacks(line.packCount)} packs
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-ink)]">
                          {formatPacks(line.receivedPackCount)} packs
                        </span>
                        <div className="h-1 w-20 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full rounded-full ${
                              line.isFullyReceived
                                ? 'bg-emerald-600'
                                : received > 0
                                  ? 'bg-amber-500'
                                  : 'bg-stone-300'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">
                      {formatPacks(line.outstandingPackCount)} packs
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--color-ink)]">
                      {line.agreedPackCostCents !== null ? formatCents(line.agreedPackCostCents) : '—'}
                    </td>

                    <td className="px-4 py-3">
                      {line.isFullyReceived ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Fulfilled
                        </span>
                      ) : line.isShortDelivery ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <AlertTriangle className="h-3 w-3" /> Short ({formatPacks(line.outstandingPackCount)} due)
                        </span>
                      ) : order.status === 'cancelled' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-stone-100 border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 2-Column Info: Linked Deliveries & Notes */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-3">
          <h3 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm font-bold text-[var(--color-ink)]">
            <ReceiptText className="h-4 w-4 text-[var(--color-primary)]" />
            <span>Linked Delivery Receipts ({order.linkedReceipts.length})</span>
          </h3>

          {order.linkedReceipts.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-muted)] py-2">
              No deliveries have been received against this purchase order yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-line)] text-xs">
              {order.linkedReceipts.map((rec) => (
                <li key={rec.id} className="flex items-center justify-between py-2.5">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[var(--color-ink)]">
                      {rec.reference || 'No DR / Invoice #'}
                    </div>
                    <div className="text-[var(--color-ink-muted)]">
                      Delivered {rec.deliveryDate}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                      rec.source === 'ai_extraction'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-stone-100 text-stone-700 border border-stone-200'
                    }`}
                  >
                    {rec.source === 'ai_extraction' && <Sparkles className="h-3 w-3" />}
                    {rec.source === 'ai_extraction' ? 'Photo Intake' : 'Manual'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-3">
          <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--color-ink)]">
            Order Notes & History
          </h3>
          {order.notes ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-ink)]">
              {order.notes}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-ink-muted)]">No notes recorded on this order.</p>
          )}
        </div>
      </div>
    </div>
  );
}

