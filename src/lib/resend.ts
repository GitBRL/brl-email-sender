import { Resend } from 'resend';

// Lazy singleton — avoids instantiating at module-load time, which would
// throw during Next.js's "Collecting page data" build phase if the env
// var isn't loaded yet (and lets us defer the error to actual send time).
let _client: Resend | null = null;
function getClient(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY env var is not set');
    _client = new Resend(key);
  }
  return _client;
}
export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return Reflect.get(getClient() as object, prop, getClient());
  },
});

// Parse RESEND_FROM ("Name <email@x>" or just "email@x") into name + email.
function parseFrom(raw: string | undefined): { name: string; email: string } {
  if (!raw) return { name: 'BRL Educação', email: '' };
  const m = raw.match(/^\s*(.*?)\s*<(.+?)>\s*$/);
  if (m) return { name: m[1].trim() || 'BRL Educação', email: m[2].trim() };
  return { name: 'BRL Educação', email: raw.trim() };
}
const _from = parseFrom(process.env.RESEND_FROM ?? process.env.RESEND_FROM_EMAIL);

/** Default From address (e.g. noreply@mail.brleducacao.com.br). */
export const FROM_EMAIL = _from.email;
/** Default From name shown in inboxes. */
export const FROM_NAME = _from.name;

/** App URL used to build tracking links inside emails. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
