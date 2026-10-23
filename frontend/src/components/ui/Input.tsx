import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const fieldBase =
  'block w-full min-w-0 rounded-xl border bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

function borderFor(invalid?: boolean) {
  return invalid ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25' : 'border-slate-200 hover:border-slate-300';
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leftIcon, rightSlot, className, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{leftIcon}</span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, borderFor(invalid), 'h-11 px-3.5', leftIcon && 'pl-10', rightSlot && 'pr-10', className)}
        {...rest}
      />
      {rightSlot && <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{rightSlot}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, borderFor(invalid), 'min-h-[88px] px-3 py-2 leading-relaxed', className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, borderFor(invalid), 'h-11 appearance-none pl-3.5 pr-9', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    </div>
  );
});

export function Label({ htmlFor, children, className, optional }: { htmlFor?: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)}>
      {children}
      {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
    </label>
  );
}

export interface FieldProps {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error, wired with aria-describedby by convention (`${id}-error`, `${id}-hint`). */
export function Field({ id, label, error, hint, optional, className, children }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
