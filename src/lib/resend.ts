import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY!);

/** Default From address (e.g. noreply@mail.brleducacao.com.br). */
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL!;
/** Default From name shown in inboxes. */
export const FROM_NAME = 'BRL Educação';

/** App URL used to build tracking links inside emails. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
