import { cn } from '@/lib/utils';

export function Alert({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn('rounded-md border border-border bg-muted px-3 py-2 text-sm', className)}>
      {children}
    </div>
  );
}
