import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md';
}

export function Button({ className, variant = 'default', size = 'md', type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3' : 'h-9 px-4',
        variant === 'default' && 'bg-strong text-inverted hover:bg-strong-hover',
        variant === 'outline' && 'border border-border bg-surface hover:bg-muted',
        variant === 'destructive' && 'bg-destructive text-inverted hover:bg-destructive-hover',
        variant === 'ghost' && 'hover:bg-muted',
        className,
      )}
      {...props}
    />
  );
}
