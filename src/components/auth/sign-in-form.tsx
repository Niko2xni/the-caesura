'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from '@/lib/auth-client';

interface SignInFormProps {
  demoMode: boolean;
}

export function SignInForm({ demoMode }: SignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('reason') === 'expired';

  const [isOwnerFormOpen, setIsOwnerFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGuestSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signIn.anonymous();
      if (res.error) {
        setErrorMessage(res.error.message || 'Guest sign-in failed. Please try again.');
        return;
      }
      router.push('/today');
      router.refresh();
    } catch {
      setErrorMessage('A network error occurred while starting your guest session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnerSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signIn.email({
        email,
        password,
      });
      if (res.error) {
        setErrorMessage(res.error.message || 'Invalid email or password.');
        return;
      }
      router.push('/today');
      router.refresh();
    } catch {
      setErrorMessage('A network error occurred while signing in.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          The Caesura
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Café back-of-house inventory & batch tracking
        </p>
      </div>

      {sessionExpired && (
        <div className="mb-4 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-sm text-[var(--color-ink)]">
          Your guest session ended. Start a new one.
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-[var(--radius-field)] border border-[var(--color-expired)] bg-[var(--color-expired-bg)] p-3 text-sm text-[var(--color-expired-ink)]">
          {errorMessage}
        </div>
      )}

      {demoMode && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGuestSignIn}
            disabled={isLoading}
            className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-field)] bg-[var(--color-primary)] px-4 py-2 text-base font-medium text-[var(--color-primary-ink)] transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {isLoading ? 'Starting session…' : 'Try as a guest'}
          </button>
          <p className="text-center text-xs text-[var(--color-ink-muted)]">
            Instant temporary account. Everyone shares the demo data, reset every night.
          </p>
        </div>
      )}

      {demoMode && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsOwnerFormOpen((prev) => !prev)}
            className="text-sm font-medium text-[var(--color-ink-muted)] underline-offset-4 hover:underline"
          >
            {isOwnerFormOpen ? 'Close owner sign in' : 'Owner sign in'}
          </button>
        </div>
      )}

      {(!demoMode || isOwnerFormOpen) && (
        <form onSubmit={handleOwnerSignIn} className={`${demoMode ? 'mt-4 border-t border-[var(--color-line)] pt-4' : ''} space-y-4`}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-ink)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block min-h-[44px] w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-base text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--color-ink)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block min-h-[44px] w-full rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-base text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-field)] border border-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-2 text-base font-medium text-[var(--color-primary)] transition-opacity hover:bg-[var(--color-paper)] disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign in as owner'}
          </button>
        </form>
      )}
    </div>
  );
}

