import { KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Input } from '@/components/ui/Input';
import { generatePassword } from '@/lib/password';

/** Temporary password input with a crypto-strong generator. */
export function TempPasswordInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          invalid={invalid}
          aria-describedby={describedBy}
          autoComplete="new-password"
          spellCheck={false}
          className="font-mono"
          rightSlot={value ? <CopyButton value={value} label="Copy password" /> : undefined}
        />
      </div>
      <Button variant="secondary" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => onChange(generatePassword(20))}>
        Generate
      </Button>
    </div>
  );
}

/** Displays a one-time secret once, with a copy button. */
export function OneTimeSecret({ value, username }: { value: string; username: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">Temporary password for @{username}</p>
            <p className="mt-0.5 text-xs text-amber-800">
              This is shown only once. Share it over a secure channel — the user must change it at first sign-in.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200">
              <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-slate-900">{value}</code>
              <CopyButton value={value} label="Copy password" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
