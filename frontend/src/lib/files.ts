export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg'] as const;
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Client-side pre-check; the server re-validates (sniffing, PDF scanning, size). */
export function precheckUpload(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'File is larger than the 20 MB limit.';
  if (file.size === 0) return 'File is empty.';
  return null;
}

export type FileKind = 'pdf' | 'word' | 'sheet' | 'slides' | 'image' | 'text' | 'csv' | 'other';

export function fileKind(contentType: string | null | undefined, filename?: string): FileKind {
  const ct = (contentType ?? '').toLowerCase();
  const ext = filename ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ct.includes('wordprocessingml') || ct === 'application/msword' || ext === 'docx') return 'word';
  if (ct.includes('spreadsheetml') || ct === 'application/vnd.ms-excel' || ext === 'xlsx') return 'sheet';
  if (ct.includes('presentationml') || ext === 'pptx') return 'slides';
  if (ct.startsWith('image/')) return 'image';
  if (ct === 'text/csv' || ext === 'csv') return 'csv';
  if (ct.startsWith('text/') || ext === 'txt') return 'text';
  return 'other';
}
