import { File, FileImage, FileSpreadsheet, FileText, FileType, Presentation, Sheet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fileKind, type FileKind } from '@/lib/files';

const styles: Record<FileKind, { icon: typeof File; className: string; label: string }> = {
  pdf: { icon: FileType, className: 'bg-rose-50 text-rose-600 ring-rose-100', label: 'PDF' },
  word: { icon: FileText, className: 'bg-blue-50 text-blue-600 ring-blue-100', label: 'Word document' },
  sheet: { icon: FileSpreadsheet, className: 'bg-emerald-50 text-emerald-600 ring-emerald-100', label: 'Spreadsheet' },
  slides: { icon: Presentation, className: 'bg-orange-50 text-orange-600 ring-orange-100', label: 'Presentation' },
  image: { icon: FileImage, className: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100', label: 'Image' },
  csv: { icon: Sheet, className: 'bg-teal-50 text-teal-600 ring-teal-100', label: 'CSV' },
  text: { icon: FileText, className: 'bg-slate-100 text-slate-600 ring-slate-200', label: 'Text' },
  other: { icon: File, className: 'bg-slate-100 text-slate-500 ring-slate-200', label: 'File' },
};

export function FileIcon({ contentType, filename, size = 'md', className }: { contentType?: string | null; filename?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const kind = fileKind(contentType, filename);
  const { icon: Icon, className: tone, label } = styles[kind];
  const box = size === 'sm' ? 'h-7 w-7 rounded-md' : size === 'lg' ? 'h-12 w-12 rounded-xl' : 'h-9 w-9 rounded-lg';
  const icon = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center ring-1 ring-inset', tone, box, className)} title={label}>
      <Icon className={icon} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
