import type { ContactTag } from '@/types';
import { cn } from '@/lib/utils';

const STYLES: Record<ContactTag, string> = {
  hot: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  warm: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  cold: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const DOT: Record<ContactTag, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-500',
  cold: 'bg-blue-500',
};

export function TagBadge({ tag, className }: { tag: ContactTag; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        STYLES[tag],
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', DOT[tag])} />
      {tag}
    </span>
  );
}
