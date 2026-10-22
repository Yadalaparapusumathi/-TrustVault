import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { UserSummary } from '@/api/types';
import { RoleBadge } from '@/components/domain/badges';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/useDebounce';
import { useDirectorySearch } from './hooks';

/** Async combobox over GET /api/users/directory. */
export function UserPicker({
  id,
  value,
  onChange,
  excludeIds = [],
  invalid,
  describedBy,
}: {
  id: string;
  value: UserSummary | null;
  onChange: (user: UserSummary | null) => void;
  excludeIds?: string[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(text, 300);
  const search = useDirectorySearch(debounced);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = (search.data ?? []).filter((u) => !excludeIds.includes(u.id));

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const select = (user: UserSummary) => {
    onChange(user);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        select(results[active]);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white pl-2 pr-1 shadow-soft">
        <Avatar name={value.displayName} seed={value.id} size="xs" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-slate-900">{value.displayName}</span>{' '}
          <span className="text-slate-500">@{value.username}</span>
        </span>
        <button
          type="button"
          id={id}
          onClick={() => onChange(null)}
          aria-label={`Clear selected user ${value.displayName}`}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const showList = open && debounced.trim().length > 0;
  const activeId = showList && results[active] ? `${listId}-${results[active].id}` : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        invalid={invalid}
        autoComplete="off"
        placeholder="Search people by name or username…"
        leftIcon={<Search className="h-4 w-4" />}
        rightSlot={search.isFetching ? <Spinner size="sm" className="mr-1.5" /> : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-pop"
        >
          {search.isError ? (
            <li className="px-3 py-2.5 text-sm text-rose-600">Could not search the directory.</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-500">{search.isFetching ? 'Searching…' : 'No matching active users'}</li>
          ) : (
            results.map((u, i) => (
              <li
                key={u.id}
                id={`${listId}-${u.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(u)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2', i === active && 'bg-slate-100')}
              >
                <Avatar name={u.displayName} seed={u.id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{u.displayName}</span>
                  <span className="block truncate text-xs text-slate-500">@{u.username}</span>
                </span>
                <RoleBadge value={u.role} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
