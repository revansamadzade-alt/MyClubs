import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Review } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useToast } from './ToastContext';
import { CLUB_BY_ID } from '../data/clubs';
import { EVENT_BY_ID } from '../data/events';

/** Demo defaults so My Clubs and My Campus Life have content on first load. */
const SEED_FOLLOWED = ['hack-collective', 'data-science'];
const SEED_SAVED = ['ev-career-fair'];

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

  // Drop duplicates and ids that no longer exist in the sample data.
  const followed = useMemo(() => [...new Set(followedRaw)].filter((id) => CLUB_BY_ID[id]), [followedRaw]);
  const saved = useMemo(() => [...new Set(savedRaw)].filter((id) => EVENT_BY_ID[id]), [savedRaw]);

  const isFollowing = useCallback((id: string) => followed.includes(id), [followed]);
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);

  const toggleFollow = useCallback(
    (id: string) => {
      const name = CLUB_BY_ID[id]?.name ?? 'club';
      const was = followed.includes(id);
      setFollowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      notify(was ? `Unfollowed ${name}.` : `Following ${name}. Its meetings now appear in My Campus Life.`);
    },
    [followed, notify, setFollowed],
  );

  const toggleSave = useCallback(
    (id: string) => {
      const title = EVENT_BY_ID[id]?.title ?? 'event';
      const was = saved.includes(id);
      setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
