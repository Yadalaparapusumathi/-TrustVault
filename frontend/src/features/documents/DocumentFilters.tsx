import { Search, SlidersHorizontal, User, X } from 'lucide-react';
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
    <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-12" role="search" aria-label="Filter documents">
      <div className="sm:col-span-2 xl:col-span-9">
        <DebouncedInput
          aria-label="Search by name"
          placeholder="Find a document by name..."
          leftIcon={<Search className="h-4 w-4" />}
          value={filters.q}
          onCommit={(v) => onChange('q', v)}
          type="search"
        />
      </div>
      <div className="flex items-center justify-between gap-2 sm:col-span-2 xl:col-span-3 xl:justify-end">
        <span className="inline-flex items-center gap-2 text-xs text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5" /> Refine your library</span>
        {hasFilters && <Button variant="ghost" size="sm" onClick={onClear} leftIcon={<X className="h-3.5 w-3.5" />}>Clear</Button>}
      </div>
      <div className="xl:col-span-3">
        <label htmlFor="filter-owner" className="eyebrow mb-2 block text-slate-400">Document owner</label>
        <DebouncedInput
          id="filter-owner"
          aria-label="Filter by owner"
          placeholder="Owner…"
          leftIcon={<User className="h-4 w-4" />}
          value={filters.owner}
          onCommit={(v) => onChange('owner', v)}
          type="search"
        />
      </div>
      <div className="xl:col-span-2">
        <label htmlFor="filter-category" className="eyebrow mb-2 block text-slate-400">Category</label>
        <Select id="filter-category" aria-label="Category" value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
          <option value="">All categories</option>
          {categoryOptions.sort((a, b) => a.localeCompare(b)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {categories.isError && <button type="button" onClick={() => void categories.refetch()} className="mt-1 text-xs text-rose-700 underline">Categories unavailable. Retry</button>}
      </div>
      <div className="xl:col-span-3">
        <label htmlFor="filter-classification" className="eyebrow mb-2 block text-slate-400">Classification</label>
        <Select id="filter-classification" aria-label="Classification" value={filters.classification} onChange={(e) => onChange('classification', e.target.value)}>
          <option value="">All classifications</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2 xl:col-span-4">
        <p className="eyebrow mb-2 text-slate-400">Created between</p>
        <div className="flex min-w-0 items-center gap-2 [&>div]:min-w-0 [&>div]:flex-1">
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
        </div>
      </div>
    </div>
  );
}
