import { formatDateTime, formatRelative } from '@/lib/format';
import { useNow } from '@/lib/useNow';

/** Relative time ("3 hours ago") with the absolute timestamp in the title tooltip. */
export function RelativeTime({ value, className }: { value: string | null | undefined; className?: string }) {
  const now = useNow();
  if (!value) return <span className={className}>—</span>;
  return (
    <time dateTime={value} title={formatDateTime(value)} className={className}>
      {formatRelative(value, now)}
    </time>
  );
}
