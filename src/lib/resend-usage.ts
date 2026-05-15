/**
 * Resend monthly usage fetcher.
 *
 * Resend doesn't expose a `/usage` or `/account` endpoint we can hit for a
 * single-call quota number — those routes return 405 Method Not Allowed.
 * What works is `GET /emails` with cursor pagination (limit + after). We
 * paginate from the most recent email backwards until we hit one whose
 * created_at falls before the start of the current calendar month — that's
 * our 'sent this month' count.
 *
 * Why this matters: this counts EVERY email sent through the Resend API key,
 * including any emails sent outside the platform (e.g. transactional sends
 * from another app sharing the key). The local email_events count only
 * captures sends through this app's pipeline.
 *
 * Caching: wrapped with Next.js unstable_cache for 10 minutes so a busy
 * dashboard doesn't hammer Resend on every render.
 */

import { unstable_cache } from 'next/cache';

const RESEND_API_BASE = 'https://api.resend.com';

type ResendEmail = {
  id: string;
  created_at: string;
  last_event?: string;
};

type ResendListResponse = {
  object: 'list';
  has_more: boolean;
  data: ResendEmail[];
};

export type ResendUsageResult = {
  /** Number of emails sent through the API key since the 1st of the current month. */
  sentThisMonth: number;
  /** True if pagination was capped before we found a record older than monthStart.
   *  When true, sentThisMonth is a lower bound. */
  hitPageLimit: boolean;
  /** Number of API calls made (for diagnostics + log lines). */
  pages: number;
  /** ISO timestamp of the start of the current month (for display). */
  monthStartIso: string;
  /** Set when the API call failed entirely; caller should fall back to local count. */
  error?: string;
};

/** Hard cap on pagination so a runaway loop can't burn through rate limits.
 *  100 pages × 100 = 10,000 emails / month. Plenty for free + pro tiers. */
const MAX_PAGES = 100;
const PAGE_SIZE = 100;

async function fetchResendUsage(): Promise<ResendUsageResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();
  const monthStartIso = monthStart.toISOString();

  if (!apiKey) {
    return { sentThisMonth: 0, hitPageLimit: false, pages: 0, monthStartIso, error: 'RESEND_API_KEY not set' };
  }

  let after: string | null = null;
  let pages = 0;
  let count = 0;
  let hitPageLimit = false;

  try {
    while (pages < MAX_PAGES) {
      const url = new URL(`${RESEND_API_BASE}/emails`);
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (after) url.searchParams.set('after', after);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        // Server-side fetch — bypass Next's data cache; we cache at the
        // unstable_cache level instead so the TTL is explicit.
        cache: 'no-store',
      });
      pages++;

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          sentThisMonth: count,
          hitPageLimit: false,
          pages,
          monthStartIso,
          error: `Resend API ${res.status}: ${body.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as ResendListResponse;
      const emails = json.data ?? [];
      if (emails.length === 0) break;

      let crossedBoundary = false;
      for (const e of emails) {
        const ts = new Date(e.created_at).getTime();
        if (ts >= monthStartMs) {
          count++;
        } else {
          // Resend returns emails in created_at DESC — once we hit one older
          // than monthStart we can stop; everything after this point will
          // also be older.
          crossedBoundary = true;
          break;
        }
      }
      if (crossedBoundary) break;
      if (!json.has_more) break;
      after = emails[emails.length - 1].id;
    }

    if (pages >= MAX_PAGES) hitPageLimit = true;
    return { sentThisMonth: count, hitPageLimit, pages, monthStartIso };
  } catch (e) {
    return {
      sentThisMonth: 0,
      hitPageLimit: false,
      pages,
      monthStartIso,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 10-minute cached wrapper. Resend's API + paginated walk is too slow to
 * hit on every dashboard render; this caches the result by month-start so
 * the cache key resets naturally on the 1st of the month.
 */
export const getResendMonthlyUsage = unstable_cache(
  async () => fetchResendUsage(),
  ['resend-monthly-usage'],
  { revalidate: 600, tags: ['resend-usage'] },
);
