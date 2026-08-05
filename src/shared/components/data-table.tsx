import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

import { EmptyState } from './empty-state';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { formatNumber } from '@/shared/utils/format';

export interface Column<T> {
  /** Stable key — also the header cell's React key. */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Applied to both the header and body cell, so alignment stays in step. */
  className?: string;
  /** Hidden below `md`. Use for columns that are useful but not identifying. */
  secondary?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: Error | null;

  empty?: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode };

  /** Omit to render without a pager. */
  pagination?: {
    page: number;
    pageCount: number;
    total: number;
    onPageChange: (page: number) => void;
  };

  onRowClick?: (row: T) => void;
  /** Rendered above the table — filters, search, bulk actions. */
  toolbar?: ReactNode;
}

/**
 * The table every admin list uses.
 *
 * It owns the four states a list can be in — loading, error, empty, populated —
 * so no screen reimplements them and they cannot drift apart. Columns are data
 * rather than JSX children, which is what lets a screen declare a table in a
 * dozen lines and keeps the skeleton shaped like the real thing.
 *
 * Horizontal overflow scrolls inside the card, never the page.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isLoading = false,
  error = null,
  empty,
  pagination,
  onRowClick,
  toolbar,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && !error && rows.length === 0;

  return (
    <div className="space-y-4">
      {toolbar}

      {error ? (
        <EmptyState
          icon={empty?.icon}
          title="Could not load this list"
          description={error.message}
        />
      ) : null}

      {!error ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={cn(
                        'px-4 py-3 text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase',
                        column.secondary && 'hidden md:table-cell',
                        column.className,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 8 }, (_, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td
                            key={column.id}
                            className={cn('px-4 py-3', column.secondary && 'hidden md:table-cell')}
                          >
                            <Skeleton className="h-5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={rowKey(row)}
                        onClick={
                          onRowClick
                            ? () => {
                                onRowClick(row);
                              }
                            : undefined
                        }
                        className={cn(
                          'transition-colors',
                          onRowClick && 'cursor-pointer hover:bg-surface-2/60',
                        )}
                      >
                        {columns.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              'px-4 py-3',
                              column.secondary && 'hidden md:table-cell',
                              column.className,
                            )}
                          >
                            {column.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {showEmpty && empty ? (
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              description={empty.description}
              action={empty.action}
              className="m-4 border-0"
            />
          ) : null}
        </Card>
      ) : null}

      {pagination && pagination.pageCount > 1 && !isLoading ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-3">
            Page {pagination.page} of {pagination.pageCount} · {formatNumber(pagination.total)} in
            total
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => {
                pagination.onPageChange(pagination.page - 1);
              }}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.pageCount}
              onClick={() => {
                pagination.onPageChange(pagination.page + 1);
              }}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
