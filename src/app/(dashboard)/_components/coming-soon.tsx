import { Hammer } from 'lucide-react';

export function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-zinc-500 mt-1">{description}</p>

      <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-10 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-brl-yellow/20 grid place-items-center mb-4">
          <Hammer size={20} className="text-brl-dark" />
        </div>
        <div className="text-sm font-semibold">Under construction</div>
        <div className="text-xs text-zinc-500 mt-1">
          This module is planned for <span className="font-medium text-brl-dark">{phase}</span>.
        </div>
      </div>
    </div>
  );
}
