import { useId, useRef, useState, type DragEvent } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { FileIcon } from '@/components/domain/FileIcon';
import { cn } from '@/lib/cn';
import { ACCEPT_ATTRIBUTE, ALLOWED_EXTENSIONS, precheckUpload } from '@/lib/files';
import { formatBytes } from '@/lib/format';

export function FileDropzone({
  file,
  onFile,
  disabled,
  error,
}: {
  file: File | null;
  onFile: (file: File | null, error: string | null) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();

  const accept = (f: File | undefined) => {
    if (!f) return;
    onFile(f, precheckUpload(f));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(e.dataTransfer.files[0]);
  };

  if (file) {
    return (
      <div className={cn('rounded-xl border p-3', error ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/60')}>
        <div className="flex items-center gap-3">
          <FileIcon contentType={file.type} filename={file.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onFile(null, null)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Remove selected file"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2',
          dragging ? 'border-brand-400 bg-brand-100/60' : 'border-brand-200 bg-brand-50/40 hover:border-brand-300 hover:bg-brand-50',
        )}
      >
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card ring-1 ring-brand-100">
          <UploadCloud className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-sm font-medium text-slate-900">
          Drop a file here or <span className="text-brand-600">browse</span>
        </span>
        <span className="mt-1 text-xs text-slate-500">
          {ALLOWED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')} · up to 20 MB
        </span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function UploadProgress({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{pct < 100 ? 'Uploading…' : 'Verifying file on server…'}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload progress">
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
