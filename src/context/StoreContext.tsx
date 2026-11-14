import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Review } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from './ToastContext';
import { CLUB_BY_ID } from '../data/clubs';
import { EVENT_BY_ID } from '../data/events';

/** Demo defaults so My Clubs & Associations and My Campus Life have content on first load. */
const SEED_FOLLOWED = ['chessclub', 'roboticsclub'];
const SEED_SAVED = ['ev-career-fair', 'ev-acappella'];

/** Follows of earlier fictional demo clubs that have a genuine real equivalent. */
const LEGACY_CLUB_IDS: Record<string, string> = { robotics: 'roboticsclub', chess: 'chessclub', outing: 'umoc' };
const LEGACY_SEED = ['hack-collective', 'data-science'];

function normalizeFollowed(ids: string[]): string[] {
  if (ids.length === LEGACY_SEED.length && LEGACY_SEED.every((id) => ids.includes(id))) return SEED_FOLLOWED;
  return [...new Set(ids.map((id) => LEGACY_CLUB_IDS[id] ?? id))].filter((id) => CLUB_BY_ID[id]);
}

function normalizeSaved(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => EVENT_BY_ID[id]);
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

const isReviewArray = (v: unknown): v is Review[] =>
  Array.isArray(v) &&
  v.every(
    (r) =>
      r !== null &&
      typeof r === 'object' &&
      typeof r.id === 'string' &&
      typeof r.clubId === 'string' &&
      typeof r.rating === 'number' &&
      typeof r.text === 'string' &&
      typeof r.author === 'string' &&
      typeof r.createdAt === 'string',
  );

const KEYS = {
  followed: 'myclubs:followed',
  saved: 'myclubs:savedEvents',
  reviews: 'myclubs:reviews',
};

interface StoreValue {
  followed: string[];
  saved: string[];
  reviews: Review[];
  isFollowing: (clubId: string) => boolean;
  toggleFollow: (clubId: string) => void;
  isSaved: (eventId: string) => boolean;
  toggleSave: (eventId: string) => void;
  addReview: (review: Pick<Review, 'clubId' | 'rating' | 'text' | 'author'>) => void;
  deleteReview: (reviewId: string) => void;
  resetDemo: () => void;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  // Validators stop corrupted or hand-edited storage from crashing the app.
  const [followedRaw, setFollowed] = useLocalStorage<string[]>(KEYS.followed, SEED_FOLLOWED, isStringArray);
  const [savedRaw, setSaved] = useLocalStorage<string[]>(KEYS.saved, SEED_SAVED, isStringArray);
  const [reviews, setReviews] = useLocalStorage<Review[]>(KEYS.reviews, [], isReviewArray);

  const followed = useMemo(() => normalizeFollowed(followedRaw), [followedRaw]);
  const saved = useMemo(() => normalizeSaved(savedRaw), [savedRaw]);

  // Persist migrated/cleaned lists once so toggles operate on clean data, and say so if demo follows were removed.
  const migrationNoticeShown = useRef(false);
  useEffect(() => {
    if (followed.join() === followedRaw.join()) return;
    const removed = new Set(followedRaw.filter((id) => !CLUB_BY_ID[LEGACY_CLUB_IDS[id] ?? id])).size;
    setFollowed(followed);
    if (removed && !migrationNoticeShown.current) {
      migrationNoticeShown.current = true;
      const wasDefault = followedRaw.length === LEGACY_SEED.length && LEGACY_SEED.every((id) => followedRaw.includes(id));
      notify(
        wasDefault
          ? 'Your old demo follows were replaced with real UMass organizations.'
          : `Removed ${removed} fictional demo club${removed === 1 ? '' : 's'} from your follows. MyClubs now lists real UMass organizations; equivalent clubs were kept.`,
      );
    }
  }, [followed, followedRaw, setFollowed, notify]);
  useEffect(() => {
    if (saved.join() !== savedRaw.join()) setSaved(saved);
  }, [saved, savedRaw, setSaved]);

  const isFollowing = useCallback((id: string) => followed.includes(id), [followed]);
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);

  const toggleFollow = useCallback(
    (id: string) => {
      const name = CLUB_BY_ID[id]?.name ?? 'club';
      const was = followed.includes(id);
      setFollowed((prev) => {
        const cur = normalizeFollowed(prev);
        return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      });
      notify(was ? `Unfollowed ${name}.` : `Following ${name}. Its meetings now appear in My Campus Life.`);
    },
    [followed, notify, setFollowed],
  );

  const toggleSave = useCallback(
    (id: string) => {
      const title = EVENT_BY_ID[id]?.title ?? 'event';
      const was = saved.includes(id);
      setSaved((prev) => {
        const cur = normalizeSaved(prev);
        return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      });
      notify(was ? `Removed “${title}” from saved events.` : `Saved “${title}” to My Campus Life.`);
    },
    [saved, notify, setSaved],
  );

  const addReview = useCallback<StoreValue['addReview']>(
    (r) => {
      const review: Review = { ...r, id: `rv-${Date.now()}`, createdAt: new Date().toISOString() };
      setReviews((prev) => [review, ...prev]);
      notify('Review posted (stored in this browser only).');
    },
    [notify, setReviews],
  );

  const deleteReview = useCallback(
    (id: string) => {
      setReviews((prev) => prev.filter((r) => r.id !== id));
      notify('Review deleted.');
    },
    [notify, setReviews],
  );

  const resetDemo = useCallback(() => {
    setFollowed(SEED_FOLLOWED);
    setSaved(SEED_SAVED);
    setReviews([]);
    notify('Demo data reset.');
  }, [notify, setFollowed, setSaved, setReviews]);

  const value = useMemo<StoreValue>(
    () => ({ followed, saved, reviews, isFollowing, toggleFollow, isSaved, toggleSave, addReview, deleteReview, resetDemo }),
    [followed, saved, reviews, isFollowing, toggleFollow, isSaved, toggleSave, addReview, deleteReview, resetDemo],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
