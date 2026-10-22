import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/lib/useDebounce';
import { Input, type InputProps } from './Input';

export interface DebouncedInputProps extends Omit<InputProps, 'value' | 'onChange'> {
  value: string;
  onCommit: (value: string) => void;
  delayMs?: number;
}

/** Text input that keeps local state and commits it after `delayMs` of inactivity. */
export function DebouncedInput({ value, onCommit, delayMs = 300, ...rest }: DebouncedInputProps) {
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local, delayMs);
  const committed = useRef(value);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (debounced !== committed.current) {
      committed.current = debounced;
      commitRef.current(debounced);
    }
  }, [debounced]);

  // External changes (clear filters, back/forward navigation) win over local state.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setLocal(value);
    }
  }, [value]);

  return <Input {...rest} value={local} onChange={(e) => setLocal(e.target.value)} />;
}
