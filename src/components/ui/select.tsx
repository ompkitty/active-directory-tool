import * as React from 'react';
import { cn } from '@/lib/utils';

// Minimal native-select wrapper styled for the monochrome admin console.
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm',
        'focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
      {...props}
    />
  );
}

// Compatibility re-exports so existing imports keep working.
export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function SelectItem({ children, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props}>{children}</option>;
}
export function SelectTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function SelectValue({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
