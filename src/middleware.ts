import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets, the open pixel, click redirect, and unsubscribe page
    '/((?!_next/static|_next/image|favicon.ico|api/track|api/unsubscribe|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
  ],
};
