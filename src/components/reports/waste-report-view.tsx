'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  Calendar,
  Filter,
  History,
  Layers,
  PieChart,
  Trash2,
} from 'lucide-react';
import { formatCents } from '@/lib/money';
import { formatQuantity } from '@/lib/units';
import type {
  WasteIncidentRow,
  WasteReportData,
  WasteSummaryByProduct,
  WasteSummaryByReason,
} from '@/server/ledger/reports';

interface WasteReportViewProps {
  data: WasteReportData;
}

const reasonLabels: Record<string, { label: string; color: string; bg: string; text: string }> = {
  expired: { label: 'Expired', color: '#B3261E', bg: 'bg-rose-100', text: 'text-rose-900' },
  spoiled: { label: 'Spoiled', color: '#D97706', bg: 'bg-amber-100', text: 'text-amber-900' },
  damaged: { label: 'Damaged', color: '#7C3AED', bg: 'bg-purple-100', text: 'text-purple-900' },
  other: { label: 'Other', color: '#64748B', bg: 'bg-slate-100', text: 'text-slate-800' },
};

export function WasteReportView({ data }: WasteReportViewProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(data.startDate);
  const [endDate, setEndDate] = useState(data.endDate);

  const applyDateFilter = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    router.push(`/waste/report?start=${start}&end=${end}`);
  };

  const setPreset = (preset: 'this-month' | 'last-30' | 'this-year') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (preset === 'this-month') {
      applyDateFilter(`${yyyy}-${mm}-01`, todayStr);
    } else if (preset === 'last-30') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const pastYyyy = past.getFullYear();
      const pastMm = String(past.getMonth() + 1).padStart(2, '0');
      const pastDd = String(past.getDate()).padStart(2, '0');
      applyDateFilter(`${pastYyyy}-${pastMm}-${pastDd}`, todayStr);
    } else if (preset === 'this-year') {
      applyDateFilter(`${yyyy}-01-01`, todayStr);
    }
  };

  const topReason = data.byReason.length > 0 ? data.byReason[0] : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Sub-nav Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
        <Link
          href="/waste"
          className="flex items-center gap-1.5 rounded-[var(--radius-field)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)] transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          <span>Record Waste</span>
        </Link>
        <span className="flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] shadow-xs border border-[var(--color-line)]">
          <PieChart className="h-4 w-4" />
          <span>Waste Financial Report</span>
        </span>
      </div>

      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-line)] pb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            Waste & Spoilage Report
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Financial cost and breakdown of inventory losses across the café.
          </p>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setPreset('this-month')}
            className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-paper)] transition-colors"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setPreset('last-30')}
            className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-paper)] transition-colors"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setPreset('this-year')}
            className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-medium hover:bg-[var(--color-paper)] transition-colors"
          >
            This Year
          </button>

          <div className="flex items-center gap-1 pl-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-xs"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => applyDateFilter(startDate, endDate)}
              className="rounded bg-[var(--color-primary)] px-2.5 py-1 font-semibold text-white hover:opacity-95"
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-rose-700">
            Total Waste Loss
          </div>
          <div className="mt-1 text-3xl font-bold text-rose-700">
            {formatCents(data.totalCostCents)}
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Between {data.startDate} and {data.endDate}
          </p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ink-muted)]">
            Total Discard Events
          </div>
          <div className="mt-1 text-3xl font-bold text-[var(--color-ink)]">
            {data.totalIncidents}
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Separate logged write-off movements
          </p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-ink-muted)]">
            Primary Loss Reason
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--color-ink)] capitalize">
            {topReason && topReason.totalCostCents > 0 ? (
              <span>
                {topReason.reason}{' '}
                <span className="text-sm font-semibold text-[var(--color-ink-muted)]">
                  ({topReason.costPercentage}%)
                </span>
              </span>
            ) : (
              'None'
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            {topReason && topReason.totalCostCents > 0
              ? `${formatCents(topReason.totalCostCents)} lost to ${topReason.reason}`
              : 'Zero waste recorded in range'}
          </p>
        </div>
      </div>

      {/* Breakdown By Reason */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)] border-b border-[var(--color-line)] pb-3">
          Loss by Waste Reason
        </h2>

        {/* Visual Progress Bar */}
        {data.totalCostCents > 0 && (
          <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100">
            {data.byReason.map((r) => {
              if (r.costPercentage <= 0) return null;
              const meta = reasonLabels[r.reason];
              return (
                <div
                  key={r.reason}
                  style={{ width: `${r.costPercentage}%`, backgroundColor: meta?.color }}
                  title={`${meta?.label}: ${r.costPercentage}% (${formatCents(r.totalCostCents)})`}
                />
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {data.byReason.map((r) => {
            const meta = reasonLabels[r.reason] || reasonLabels.other;
            return (
              <div
                key={r.reason}
                className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)]/50 p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${meta.bg} ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                    {r.costPercentage}%
                  </span>
                </div>
                <div className="text-lg font-bold text-[var(--color-ink)]">
                  {formatCents(r.totalCostCents)}
                </div>
                <div className="text-xs text-[var(--color-ink-muted)]">
                  {r.incidentCount} {r.incidentCount === 1 ? 'incident' : 'incidents'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breakdown By Product */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)] border-b border-[var(--color-line)] pb-3">
          Top Wasted Products ({data.byProduct.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Product / SKU</th>
                <th className="py-2.5 px-3 text-right">Quantity Wasted</th>
                <th className="py-2.5 px-3 text-right">Financial Loss (PHP)</th>
                <th className="py-2.5 px-3 text-center">Incidents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {data.byProduct.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No waste recorded in this date range.
                  </td>
                </tr>
              ) : (
                data.byProduct.map((p) => (
                  <tr key={p.productId} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                      <Link
                        href={`/products/${p.productId}`}
                        className="hover:text-[var(--color-primary)] hover:underline"
                      >
                        {p.productName}
                      </Link>
                      <span className="block text-xs font-mono text-[var(--color-ink-muted)]">
                        {p.productSku}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[var(--color-ink)]">
                      {formatQuantity(p.totalQuantity, p.baseUnit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-rose-700">
                      {formatCents(p.totalCostCents)}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-[var(--color-ink-muted)]">
                      {p.incidentCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Itemized Waste Incidents Audit Log */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
          <History className="h-5 w-5 text-rose-700" />
          <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
            Detailed Waste Incidents Log
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-paper)] text-xs uppercase tracking-wider text-[var(--color-ink-muted)] border-b border-[var(--color-line)]">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Cost</th>
                <th className="py-2.5 px-3">Note</th>
                <th className="py-2.5 px-3">Logged By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {data.incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-[var(--color-ink-muted)]">
                    No individual waste incidents recorded in this date range.
                  </td>
                </tr>
              ) : (
                data.incidents.map((inc) => {
                  const meta = reasonLabels[inc.wasteReason] || reasonLabels.other;
                  return (
                    <tr key={inc.id} className="hover:bg-[var(--color-paper)]/50 transition-colors">
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)] whitespace-nowrap">
                        {inc.occurredAt.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-medium text-[var(--color-ink)]">
                        <Link
                          href={`/products/${inc.productId}`}
                          className="hover:text-[var(--color-primary)] hover:underline"
                        >
                          {inc.productName}
                        </Link>
                        {inc.lotCode && (
                          <span className="block text-slate-500 font-sans">Lot: {inc.lotCode}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${meta.bg} ${meta.text}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs font-semibold text-slate-800">
                        {formatQuantity(inc.quantity, inc.baseUnit)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs font-semibold text-rose-700">
                        {formatCents(inc.costCents)}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink-muted)] max-w-xs truncate">
                        {inc.note || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[var(--color-ink)]">
                        {inc.createdByName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
