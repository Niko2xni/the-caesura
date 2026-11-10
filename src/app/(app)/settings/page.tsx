import {
  Clock,
  Coins,
  Cpu,
  Database,
  Lock,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { requireSession } from '@/server/auth/guards';
import { getBusinessSettings } from '@/server/catalogue/settings';

export default async function SettingsPage() {
  const session = await requireSession();
  const settingsData = await getBusinessSettings();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-[var(--color-line)] pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Settings & Configuration
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          System parameters, business rules, and security controls for The Caesura.
        </p>
      </div>

      {/* Demo Guardrail Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Demo Mode Guardrail (FR-15)</p>
          <p className="text-amber-800 leading-relaxed">
            Configuration parameters are locked in read-only mode during the portfolio demo to maintain
            reproducible ledger states and consistent test scenarios. In production, administrative users
            can modify warning thresholds, currency formatting, and rate limits.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Café Profile */}
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Store className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Café & Business Profile
            </h2>
          </div>

          <dl className="mt-4 divide-y divide-[var(--color-line)] text-sm">
            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Business Name</dt>
              <dd className="font-semibold text-[var(--color-ink)]">{settingsData.businessName}</dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Operating Currency</dt>
              <dd className="flex items-center gap-2">
                <span className="font-semibold text-[var(--color-ink)]">{settingsData.currency} (Philippine Peso)</span>
                <span className="rounded bg-[var(--color-paper)] px-1.5 py-0.5 text-xs font-mono font-medium text-[var(--color-primary)]">
                  ₱ / Centavos
                </span>
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Business Timezone</dt>
              <dd className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
                <span className="font-semibold text-[var(--color-ink)]">{settingsData.timezone} (UTC+08:00)</span>
              </dd>
            </div>

            <div className="py-3 text-xs text-[var(--color-ink-muted)] leading-relaxed">
              All ledger entries and day boundaries strictly calculate time according to Asia/Manila calendar days.
              Financial costs are stored in integer centavos to eliminate floating-point drift.
            </div>
          </dl>
        </section>

        {/* Inventory & Expiry Controls */}
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Clock className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              Inventory & Expiry Rules
            </h2>
          </div>

          <dl className="mt-4 divide-y divide-[var(--color-line)] text-sm">
            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Expiry Warning Horizon</dt>
              <dd className="flex items-center gap-2">
                <span className="font-semibold text-[var(--color-ink)]">
                  {settingsData.expiryWarningDays} days before expiry
                </span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  Active
                </span>
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Allocation Strategy</dt>
              <dd className="font-semibold text-[var(--color-ink)]">Strict FEFO (First-Expired, First-Out)</dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Movement Ledger Policy</dt>
              <dd className="flex items-center gap-1.5 font-semibold text-emerald-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Append-Only (Triggers enforced)</span>
              </dd>
            </div>

            <div className="py-3 text-xs text-[var(--color-ink-muted)] leading-relaxed">
              Batches expiring within {settingsData.expiryWarningDays} days are highlighted on the Today board.
              The database enforces that stock can never be edited or deleted—only compensated with new movements.
            </div>
          </dl>
        </section>

        {/* AI Receipt Extraction Caps */}
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Sparkles className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              AI Intake Rate Limits (Phase 3)
            </h2>
          </div>

          <dl className="mt-4 divide-y divide-[var(--color-line)] text-sm">
            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Per-User Daily Quota</dt>
              <dd className="font-semibold text-[var(--color-ink)]">
                {settingsData.extractionCapPerUserDaily} receipts / day
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Per-IP Daily Quota</dt>
              <dd className="font-semibold text-[var(--color-ink)]">
                {settingsData.extractionCapPerIpDaily} receipts / day
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Global Daily Ceiling</dt>
              <dd className="font-semibold text-[var(--color-ink)]">
                {settingsData.extractionCapGlobalDaily} receipts / day
              </dd>
            </div>

            <div className="py-3 text-xs text-[var(--color-ink-muted)] leading-relaxed">
              Rate limits protect Gemini multimodal API quotas against accidental overuse or infinite loops.
              Usage metrics reset at midnight Asia/Manila.
            </div>
          </dl>
        </section>

        {/* Authentication & Session Info */}
        <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Users className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink)]">
              User Session & Accounts
            </h2>
          </div>

          <dl className="mt-4 divide-y divide-[var(--color-line)] text-sm">
            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Active User</dt>
              <dd className="font-semibold text-[var(--color-ink)]">
                {session.user.name} ({session.user.email})
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Session Role</dt>
              <dd>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    session.user.role === 'admin'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  {session.user.role ?? 'staff'}
                </span>
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Seed Accounts</dt>
              <dd className="text-right text-xs">
                <div><span className="font-semibold text-[var(--color-ink)]">owner@thecaesura.local</span> (Admin)</div>
                <div className="text-[var(--color-ink-muted)]">staff@thecaesura.local (Staff)</div>
              </dd>
            </div>

            <div className="py-3 flex items-center justify-between">
              <dt className="text-[var(--color-ink-muted)]">Database Engine</dt>
              <dd className="flex items-center gap-1.5 font-medium text-[var(--color-ink)]">
                <Database className="h-4 w-4 text-[var(--color-primary)]" />
                <span>PostgreSQL 17</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}


