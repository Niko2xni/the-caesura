import { redirect } from 'next/navigation';
import { requireSession } from '@/server/auth/guards';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let sessionData;
  try {
    sessionData = await requireSession();
  } catch {
    redirect('/sign-in');
  }

  const { user } = sessionData;

  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--color-ink)]">
              The Caesura
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-ink)] font-medium">{user.name}</span>
            <span className="rounded bg-[var(--color-paper)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)] border border-[var(--color-line)]">
              {user.role ?? 'staff'}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 md:p-6">{children}</main>
    </div>
  );
}

