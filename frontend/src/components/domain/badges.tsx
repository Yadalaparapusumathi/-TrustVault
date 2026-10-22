import { Crown, Eye, Pencil, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import type { AlertSeverity, AuditOutcome, Classification, MyPermission, Role } from '@/api/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

const classificationTone: Record<Classification, BadgeTone> = {
  PUBLIC: 'emerald',
  INTERNAL: 'sky',
  CONFIDENTIAL: 'amber',
  RESTRICTED: 'rose',
};

const classificationHelp: Record<Classification, string> = {
  PUBLIC: 'Public — may be shared freely',
  INTERNAL: 'Internal — for staff only',
  CONFIDENTIAL: 'Confidential — limited, need-to-know',
  RESTRICTED: 'Restricted — highest sensitivity',
};

export function ClassificationBadge({ value }: { value: Classification }) {
  return (
    <Badge tone={classificationTone[value] ?? 'neutral'} dot title={classificationHelp[value]}>
      {value}
    </Badge>
  );
}

const permissionTone: Record<MyPermission, BadgeTone> = { OWNER: 'violet', EDIT: 'brand', READ: 'neutral' };

export function PermissionBadge({ value }: { value: MyPermission }) {
  const Icon = value === 'OWNER' ? Crown : value === 'EDIT' ? Pencil : Eye;
  return (
    <Badge tone={permissionTone[value] ?? 'neutral'} icon={<Icon className="h-3 w-3" aria-hidden />}>
      {value}
    </Badge>
  );
}

const roleTone: Record<Role, BadgeTone> = { ADMIN: 'rose', OWNER: 'violet', VIEWER: 'neutral' };

export function RoleBadge({ value }: { value: Role | string }) {
  const tone = (roleTone as Record<string, BadgeTone>)[value] ?? 'neutral';
  return <Badge tone={tone}>{value}</Badge>;
}

const outcomeTone: Record<AuditOutcome, BadgeTone> = { SUCCESS: 'green', DENIED: 'red', FAILURE: 'amber' };

export function OutcomeBadge({ value }: { value: AuditOutcome }) {
  const Icon = value === 'SUCCESS' ? ShieldCheck : value === 'DENIED' ? ShieldAlert : TriangleAlert;
  return (
    <Badge tone={outcomeTone[value] ?? 'neutral'} icon={<Icon className="h-3 w-3" aria-hidden />}>
      {value}
    </Badge>
  );
}

const severityTone: Record<AlertSeverity, BadgeTone> = { HIGH: 'red', MEDIUM: 'amber', LOW: 'sky' };

export function SeverityBadge({ value }: { value: AlertSeverity }) {
  return (
    <Badge tone={severityTone[value] ?? 'neutral'} dot>
      {value}
    </Badge>
  );
}

export function SuggestionSourceBadge() {
  return (
    <Badge tone="violet" icon={<Sparkles className="h-3 w-3" aria-hidden />} title="Granted from an access-assistant suggestion">
      AI suggestion
    </Badge>
  );
}
