'use client';

import { useActionState } from 'react';
import { updateAppSettings, type ActionState } from './actions';

const initialState: ActionState = { ok: false };

export type AppSettingsRow = {
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  unsub_heading: string | null;
  unsub_body: string | null;
};

export function DefaultsForm({
  current,
  envFromName,
  envFromEmail,
}: {
  current: AppSettingsRow;
  envFromName: string;
  envFromEmail: string;
}) {
  const [state, action, pending] = useActionState(updateAppSettings, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Default From name"
          name="from_name"
          defaultValue={current.from_name ?? ''}
          placeholder={`Falls back to env: ${envFromName}`}
          hint="Shown in recipient inboxes as the sender's display name."
        />
        <Field
          label="Default From email"
          name="from_email"
          defaultValue={current.from_email ?? ''}
          placeholder={`Falls back to env: ${envFromEmail}`}
          mono
          hint="Must be a verified address on your Resend domain."
        />
        <Field
          label="Default Reply-to"
          name="reply_to"
          defaultValue={current.reply_to ?? ''}
          placeholder="optional — replies go to From if empty"
          mono
        />
      </div>

      <div className="border-t border-zinc-100 pt-5">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-3">
          Unsubscribe page
        </h3>
        <div className="space-y-4">
          <Field
            label="Heading"
            name="unsub_heading"
            defaultValue={current.unsub_heading ?? ''}
            placeholder="Falls back to: You've been unsubscribed."
          />
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
              Body text
            </label>
            <textarea
              name="unsub_body"
              defaultValue={current.unsub_body ?? ''}
              rows={3}
              placeholder="Falls back to a default message explaining the user has been removed from the list."
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs">
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.info && <span className="text-emerald-700">✓ {state.info}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  mono,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm ${mono ? 'font-mono text-xs' : ''}`}
      />
      {hint && <p className="text-[10px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
