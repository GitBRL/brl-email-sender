'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Pill-style tags input. Type a tag and press Enter or comma to commit it.
 * Backspace on an empty input removes the last pill. Click X on a pill to
 * remove it. Tags are normalised (lowercased, trimmed, deduped) on commit.
 *
 * The component renders a hidden <input name={name}> with the comma-joined
 * tag list so the surrounding <form> picks it up on submit (no extra JS
 * needed in the parent).
 */
export function TagsInput({
  name,
  defaultValue = [],
  placeholder = 'origem, persona, evento…',
  suggestions = [],
}: {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  /** Optional list of existing tags across all lists — shown as suggestions
   *  when the input is focused so the operator reuses tags consistently. */
  suggestions?: string[];
}) {
  const [tags, setTags] = useState<string[]>(() =>
    Array.from(new Set(defaultValue.map((t) => t.trim().toLowerCase()).filter(Boolean))).sort(),
  );
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commit(value: string) {
    const normalised = value.trim().toLowerCase();
    if (!normalised || normalised.length > 40) return;
    if (tags.includes(normalised)) {
      setDraft('');
      return;
    }
    setTags((prev) => Array.from(new Set([...prev, normalised])).sort());
    setDraft('');
  }

  function remove(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      remove(tags[tags.length - 1]);
    }
  }

  // Suggestions: existing tags not already on this list, filtered by current draft
  const suggestionsAvailable = suggestions
    .filter((s) => !tags.includes(s))
    .filter((s) => !draft || s.includes(draft.toLowerCase().trim()))
    .slice(0, 8);

  // Keep the hidden input in sync — also called on every render
  useEffect(() => {
    // No-op effect that ensures the value stays current with state
  }, [tags]);

  return (
    <div>
      <div
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 flex flex-wrap items-center gap-1 cursor-text focus-within:border-brl-dark min-h-[2.5rem]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-brl-yellow/30 text-brl-dark text-xs px-2 py-0.5"
          >
            {t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="hover:bg-black/10 rounded-full w-4 h-4 grid place-items-center"
              aria-label={`Remover ${t}`}
              tabIndex={-1}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(',', ''))}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          // Delay so click on a suggestion fires before the panel closes
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[8rem] outline-none border-0 bg-transparent text-sm py-0.5"
        />
      </div>
      {/* Suggestions panel */}
      {focused && suggestionsAvailable.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="text-[10px] text-zinc-500 mr-1 mt-0.5">Reutilizar:</span>
          {suggestionsAvailable.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] px-2 py-0.5"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-zinc-500">
        Pressione Enter ou vírgula para adicionar. Use para identificar origem (ex. <code>instagram</code>),
        persona (ex. <code>vendas</code>) ou evento (ex. <code>webinar-jan</code>).
      </p>

      {/* Hidden input that the parent <form action> reads on submit */}
      <input type="hidden" name={name} value={tags.join(',')} />
    </div>
  );
}
