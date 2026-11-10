import { redirect } from 'next/navigation';
import { requireSession } from '@/server/auth/guards';
import { NavBar } from '@/components/layout/nav-bar';

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
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <NavBar user={{ name: user.name, role: user.role }} />
      <main className="mx-auto max-w-6xl p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
