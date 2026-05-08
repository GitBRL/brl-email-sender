import type { ContactStatus } from '@/types';
import { cn } from '@/lib/utils';

const STYLES: Record<ContactStatus, string> = {
  subscribed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  unsubscribed: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
  bounced: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

export function StatusBadge({ status, className }: { status: ContactStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        STYLES[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
