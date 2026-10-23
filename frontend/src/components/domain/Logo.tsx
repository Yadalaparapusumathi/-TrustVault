import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#dcf98b" />
      <path d="M16 6l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V9l8-3z" fill="none" stroke="#173d32" strokeWidth="2" strokeLinejoin="round" />
      <rect x="12.5" y="14" width="7" height="6" rx="1.2" fill="#173d32" />
      <path d="M14 14v-1.5a2 2 0 014 0V14" fill="none" stroke="#173d32" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('font-display text-xl font-semibold tracking-[-0.05em]', inverted ? 'text-white' : 'text-ink')}>TrustVault<span className="text-brand-400">.</span></span>
    </span>
  );
}
