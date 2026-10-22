import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
}

export interface DropdownMenuProps {
  /** Renders the trigger; spread the given props onto a button. */
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    onClick: (e: React.MouseEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top';
  header?: ReactNode;
  className?: string;
}

interface Position {
  top: number;
  left: number;
}

export function DropdownMenu({ trigger, items, align = 'end', placement = 'bottom', header, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const t = triggerRef.current;
    const m = menuRef.current;
    if (!t || !m) return;
    const r = t.getBoundingClientRect();
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = placement === 'top' ? r.top - mh - 6 : r.bottom + 6;
    if (placement === 'bottom' && top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    if (placement === 'top' && top < 8) top = r.bottom + 6;
    setPos({ top, left });
  }, [align, placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onScrollOrResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && pos) itemRefs.current[enabled[0] ?? 0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null]);

  const focusItem = (delta: number) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const idx = enabled.indexOf(current);
    const next = enabled[(idx + delta + enabled.length) % enabled.length];
    if (next !== undefined) itemRefs.current[next]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      itemRefs.current[enabled[0] ?? 0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itemRefs.current[enabled[enabled.length - 1] ?? 0]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <>
      {trigger({
        ref: (el) => {
          triggerRef.current = el;
        },
        onClick: (e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
      })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            onKeyDown={onMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn(
              'fixed z-[60] min-w-[12rem] animate-scale-in rounded-xl border border-slate-200 bg-white p-1 shadow-pop',
              className,
            )}
          >
            {header && <div className="border-b border-slate-100 px-2.5 pb-2 pt-1.5">{header}</div>}
            {items.map((item, i) => (
              <div key={item.key}>
                {item.separated && <div className="my-1 h-px bg-slate-100" role="separator" />}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                    item.danger ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50' : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100',
                  )}
                >
                  {item.icon && <span className={cn('shrink-0', item.danger ? 'text-rose-500' : 'text-slate-400')}>{item.icon}</span>}
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
