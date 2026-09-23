import { cn } from '@/lib/utils';

export function Alert({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn('rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm', className)}>
      {children}
    </div>
  );
}
