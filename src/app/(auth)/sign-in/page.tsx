import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  const isDemoMode = process.env.DEMO_MODE === 'true';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Suspense fallback={<div className="text-sm text-[var(--color-ink-muted)]">Loading…</div>}>
        <SignInForm demoMode={isDemoMode} />
      </Suspense>
    </main>
  );
}

