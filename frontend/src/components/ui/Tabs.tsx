import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { panelId, tabId } from '@/lib/tabs';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}

/** Accessible tablist (roving tabindex + arrow keys). Render the panel with <TabPanel>. */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const item = items[next];
    if (item) {
      onChange(item.value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-soft', className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={tabId(idPrefix, item.value)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, item.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
              selected ? 'bg-brand-50 text-brand-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', selected ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, value, children, className }: { idPrefix: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={panelId(idPrefix, value)} aria-labelledby={tabId(idPrefix, value)} tabIndex={0} className={cn('focus:outline-none', className)}>
      {children}
    </div>
  );
}
