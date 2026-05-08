'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to view that page.",
  not_allowed: 'Your account has not been granted access yet.',
  auth_failed: 'Authentication failed, please try again.',
  profile_missing: 'Your account is missing a profile. Please sign in again.',
};

export function LoginForm({
  mode,
  initialError,
}: {
  mode: 'login' | 'signup';
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(
    initialError ? (ERRORS[initialError] ?? initialError) : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setError(error.message);
      } else {
        setInfo(
          'Account created. Check your email to confirm, then ask an admin to grant access.',
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {mode === 'signup' && (
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
        />
      )}
      <input
        type="email"
        required
        placeholder="you@brleducacao.com.br"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark"
      />
      {error && (
        <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">
          {error}
        </p>
      )}
      {info && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
          {info}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50 transition"
      >
        {loading
          ? mode === 'signup'
            ? 'Creating account…'
            : 'Signing in…'
          : mode === 'signup'
          ? 'Sign up'
          : 'Sign in'}
      </button>
    </form>
  );
}
