import { useId, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { cx } from '../lib/cx';
import { SampleBadge, Stars } from './ui';

const MAX = 500;

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const name = useId();
  const shown = hover || value;
  return (
    <div className="flex" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="peer sr-only"
          />
          <Star
            size={28}
            aria-hidden
            className="rounded peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-link"
            fill={shown >= n ? '#d68a00' : 'none'}
            stroke={shown >= n ? '#d68a00' : '#8b969e'}
          />
          <span className="sr-only">
            {n} star{n > 1 ? 's' : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Reviews({ clubId, clubName }: { clubId: string; clubName: string }) {
  const { reviews, addReview, deleteReview } = useStore();
  const list = reviews.filter((r) => r.clubId === clubId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState('');

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating.');
    if (text.trim().length < 10) return setError('Write at least 10 characters.');
    addReview({ clubId, rating, text: text.trim(), author: author.trim() || 'Anonymous (you)' });
    setRating(0);
    setText('');
    setAuthor('');
    setError('');
  }

  return (
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="section-title">
        Student reviews
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        {list.length ? (
          <>
            <span className="text-3xl font-bold text-ink">{avg.toFixed(1)}</span>
            <Stars value={avg} size={20} />
            <span className="text-sm text-ink-soft">
              {list.length} review{list.length > 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <p className="text-ink-soft">No reviews yet. Share your experience with {clubName}.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Demo reviews: written by you, stored only in this browser, and not from real UMass students. No ratings are
        pre-filled or imported.
      </p>

      <form onSubmit={submit} className="card mt-4 space-y-4 p-4" noValidate>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Your rating</legend>
          <StarInput value={rating} onChange={setRating} />
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Your review</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            rows={3}
            className="input resize-y"
            placeholder="What are meetings like? Who would enjoy this club?"
          />
          <span className="mt-1 block text-right text-xs text-ink-soft">
            {text.length}/{MAX}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">
            Display name <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={40} className="input" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-badge">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Post review
        </button>
      </form>

      {list.length > 0 && (
        <ul className="mt-4 divide-y divide-line-soft">
          {list.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  <span className="text-sm font-bold">{r.author}</span>
                  <SampleBadge label="Demo review" />
                  <span className="text-xs text-ink-soft">
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteReview(r.id)}
                  className={cx('btn btn-ghost btn-sm text-badge')}
                  aria-label={`Delete review by ${r.author}`}
                >
                  <Trash2 size={14} aria-hidden /> Delete
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-ink">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
