'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  ClipboardList,
  Layers,
  MinusCircle,
  PackagePlus,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';

interface NavBarProps {
  user: {
    name: string;
    role?: string | null;
  };
}

const navItems = [
  { href: '/today', label: 'Today', icon: Calendar },
  { href: '/receive', label: 'Receive', icon: PackagePlus },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/use', label: 'Use', icon: MinusCircle },
  { href: '/waste', label: 'Waste', icon: Trash2 },
  { href: '/catalogue', label: 'Catalogue', icon: Layers },
  { href: '/suppliers', label: 'Suppliers', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function NavBar({ user }: NavBarProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-panel)] shadow-xs">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-6">
          <Link
            href="/today"
            className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--color-ink)] hover:text-[var(--color-primary)] transition-colors"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--color-primary)] text-xs font-black text-white">
              TC
            </span>
            <span>The Caesura</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/today' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-[var(--radius-field)] px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--color-paper)] text-[var(--color-primary)] font-semibold shadow-xs'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline font-medium text-[var(--color-ink)]">
              {user.name}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                user.role === 'admin'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              {user.role ?? 'staff'}
            </span>
          </div>
          <SignOutButton />
        </div>
      </div>

      {/* Mobile nav bar */}
      <nav className="flex md:hidden overflow-x-auto border-t border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/today' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-paper)] text-[var(--color-primary)] font-semibold'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

