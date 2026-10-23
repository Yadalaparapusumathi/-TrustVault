import {
  Activity,
  Archive,
  ArchiveRestore,
  Download,
  Eye,
  FileCheck2,
  FileDown,
  FilePen,
  FileUp,
  FileX2,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import type { AuditEvent } from '@/api/types';
import { cn } from '@/lib/cn';

type IconType = typeof Activity;

const actionIcons: Record<string, IconType> = {
  LOGIN_SUCCESS: LogIn,
  LOGIN_FAILED: XCircle,
  ACCOUNT_LOCKED: Lock,
  LOGOUT: LogOut,
  PASSWORD_CHANGED: KeyRound,
  DOCUMENT_UPLOADED: FileUp,
  UPLOAD_REJECTED: FileX2,
  DOCUMENT_VIEWED: Eye,
  DOCUMENT_DOWNLOADED: Download,
  DOCUMENT_UPDATED: FilePen,
  VERSION_UPLOADED: FileUp,
  DOCUMENT_DELETED: Archive,
  DOCUMENT_RESTORED: ArchiveRestore,
  DOCUMENT_PURGED: Trash2,
  GRANT_CREATED: UserPlus,
  GRANT_UPDATED: UserCog,
  GRANT_REVOKED: UserMinus,
  ACCESS_DENIED: ShieldAlert,
  ACCESS_SUGGESTED: Sparkles,
  SUGGESTION_DISMISSED: XCircle,
  USER_CREATED: UserPlus,
  USER_UPDATED: UserCog,
  USER_DEACTIVATED: UserX,
  USER_DELETED: Trash2,
  USER_REACTIVATED: UserCheck,
  ROLE_CHANGED: UserCog,
  PASSWORD_RESET: KeyRound,
  SESSIONS_REVOKED: LogOut,
  OWNERSHIP_TRANSFERRED: Users,
  AUDIT_EXPORTED: FileDown,
  AUDIT_VERIFIED: FileCheck2,
};

export function ActionIcon({ action, outcome, className }: { action: string; outcome?: AuditEvent['outcome']; className?: string }) {
  const Icon = actionIcons[action] ?? (action.includes('DENIED') ? ShieldAlert : action.includes('VERIFIED') ? ShieldCheck : Activity);
  const tone =
    outcome === 'DENIED'
      ? 'bg-red-50 text-red-600 ring-red-100'
      : outcome === 'FAILURE'
        ? 'bg-amber-50 text-amber-600 ring-amber-100'
        : 'bg-slate-50 text-slate-600 ring-slate-200';
  return (
    <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', tone, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

/** Renders event details as plain text (never as HTML). */
export function DetailsJson({ details }: { details: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(details ?? {}, null, 2);
  } catch {
    text = String(details);
  }
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-100">
      {text}
    </pre>
  );
}
