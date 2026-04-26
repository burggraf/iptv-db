import { useState, useEffect } from 'react';
import type PocketBase from 'pocketbase';
import { isAbortError } from '../lib/pocketbase';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  sortable?: boolean;
  sortKey?: string;
  className?: string;
}

interface PaginatedTableProps<T> {
  pb: PocketBase;
  collection: string;
  columns: Column<T>[];
  filter?: string;
  expand?: string;
  sort?: string;
  perPage?: number;
  rowKey?: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  renderRow?: (item: T) => React.ReactNode;
  /** Enable checkbox selection column */
  selectable?: boolean;
  /** Currently selected IDs */
  selectedIds?: Set<string>;
  /** Toggle selection for an ID */
  onToggle?: (id: string) => void;
  /** Hide the built-in search bar */
  hideSearch?: boolean;
}

export default function PaginatedTable<T extends { id: string }>({
  pb,
  collection,
  columns,
  filter = '1=1',
  expand,
  sort = '-created',
  perPage = 50,
  rowKey = (item) => item.id,
  onRowClick,
  emptyMessage = 'No records found.',
  renderRow,
  selectable = false,
  selectedIds = new Set(),
  onToggle,
  hideSearch = false,
}: PaginatedTableProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentSort, setCurrentSort] = useState(sort);
  const [currentFilter, setCurrentFilter] = useState(filter);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch) {
      setCurrentFilter(`${filter} && name ~ "${debouncedSearch}"`);
    } else {
      setCurrentFilter(filter);
    }
    setPage(1);
  }, [debouncedSearch, filter]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await pb.collection(collection).getList<T>(page, perPage, {
          filter: currentFilter,
          sort: currentSort,
          expand,
        });
        if (!cancelled) {
          setItems(result.items);
          setTotalPages(result.totalPages);
          setTotalItems(result.totalItems);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error('Failed to fetch', collection, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [pb, collection, page, perPage, currentFilter, currentSort, expand]);

  const handleSort = (col: Column<T>) => {
    if (!col.sortable || !col.sortKey) return;
    const newSort = currentSort === col.sortKey ? `-${col.sortKey}` : col.sortKey;
    setCurrentSort(newSort);
  };

  // Selection helpers
  const pageIds = items.map(rowKey);
  const allPageSelected = selectable && items.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = selectable && pageIds.some(id => selectedIds.has(id));

  const toggleAll = () => {
    if (!onToggle) return;
    if (allPageSelected) {
      for (const id of pageIds) onToggle(id);
    } else {
      for (const id of pageIds) {
        if (!selectedIds.has(id)) onToggle(id);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      {!hideSearch && (
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <span className="text-sm text-muted-foreground">
            {totalItems.toLocaleString()} record{totalItems !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </TableHead>
            )}
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className={cn(col.sortable ? 'cursor-pointer select-none hover:text-foreground' : '', col.className)}
                onClick={() => handleSort(col)}
              >
                {col.header}
                {col.sortable && currentSort === col.sortKey && <span> ▲</span>}
                {col.sortable && currentSort === `-${col.sortKey}` && <span> ▼</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const id = rowKey(item);
              const checked = selectedIds.has(id);
              if (renderRow) {
                return renderRow(item);
              }
              return (
                <TableRow
                  key={id}
                  className={cn(onRowClick ? 'cursor-pointer' : '', checked && 'bg-muted/50')}
                  onClick={() => onRowClick?.(item)}
                >
                  {selectable && onToggle && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableCell>
                  )}
                  {columns.map((col, i) => (
                    <TableCell key={i} className={col.className}>
                      {col.accessor(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: (string | false | undefined | null)[]) {
  return inputs.filter(Boolean).join(' ');
}
