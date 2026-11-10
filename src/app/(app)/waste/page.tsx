import Link from 'next/link';
import { PieChart, Trash2 } from 'lucide-react';
import { requireSession } from '@/server/auth/guards';
import { getOnHandBatches } from '@/server/ledger/queries';
import { WasteForm } from '@/components/ledger/waste-form';

export default async function WastePage() {
  await requireSession();

  const batches = await getOnHandBatches();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Sub-nav Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
        <span className="flex items-center gap-1.5 rounded-[var(--radius-field)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] shadow-xs border border-[var(--color-line)]">
          <Trash2 className="h-4 w-4" />
          <span>Record Waste</span>
        </span>
        <Link
          href="/waste/report"
          className="flex items-center gap-1.5 rounded-[var(--radius-field)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)] transition-colors"
        >
          <PieChart className="h-4 w-4" />
          <span>Waste Financial Report</span>
        </Link>
      </div>

      <div className="border-b border-[var(--color-line)] pb-4">
        <h1 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          <Trash2 className="h-6 w-6 text-rose-700" />
          <span>Record Waste Write-Off</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Write off expired, spoiled, or damaged stock from specific batches. Every write-off is logged in the movement ledger with a required reason.
        </p>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-slate-300 bg-white p-6 text-center text-sm text-[var(--color-ink-muted)] space-y-3">
          <p className="font-semibold text-[var(--color-ink)]">No Stock on Hand</p>
          <p>There are currently no active batches with remaining stock on hand to write off.</p>
          <div className="flex justify-center pt-2">
            <Link
              href="/today"
              className="rounded-[var(--radius-field)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Back to Today →
            </Link>
          </div>
        </div>
      ) : (
        <WasteForm batches={batches} />
      )}
    </div>
  );
}
