import { requireSession } from '@/server/auth/guards';

export default async function TodayPage() {
  const { user } = await requireSession();

  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--color-line)] pb-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Today
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Work list & stock actions
        </p>
      </div>

      <div className="rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-ink)]">
          Phase 0 Foundations Active
        </h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Signed in as <strong className="text-[var(--color-ink)]">{user.name}</strong> ({user.email || 'guest session'}) with role{' '}
          <strong className="text-[var(--color-ink)]">{user.role}</strong>.
        </p>
      </div>
    </div>
  );
}

