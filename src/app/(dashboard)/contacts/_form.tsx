'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createContact, type ActionState } from './actions';
import type { Contact, ContactStatus, ContactTag } from '@/types';

const initial: ActionState = { ok: false };

export function ContactForm({ initialData }: { initialData?: Partial<Contact> }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createContact, initial);

  useEffect(() => {
    if (state.ok) {
      router.push('/contacts');
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={action} className="bg-white rounded-lg border border-zinc-200 p-6 space-y-4">
      <Field label="Email" required>
        <input
          type="email"
          name="email"
          required
          defaultValue={initialData?.email ?? ''}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      </Field>
      <Field label="Name">
        <input
          type="text"
          name="name"
          defaultValue={initialData?.name ?? ''}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <input
            type="tel"
            name="phone"
            defaultValue={initialData?.phone ?? ''}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
          />
        </Field>
        <Field label="Company">
          <input
            type="text"
            name="company"
            defaultValue={initialData?.company ?? ''}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tag">
          <select
            name="tag"
            defaultValue={(initialData?.tag as ContactTag) ?? 'cold'}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize"
          >
            <option value="hot">hot</option>
            <option value="warm">warm</option>
            <option value="cold">cold</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            name="status"
            defaultValue={(initialData?.status as ContactStatus) ?? 'subscribed'}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize"
          >
            <option value="subscribed">subscribed</option>
            <option value="unsubscribed">unsubscribed</option>
            <option value="bounced">bounced</option>
          </select>
        </Field>
      </div>

      {state.error && (
        <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save contact'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-600 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
