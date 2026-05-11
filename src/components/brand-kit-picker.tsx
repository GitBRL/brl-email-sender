'use client';

import { Check } from 'lucide-react';
import type { BrandKit } from '@/lib/brand-kits';

/**
 * Responsive card grid of brand kits. Used in the campaign wizard step 0
 * and the new-template modal. Visual style per spec:
 *   - 4-column responsive grid
 *   - Header bar in color_primary
 *   - Logo (or product name bold) below
 *   - Color swatch dots (primary, secondary)
 *   - Selected card gets a yellow ring + check mark
 */
export function BrandKitPicker({
  kits,
  selectedId,
  onSelect,
}: {
  kits: BrandKit[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (kits.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">No brand kits available yet.</p>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {kits.map((kit) => {
        const isSelected = kit.id === selectedId;
        return (
          <li key={kit.id}>
            <button
              type="button"
              onClick={() => onSelect(kit.id)}
              aria-pressed={isSelected}
              aria-label={`Selecionar ${kit.name}`}
              className={`relative w-full text-left bg-white rounded-lg border-2 overflow-hidden transition ${
                isSelected
                  ? 'border-brl-yellow ring-2 ring-brl-yellow shadow-md'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              {/* Colored header bar */}
              <div
                className="h-12 flex items-center justify-center px-3 relative"
                style={{ background: kit.color_header_bg }}
              >
                {kit.logo_url ? (
                  <img
                    src={kit.logo_url}
                    alt={kit.name}
                    className="max-h-7 max-w-full object-contain"
                  />
                ) : (
                  <span
                    className="font-bold text-sm tracking-tight truncate"
                    style={{
                      color:
                        kit.color_header_bg.toLowerCase() === '#ffffff'
                          ? kit.color_primary
                          : kit.color_cta_text,
                    }}
                  >
                    {kit.name}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brl-yellow text-brl-dark shadow">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate text-zinc-900">
                    {kit.name}
                  </div>
                  {kit.is_custom && (
                    <span className="inline-block text-[9px] font-medium uppercase tracking-wide text-brl-orange bg-orange-50 px-1.5 py-0.5 rounded mt-0.5">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Swatch color={kit.color_primary} />
                  <Swatch color={kit.color_secondary} />
                  <Swatch color={kit.color_cta_bg} />
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full border border-black/10"
      style={{ background: color }}
      title={color}
    />
  );
}
