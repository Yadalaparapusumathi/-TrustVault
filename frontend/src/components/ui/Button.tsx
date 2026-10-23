import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'outline-danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/60 border border-brand-700/20',
  accent: 'bg-lime text-brand-950 border border-lime shadow-soft hover:bg-[#cbed76] active:bg-[#bedc6f]',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-soft hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500 active:bg-rose-700 disabled:bg-rose-600/60 border border-rose-700/20',
  'outline-danger': 'bg-white text-rose-600 border border-rose-200 shadow-soft hover:bg-rose-50 active:bg-rose-100',
  link: 'text-brand-600 hover:text-brand-700 hover:underline underline-offset-4 px-0',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, leftIcon, rightIcon, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" className="text-current" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
