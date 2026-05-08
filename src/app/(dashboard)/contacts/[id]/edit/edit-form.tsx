'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateContact } from '../../actions';
import type { Contact, ContactStatus, ContactTag } from '@/types';

export function EditContactForm({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: contact.name ?? '',
    phone: contact.phone ?? '',
    company: contact.company ?? '',
    tag: contact.tag as ContactTag,
    status: contact.status as ContactStatus,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await updateContact(contact.id, form);
      if (!res.ok) {
        setError(res.error ?? 'Failed to save');
      } else {
        router.push(`/contacts/${contact.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-lg border border-zinc-200 p-6 space-y-4">
      <Field label="Email">
        <input
          type="email"
          value={contact.email}
          disabled
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
        />
        <p className="text-xs text-zinc-400 mt-1">Email cannot be changed. Delete and re-add to update.</p>
      </Field>
      <Field label="Name">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
          />
        </Field>
        <Field label="Company">
          <input
            type="text"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tag">
          <select
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value as ContactTag })}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize"
          >
            <option value="hot">hot</option>
            <option value="warm">warm</option>
            <option value="cold">cold</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ContactStatus })}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize"
          >
            <option value="subscribed">subscribed</option>
            <option value="unsubscribed">unsubscribed</option>
            <option value="bounced">bounced</option>
          </select>
        </Field>
      </div>

      {error && <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
