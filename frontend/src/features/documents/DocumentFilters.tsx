import { Search, User, X } from 'lucide-react';
import { CLASSIFICATIONS } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DebouncedInput } from '@/components/ui/DebouncedInput';
import { Input, Select } from '@/components/ui/Input';
import { useCategories } from './hooks';
import type { FilterKey, LibraryFilters } from './useLibraryParams';

export function DocumentFilters({
  filters,
  hasFilters,
  onChange,
  onClear,
}: {
  filters: LibraryFilters;
  hasFilters: boolean;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
}) {
  const categories = useCategories();
  const categoryOptions = [...(categories.data ?? [])];
  if (filters.category && !categoryOptions.includes(filters.category)) categoryOptions.push(filters.category);

  return (
    <div className="grid grid-cols-1 gap-2.5 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-12" role="search" aria-label="Filter documents">
      <div className="lg:col-span-3">
        <DebouncedInput
          aria-label="Search by name"
          placeholder="Search by name…"
          leftIcon={<Search className="h-4 w-4" />}
          value={filters.q}
          onCommit={(v) => onChange('q', v)}
          type="search"
        />
      </div>
      <div className="lg:col-span-2">
        <DebouncedInput
          aria-label="Filter by owner"
          placeholder="Owner…"
          leftIcon={<User className="h-4 w-4" />}
          value={filters.owner}
          onCommit={(v) => onChange('owner', v)}
          type="search"
        />
      </div>
      <div className="lg:col-span-2">
        <Select aria-label="Category" value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
          <option value="">All categories</option>
          {categoryOptions.sort((a, b) => a.localeCompare(b)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Select aria-label="Classification" value={filters.classification} onChange={(e) => onChange('classification', e.target.value)}>
          <option value="">All classifications</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
        <Input
          type="date"
          aria-label="Created from"
          title="Created from"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => onChange('from', e.target.value)}
        />
        <span className="text-xs text-slate-400">to</span>
        <Input
          type="date"
          aria-label="Created to"
          title="Created to"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => onChange('to', e.target.value)}
        />
        {hasFilters && (
          <Button variant="ghost" size="md" onClick={onClear} leftIcon={<X className="h-4 w-4" />} title="Clear all filters">
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
