import { cn } from '@/lib/cn';
import { estimateStrength } from '@/lib/password';

const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
const text = ['text-rose-600', 'text-rose-600', 'text-amber-600', 'text-lime-700', 'text-emerald-600'];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = estimateStrength(password);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', password && score >= i ? colors[score] : 'bg-slate-200')} />
        ))}
      </div>
      {password && (
        <p className="mt-1.5 text-xs text-slate-500">
          Strength: <span className={cn('font-medium', text[score])}>{label}</span>
        </p>
      )}
    </div>
  );
}
