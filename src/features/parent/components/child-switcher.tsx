import { UserAvatar } from '@/shared/components/user-avatar';
import { cn } from '@/shared/utils/cn';
import type { ChildSummary } from '@/shared/types';

/**
 * Switch between siblings.
 *
 * Rendered as a row of cards rather than a dropdown: a guardian with two
 * children switches constantly, and a dropdown hides the fact that the screen
 * is showing one child and not the family. With a single child it renders as a
 * plain label, because a picker with one option is a puzzle.
 */
export function ChildSwitcher({
  children,
  value,
  onChange,
}: {
  children: ChildSummary[];
  value: string;
  onChange: (studentId: string) => void;
}) {
  if (children.length === 0) return null;

  if (children.length === 1) {
    const only = children[0];
    return (
      <div className="flex items-center gap-2.5">
        <UserAvatar fullName={only.full_name} avatarPath={only.avatar_path} className="size-8" />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-ink">{only.full_name}</p>
          <p className="text-[12px] text-ink-3">{only.admission_number}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a child">
      {children.map((child) => {
        const active = child.student_id === value;

        return (
          <button
            key={child.student_id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(child.student_id);
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
              active
                ? 'border-brand-border bg-brand-soft'
                : 'border-border bg-card hover:bg-surface-2',
            )}
          >
            <UserAvatar
              fullName={child.full_name}
              avatarPath={child.avatar_path}
              className="size-8"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-bold text-ink">
                {child.full_name}
              </span>
              <span className="block text-[12px] text-ink-3">{child.admission_number}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
