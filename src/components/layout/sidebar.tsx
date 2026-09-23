'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/connections', label: 'Connections' },
  { href: '/users', label: 'Users' },
  { href: '/directory', label: 'Directory' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-4">
        <p className="text-sm font-semibold">Active Directory Tool</p>
        <p className="mt-0.5 text-xs text-neutral-500">LDAPS admin console</p>
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm',
                active ? 'bg-neutral-900 font-medium text-white' : 'text-neutral-700 hover:bg-neutral-100',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-neutral-200 p-3">
        <p className="text-xs text-neutral-500">Development-only build. No web authentication yet.</p>
      </div>
    </aside>
  );
}
