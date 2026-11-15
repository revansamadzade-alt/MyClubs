import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import type { NavItem } from '../nav';
import { useTitle } from '../hooks/useTitle';

export default function Placeholder({ item }: { item?: NavItem }) {
  const label = item?.label ?? 'Page not found';
  useTitle(label);
  const Icon = item?.icon ?? Construction;
  return (
    <div className="px-4 py-6 sm:px-8 lg:pl-20">
      <h1 className="border-b border-line-soft pb-5 text-[2.5rem] font-bold leading-none text-[#1b1b1b]">{label}</h1>
      <div className="mx-auto mt-12 max-w-lg rounded border border-dashed border-line p-8 text-center">
        <Icon size={40} strokeWidth={1.4} className="mx-auto text-ink-soft" aria-hidden />
        <h2 className="mt-3 text-lg font-bold">{item ? 'Prototype section' : 'Nothing here'}</h2>
        <p className="mt-2 text-ink-soft">
          {item
            ? (item.blurb ?? `${label} is a visual placeholder in this Canvas-style prototype and has no real functionality.`)
            : 'This page does not exist in the prototype.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/clubs/discover" className="btn btn-primary">
            Explore MyClubs
          </Link>
          <Link to="/dashboard" className="btn btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
