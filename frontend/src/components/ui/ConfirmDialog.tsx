import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Input } from './Input';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  loading?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  // Remount the body each time it opens so typed confirmation text resets.
  if (!props.open) return null;
  return <ConfirmDialogInner {...props} />;
}

function ConfirmDialogInner({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const matches = requireText === undefined || typed === requireText;
  const danger = tone === 'danger';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!loading}
      size="sm"
      title={title}
      description={description}
      icon={
        <div
          className={
            danger
              ? 'flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100'
              : 'flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100'
          }
        >
          {danger ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={!matches}
            data-autofocus={requireText === undefined ? true : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(children || requireText !== undefined) && (
        <form
          className="space-y-3 pb-1 text-sm text-slate-600"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !loading) onConfirm();
          }}
        >
          {children}
          {requireText !== undefined && (
            <div>
              <label htmlFor={inputId} className="mb-1.5 block text-sm text-slate-700">
                Type <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900">{requireText}</span> to confirm
              </label>
              <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus />
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}
