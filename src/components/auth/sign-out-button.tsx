'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/sign-in');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="whitespace-nowrap shrink-0 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] underline-offset-4 hover:underline"
    >
      Sign out
    </button>
  );
}

