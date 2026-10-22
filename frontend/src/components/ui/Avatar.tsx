import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const palettes = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, seed, size = 'md', className }: { name: string; seed?: string; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const dims =
    size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-white',
        palettes[hash(seed ?? name) % palettes.length],
        dims,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
