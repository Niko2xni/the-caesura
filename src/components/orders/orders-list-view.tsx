'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  PackagePlus,
  Plus,
} from 'lucide-react';
import { formatCents } from '@/lib/money';
import type { PurchaseOrderListItem } from '@/server/orders/orders';
import { PoStatusBadge } from './po-status-badge';

interface OrdersListViewProps {
  orders: PurchaseOrderListItem[];
  today: string;
}

type FilterTab = 'all' | 'open' | 'completed' | 'cancelled';

function formatPacksLabel(val: string): string {
  const num = Number(val);
  if (!Number.isFinite(num)) return val;
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

export function OrdersListView({ orders, today }: OrdersListViewProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const counts = useMemo(() => {
    let open = 0;
    let partial = 0;
    let completed = 0;
    let cancelled = 0;
    let openValueCents = 0;

    for (const o of orders) {
      if (o.status === 'submitted' || o.status === 'partially_received') {
        open += 1;
        openValueCents += o.totalEstimatedCostCents;
        if (o.status === 'partially_received') partial += 1;
      } else if (o.status === 'completed') {
        completed += 1;
      } else if (o.status === 'cancelled') {
        cancelled += 1;
      }
    }

    return {
      all: orders.length,
      open,
      partial,
      completed,
      cancelled,
      openValueCents,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'open') {
      return orders.filter(
        (o) => o.status === 'submitted' || o.status === 'partially_received' || o.status === 'draft',
      );
    }
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All Orders', count: counts.all },
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'completed', label: 'Completed', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-[var(--color-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            <ClipboardList className="h-6 w-6 text-[var(--color-primary)]" />
            <span>Purchase Orders</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Create supplier orders, track partial deliveries, and spot short-deliveries or price variances.
          </p>
        </div>

        <Link
          href="/orders/new"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-95 transition-opacity self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Purchase Order</span>
        </Link>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Open POs
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
            {counts.open}
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Awaiting Balance
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
            {counts.partial}
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Completed
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
            {counts.completed}
          </div>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Open Order Value
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-ink)]">
            {formatCents(counts.openValueCents)}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] pb-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-[var(--radius-field)] px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-xs tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[var(--color-paper)] text-[var(--color-ink)]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-10 text-center space-y-3">
          <ClipboardList className="mx-auto h-8 w-8 text-[var(--color-ink-muted)] opacity-60" />
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {orders.length === 0 ? 'No purchase orders yet' : 'No purchase orders match this filter'}
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {orders.length === 0
              ? 'Create your first purchase order to plan supplier deliveries and track fulfillment.'
              : 'Try switching status tabs to see other orders.'}
          </p>
          {orders.length === 0 && (
            <div className="pt-2">
              <Link
                href="/orders/new"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3.5 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Purchase Order</span>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-paper)] text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Fulfillment</th>
                <th className="px-4 py-3 text-right">Est. Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {filteredOrders.map((po) => {
                const orderedNum = Number(po.totalOrderedPacks);
                const receivedNum = Number(po.totalReceivedPacks);
                const pct = orderedNum > 0 ? Math.min(100, Math.round((receivedNum / orderedNum) * 100)) : 0;
                const isOpen = po.status === 'submitted' || po.status === 'partially_received';
                const isOverdue = Boolean(
                  isOpen && po.expectedDeliveryDate && po.expectedDeliveryDate < today,
                );

                return (
                  <tr key={po.id} className="hover:bg-[var(--color-paper)]/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--color-ink)]">
                      <Link href={`/orders/${po.id}`} className="hover:text-[var(--color-primary)] hover:underline">
                        {po.poNumber}
                      </Link>
                      <div className="mt-0.5 font-sans text-[11px] font-normal text-[var(--color-ink-muted)]">
                        {po.lineCount} {po.lineCount === 1 ? 'item' : 'items'}
                      </div>
                    </td>

                    <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                      {po.supplierName}
                    </td>

                    <td className="px-4 py-3 text-xs text-[var(--color-ink-muted)] space-y-0.5">
                      <div>Ordered: {po.orderDate}</div>
                      {po.expectedDeliveryDate && (
                        <div className={`flex items-center gap-1 ${isOverdue ? 'font-semibold text-rose-700' : ''}`}>
                          {isOverdue && <AlertTriangle className="h-3 w-3 shrink-0" />}
                          <span>ETA: {po.expectedDeliveryDate}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="w-36 space-y-1">
                        <div className="flex justify-between text-xs tabular-nums">
                          <span className="font-medium text-[var(--color-ink)]">
                            {formatPacksLabel(po.totalReceivedPacks)} / {formatPacksLabel(po.totalOrderedPacks)} packs
                          </span>
                          <span className="text-[var(--color-ink-muted)]">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              po.status === 'completed'
                                ? 'bg-emerald-600'
                                : po.status === 'partially_received'
                                  ? 'bg-amber-500'
                                  : po.status === 'cancelled'
                                    ? 'bg-rose-400'
                                    : 'bg-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-[var(--color-ink)]">
                      {po.totalEstimatedCostCents > 0 ? formatCents(po.totalEstimatedCostCents) : '—'}
                    </td>

                    <td className="px-4 py-3">
                      <PoStatusBadge status={po.status} />
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {isOpen && (
                          <Link
                            href={`/receive?poId=${po.id}`}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-field)] border border-[var(--color-primary)]/40 bg-emerald-50/70 px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] hover:bg-emerald-100/70 transition-colors"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                            <span>Receive</span>
                          </Link>
                        )}
                        <Link
                          href={`/orders/${po.id}`}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-panel)]"
                        >
                          <span>View</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

