'use client';

import { useActionState } from 'react';
import { UserPlus } from 'lucide-react';
import { inviteMember, type ActionState } from './actions';

const initialState: ActionState = { ok: false };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initialState);

  return (
    <form action={action} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          placeholder="newuser@brleducacao.com.br"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
          Name (optional)
        </label>
        <input
          type="text"
          name="name"
          placeholder="Maria Silva"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
          Role
        </label>
        <select
          name="role"
          defaultValue="viewer"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
      >
        <UserPlus size={14} />
        {pending ? 'Sending…' : 'Send invite'}
      </button>
      {state.error && (
        <div className="md:col-span-4 text-xs text-red-600">{state.error}</div>
      )}
      {state.info && (
        <div className="md:col-span-4 text-xs text-emerald-700">{state.info}</div>
      )}
    </form>
  );
}
