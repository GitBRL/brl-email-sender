'use client';

import { useState, useTransition } from 'react';
import { changeUserRole } from './actions';

type Role = 'admin' | 'editor' | 'viewer';

export function RoleSelect({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: Role;
  isSelf: boolean;
}) {
  const [role, setRole] = useState<Role>(currentRole);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: Role) {
    setError(null);
    const prev = role;
    setRole(next);
    start(async () => {
      const res = await changeUserRole(userId, next);
      if (!res.ok) {
        setError(res.error ?? 'Failed to update role.');
        setRole(prev);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={role}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as Role)}
        className={`rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium uppercase tracking-wide ${
          pending ? 'opacity-50' : ''
        }`}
      >
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      {isSelf && (
        <span className="text-[9px] text-zinc-400">Cannot demote yourself</span>
      )}
      {error && <span className="text-[10px] text-red-600 max-w-[200px]">{error}</span>}
    </div>
  );
}
