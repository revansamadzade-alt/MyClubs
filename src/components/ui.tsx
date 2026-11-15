import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bookmark, BookmarkCheck, Check, Plus, Search, Star } from 'lucide-react';
import type { CampusEvent, Club } from '../types';
import { useStore } from '../context/StoreContext';
import { cx } from '../lib/cx';
import { DOW_SHORT } from '../lib/dates';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SampleBadge({ className, label = 'Sample data' }: { className?: string; label?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-[#9aa5ad] px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-soft',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs text-ink ring-1 ring-line-soft">
      {category}
    </span>
  );
}

export function ClubAvatar({ club, size = 'md', className }: { club: Club; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-sm';
  return (
    <div
      aria-hidden
      className={cx('relative grid shrink-0 place-items-center rounded-lg font-black tracking-wide text-white', s, className)}
      style={{ backgroundColor: club.color }}
    >
      {club.initials}
    </div>
  );
}

export function FollowButton({ club, size }: { club: Club; size?: 'sm' }) {
  const { isFollowing, toggleFollow } = useStore();
  const following = isFollowing(club.id);
  return (
    <button
      type="button"
      aria-pressed={following}
      onClick={() => toggleFollow(club.id)}
      className={cx('btn', following ? 'btn-secondary' : 'btn-primary', size === 'sm' && 'btn-sm')}
      title={following ? `Unfollow ${club.name}` : `Follow ${club.name}`}
    >
      {following ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
      {following ? 'Following' : 'Follow'}
      <span className="sr-only">{club.name}</span>
    </button>
  );
}

export function SaveEventButton({ event, size }: { event: CampusEvent; size?: 'sm' }) {
  const { isSaved, toggleSave } = useStore();
  const saved = isSaved(event.id);
  if (event.end <= new Date() && !saved) {
    return (
      <button type="button" disabled className={cx('btn btn-secondary cursor-not-allowed opacity-60', size === 'sm' && 'btn-sm')}>
        Ended<span className="sr-only"> — {event.title} can no longer be saved</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => toggleSave(event.id)}
      className={cx('btn', saved ? 'btn-secondary' : 'btn-primary', size === 'sm' && 'btn-sm')}
      title={saved ? 'Remove from saved events' : 'Save to My Campus Life'}
    >
      {saved ? <BookmarkCheck size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
      {saved ? 'Saved' : 'Save'}
      <span className="sr-only">{event.title}</span>
    </button>
  );
}

export function DateTile({ date, className }: { date: Date; className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('flex w-14 shrink-0 flex-col self-start overflow-hidden rounded-md border border-line bg-white text-center', className)}
    >
      <span className="bg-umass py-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white">
        {date.toLocaleDateString('en-US', { month: 'short' })}
      </span>
      <span className="pt-1 text-2xl font-bold leading-none text-ink">{date.getDate()}</span>
      <span className="pb-1 text-[0.6875rem] text-ink-soft">{DOW_SHORT[date.getDay()]}</span>
    </div>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden
          fill={i <= rounded ? '#d68a00' : 'none'}
          stroke={i <= rounded ? '#d68a00' : '#9aa5ad'}
        />
      ))}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input pl-10" />
    </label>
  );
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className="chip">
          {o.label}
          {o.count !== undefined && <span className="text-[0.75rem] opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-line bg-surface/50 px-6 py-12 text-center">
      <Icon size={40} strokeWidth={1.4} className="mx-auto text-ink-soft" aria-hidden />
      <h2 className="mt-3 text-lg font-bold text-ink">{title}</h2>
      {children && <p className="mx-auto mt-1.5 max-w-md text-ink-soft">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
