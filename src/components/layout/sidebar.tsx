'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/connections', label: 'Connections' },
  { href: '/users', label: 'Users' },
  { href: '/directory', label: 'Directory' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-subtle bg-surface">
      <div className="shrink-0 border-b border-subtle px-4 py-4">
        <p className="text-sm font-semibold">Active Directory Tool</p>
        <p className="mt-0.5 text-xs text-muted-foreground">LDAPS admin console</p>
      </div>
      <nav aria-label="Primary" className="flex shrink-0 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm',
                active ? 'bg-strong font-medium text-inverted' : 'text-foreground-muted hover:bg-muted',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto shrink-0 space-y-2 border-t border-subtle p-3">
        <p className="text-xs text-muted-foreground">
          Development-only. Authentication is the AD bind.
        </p>
        <ThemeToggle />
      </div>
    </aside>
  );
}
