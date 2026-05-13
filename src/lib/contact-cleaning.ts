/**
 * Contact-data cleaning rules applied between CSV mapping and DB insert.
 *
 * Goals (per ops requirements):
 *   - No duplicates within the upload (email is the natural key)
 *   - Uniform formats (lowercase emails, normalised phones, title-cased names)
 *   - Handled missing data (skip rows without an email; preserve later-row
 *     values when merging duplicates so partial rows can be completed)
 *   - Corrected errors (auto-fix common email-domain typos, trim whitespace,
 *     handle PT-BR particles in names, reject obvious junk)
 *   - Reduced noise (drop rows that look like test entries or filler)
 *
 * All functions are pure — they take input strings/rows, return a cleaned
 * value plus a structured report of every change so the operator can audit
 * before committing the import.
 */

export type RawRow = {
  email?: string;
  name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  tag?: string;
  status?: string;
  custom_fields?: Record<string, string>;
};

/**
 * Split a full name at the first whitespace into (first, last).
 *  - "Maria Silva"           → { first: "Maria",  last: "Silva" }
 *  - "Maria das Graças Lima" → { first: "Maria",  last: "das Graças Lima" }
 *  - "Madonna"               → { first: "Madonna", last: undefined }
 *  - "  "                    → { first: undefined, last: undefined }
 *
 * Used by the CSV importer when the user toggles "Split Name into First/Last"
 * on a single Name column. Leading/trailing whitespace stripped on both sides.
 */
export function splitFullName(full: string | undefined | null): { first?: string; last?: string } {
  if (!full) return {};
  const trimmed = full.trim();
  if (!trimmed) return {};
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { first: trimmed };
  return {
    first: trimmed.slice(0, idx).trim(),
    last: trimmed.slice(idx + 1).trim() || undefined,
  };
}

export type CleanRow = RawRow & {
  email: string; // post-clean, always set (rows without email are dropped)
};

export type CleaningReport = {
  totalIn: number;
  totalOut: number;
  /** Rows skipped because email was missing or unrecoverable. */
  invalidEmails: Array<{ rowIndex: number; original: string; reason: string }>;
  /** Rows skipped as junk (test entries, filler). */
  junkSkipped: Array<{ rowIndex: number; original: string }>;
  /** Email-domain typos auto-corrected. */
  emailsFixed: Array<{ rowIndex: number; from: string; to: string }>;
  /** Phones reformatted (with country code, etc). */
  phonesNormalized: number;
  /** Phones discarded as invalid. */
  phonesDropped: Array<{ rowIndex: number; original: string }>;
  /** Names that received title-case / whitespace normalisation. */
  namesNormalized: number;
  /** Tag synonyms that were mapped (quente → hot, etc). */
  tagsMapped: Array<{ rowIndex: number; from: string; to: string }>;
  /** Status synonyms that were mapped (inscrito → subscribed, etc). */
  statusesMapped: Array<{ rowIndex: number; from: string; to: string }>;
  /** Duplicate rows merged into one (keyed by email). */
  duplicatesMerged: number;
};

// ---------- Email ----------

/**
 * Domain typo dictionary. Conservative — only fix clear typos of major
 * providers. We don't auto-correct things like `gmail.com.br` because
 * those CAN be intentional and an aggressive fix would silently corrupt data.
 */
const EMAIL_DOMAIN_FIXES: Record<string, string> = {
  // gmail
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  // hotmail
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotnail.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  // outlook
  'outloook.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlok.com': 'outlook.com',
  // yahoo
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  // BR-common ISPs
  'uol.com': 'uol.com.br',
  'bol.com': 'bol.com.br',
  'terra.com': 'terra.com.br',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: string): {
  ok: boolean;
  email: string;
  fixed?: { from: string; to: string };
  reason?: string;
} {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) return { ok: false, email: '', reason: 'empty' };
  if (!EMAIL_RE.test(trimmed)) return { ok: false, email: trimmed, reason: 'invalid format' };

  const at = trimmed.lastIndexOf('@');
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Reject obvious junk
  if (local === 'test' && domain === 'test.com') {
    return { ok: false, email: trimmed, reason: 'test placeholder' };
  }

  if (Object.prototype.hasOwnProperty.call(EMAIL_DOMAIN_FIXES, domain)) {
    const fixed = `${local}@${EMAIL_DOMAIN_FIXES[domain]}`;
    return { ok: true, email: fixed, fixed: { from: trimmed, to: fixed } };
  }
  return { ok: true, email: trimmed };
}

// ---------- Phone ----------

/**
 * Normalise to a Brazilian-first format. If digits already look international
 * (start with country code that's not 55), keep digits-only with a leading +.
 */
export function cleanPhone(raw: string): { ok: boolean; phone: string | null } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, phone: null };

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return { ok: true, phone: null };
  // Reject junk: 0000…, 1111…, less than 8 digits, more than 15
  if (digits.length < 8 || digits.length > 15) return { ok: false, phone: null };
  if (/^(\d)\1+$/.test(digits)) return { ok: false, phone: null };
  if (digits === '1234567890' || digits === '0123456789') return { ok: false, phone: null };

  // Already starts with 55 (BR country code)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return { ok: true, phone: `+${digits}` };
  }
  // BR mobile (11) or landline (10) without country code
  if (digits.length === 10 || digits.length === 11) {
    return { ok: true, phone: `+55${digits}` };
  }
  // Otherwise assume the digits include some other country code
  return { ok: true, phone: `+${digits}` };
}

// ---------- Name ----------

/**
 * PT-BR aware title-case. Particles (de, da, do, das, dos, e, di, du, von, van)
 * remain lowercase unless they're the first word.
 */
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'von', 'van', 'der']);

export function cleanName(raw: string): { name: string | null; changed: boolean } {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { name: null, changed: false };

  // Reject obvious junk
  const lc = trimmed.toLowerCase();
  if (lc === 'test' || lc === 'lorem ipsum' || /^[^a-zA-ZÀ-ÿ]+$/.test(trimmed)) {
    return { name: null, changed: trimmed.length > 0 };
  }

  const words = trimmed.split(' ');
  const cased = words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && PARTICLES.has(lower)) return lower;
      // Handle hyphenated names (Maria-Clara)
      return lower
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join('-');
    })
    .join(' ');

  return { name: cased, changed: cased !== trimmed };
}

// ---------- Company ----------

export function cleanCompany(raw: string): { company: string | null; changed: boolean } {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { company: null, changed: false };

  // Don't aggressively case-fix companies (e.g. IBM, eBay should stay as-is).
  // We only normalise obvious all-caps inputs and a few BR-specific suffixes.
  let out = trimmed;
  // Normalise legal-entity suffixes
  out = out
    .replace(/\bLTDA\.?$/i, 'Ltda.')
    .replace(/\bME\.?$/i, 'ME')
    .replace(/\bSA\.?$/i, 'S.A.')
    .replace(/\bEIRELI\.?$/i, 'Eireli');
  // If the whole thing was caps, title-case it
  if (out === out.toUpperCase() && /[A-Z]/.test(out)) {
    out = out
      .toLowerCase()
      .split(' ')
      .map((w) => (PARTICLES.has(w) ? w : w[0]?.toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return { company: out, changed: out !== trimmed };
}

// ---------- Tag / Status synonyms ----------

const TAG_MAP: Record<string, 'hot' | 'warm' | 'cold'> = {
  hot: 'hot',
  quente: 'hot',
  vip: 'hot',
  premium: 'hot',
  warm: 'warm',
  morno: 'warm',
  medio: 'warm',
  médio: 'warm',
  cold: 'cold',
  frio: 'cold',
  novo: 'cold',
  lead: 'cold',
};

export function cleanTag(raw: string): {
  tag: 'hot' | 'warm' | 'cold' | null;
  mapped?: { from: string; to: string };
} {
  const lc = (raw ?? '').trim().toLowerCase();
  if (!lc) return { tag: null };
  if (lc in TAG_MAP) {
    const mapped = TAG_MAP[lc];
    return mapped !== lc
      ? { tag: mapped, mapped: { from: lc, to: mapped } }
      : { tag: mapped };
  }
  return { tag: null };
}

const STATUS_MAP: Record<string, 'subscribed' | 'unsubscribed' | 'bounced'> = {
  subscribed: 'subscribed',
  inscrito: 'subscribed',
  ativo: 'subscribed',
  active: 'subscribed',
  yes: 'subscribed',
  sim: 'subscribed',
  s: 'subscribed',
  '1': 'subscribed',
  unsubscribed: 'unsubscribed',
  cancelado: 'unsubscribed',
  descadastrado: 'unsubscribed',
  inactive: 'unsubscribed',
  no: 'unsubscribed',
  nao: 'unsubscribed',
  não: 'unsubscribed',
  n: 'unsubscribed',
  '0': 'unsubscribed',
  bounced: 'bounced',
  retornou: 'bounced',
};

export function cleanStatus(raw: string): {
  status: 'subscribed' | 'unsubscribed' | 'bounced' | null;
  mapped?: { from: string; to: string };
} {
  const lc = (raw ?? '').trim().toLowerCase();
  if (!lc) return { status: null };
  if (lc in STATUS_MAP) {
    const mapped = STATUS_MAP[lc];
    return mapped !== lc
      ? { status: mapped, mapped: { from: lc, to: mapped } }
      : { status: mapped };
  }
  return { status: null };
}

// ---------- Junk row detector ----------

function isJunk(row: RawRow): boolean {
  const email = (row.email ?? '').toLowerCase().trim();
  const name = (row.name ?? '').toLowerCase().trim();
  if (!email) return false; // handled separately as invalid

  if (email.startsWith('noreply@') || email.startsWith('no-reply@')) return true;
  if (email.startsWith('test@') && email.endsWith('@test.com')) return true;
  if (email === 'admin@example.com' || email === 'user@example.com') return true;
  if (email.includes('lorem') || email.includes('ipsum')) return true;
  if (name === 'lorem ipsum' || name === 'john doe' || name === 'jane doe') return true;

  return false;
}

// ---------- Main entry point ----------

export function cleanRows(rows: RawRow[]): {
  cleaned: CleanRow[];
  report: CleaningReport;
} {
  const report: CleaningReport = {
    totalIn: rows.length,
    totalOut: 0,
    invalidEmails: [],
    junkSkipped: [],
    emailsFixed: [],
    phonesNormalized: 0,
    phonesDropped: [],
    namesNormalized: 0,
    tagsMapped: [],
    statusesMapped: [],
    duplicatesMerged: 0,
  };

  // Pass 1: clean each row individually
  const stage1: Array<{ rowIndex: number; row: CleanRow }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // Email
    const e = cleanEmail(r.email ?? '');
    if (!e.ok) {
      report.invalidEmails.push({ rowIndex: i, original: r.email ?? '', reason: e.reason ?? 'invalid' });
      continue;
    }
    if (e.fixed) report.emailsFixed.push({ rowIndex: i, from: e.fixed.from, to: e.fixed.to });

    // Junk check after email is canonicalised
    if (isJunk({ ...r, email: e.email })) {
      report.junkSkipped.push({ rowIndex: i, original: r.email ?? '' });
      continue;
    }

    const cleaned: CleanRow = { ...r, email: e.email };

    // Phone
    if (r.phone) {
      const p = cleanPhone(r.phone);
      if (!p.ok) report.phonesDropped.push({ rowIndex: i, original: r.phone });
      else if (p.phone && p.phone !== r.phone) {
        cleaned.phone = p.phone;
        report.phonesNormalized++;
      } else if (p.phone) {
        cleaned.phone = p.phone;
      } else {
        cleaned.phone = undefined;
      }
    }

    // Name
    if (r.name) {
      const n = cleanName(r.name);
      if (n.changed) report.namesNormalized++;
      cleaned.name = n.name ?? undefined;
    }

    // Company
    if (r.company) {
      const c = cleanCompany(r.company);
      cleaned.company = c.company ?? undefined;
    }

    // Tag
    if (r.tag) {
      const t = cleanTag(r.tag);
      if (t.tag) {
        cleaned.tag = t.tag;
        if (t.mapped) report.tagsMapped.push({ rowIndex: i, ...t.mapped });
      } else {
        // Unmapped value — drop so it doesn't fail the enum at DB level
        cleaned.tag = undefined;
      }
    }

    // Status
    if (r.status) {
      const s = cleanStatus(r.status);
      if (s.status) {
        cleaned.status = s.status;
        if (s.mapped) report.statusesMapped.push({ rowIndex: i, ...s.mapped });
      } else {
        cleaned.status = undefined;
      }
    }

    stage1.push({ rowIndex: i, row: cleaned });
  }

  // Pass 2: dedupe by email — merge custom_fields, prefer first non-empty for primary fields
  const byEmail = new Map<string, CleanRow>();
  for (const { row } of stage1) {
    const existing = byEmail.get(row.email);
    if (!existing) {
      byEmail.set(row.email, { ...row, custom_fields: { ...(row.custom_fields ?? {}) } });
      continue;
    }
    report.duplicatesMerged++;
    // Merge: existing wins for primary fields if non-empty; custom_fields shallow-merge with new overriding
    existing.name = existing.name || row.name;
    existing.phone = existing.phone || row.phone;
    existing.company = existing.company || row.company;
    existing.tag = existing.tag || row.tag;
    existing.status = existing.status || row.status;
    existing.custom_fields = { ...(existing.custom_fields ?? {}), ...(row.custom_fields ?? {}) };
  }

  const cleaned = Array.from(byEmail.values());
  report.totalOut = cleaned.length;
  return { cleaned, report };
}
