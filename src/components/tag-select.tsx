'use client';

import { useState, useTransition } from 'react';
import type { ContactTag } from '@/types';
import { updateContact } from '@/app/(dashboard)/contacts/actions';
import { cn } from '@/lib/utils';

const TAGS: ContactTag[] = ['hot', 'warm', 'cold'];

const DOT: Record<ContactTag, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-500',
  cold: 'bg-blue-500',
};

const RING: Record<ContactTag, string> = {
  hot: 'ring-red-200 bg-red-50 text-red-700',
  warm: 'ring-amber-200 bg-amber-50 text-amber-700',
  cold: 'ring-blue-200 bg-blue-50 text-blue-700',
};

export function TagSelect({ contactId, value }: { contactId: string; value: ContactTag }) {
  const [tag, setTag] = useState<ContactTag>(value);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ContactTag;
    const prev = tag;
    setTag(next);
    setErr(null);
    start(async () => {
      const res = await updateContact(contactId, { tag: next });
      if (!res.ok) {
        setTag(prev);
        setErr(res.error ?? 'Failed to update');
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', DOT[tag])} aria-hidden />
      <select
        value={tag}
        onChange={onChange}
        disabled={pending}
        className={cn(
          'appearance-none rounded-full pl-2 pr-6 py-0.5 text-xs font-medium capitalize ring-1 outline-none cursor-pointer',
          'bg-no-repeat bg-[right_0.4rem_center] bg-[length:0.7em]',
          "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/></svg>\")]",
          RING[tag],
          pending && 'opacity-60',
        )}
        aria-label="Change tag"
      >
        {TAGS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
