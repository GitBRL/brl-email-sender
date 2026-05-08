import Link from 'next/link';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === 'signup' ? 'signup' : 'login';
  return (
    <main className="min-h-screen grid place-items-center bg-brl-bg px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-zinc-200 p-8 space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="inline-block w-3 h-3 rounded-sm bg-brl-yellow" />
            <span className="text-sm font-semibold text-brl-dark">BRL Email</span>
          </div>
          <h1 className="text-2xl font-bold">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === 'signup'
              ? 'Use your work email. An admin must grant access after sign-up.'
              : 'Welcome back to BRL Educação.'}
          </p>
        </div>

        <LoginForm mode={mode} initialError={params.error ?? null} />

        <div className="text-xs text-zinc-500 text-center">
          {mode === 'signup' ? (
            <Link className="hover:text-brl-dark underline" href="/login">
              Already have an account? Sign in
            </Link>
          ) : (
            <Link className="hover:text-brl-dark underline" href="/login?mode=signup">
              Need an account? Sign up
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
