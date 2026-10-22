import type { AuditEvent } from '@/api/types';

export function actorLabel(event: AuditEvent): string {
  return event.actor ? event.actor.username : 'system';
}

export function targetLabel(event: AuditEvent): string {
  if (!event.targetType && !event.targetId) return '—';
  return [event.targetType, event.targetId].filter(Boolean).join(' · ');
}
