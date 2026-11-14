import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { GlobalNav } from './GlobalNav';

function PrototypeFooter() {
  return (
    <footer className="mt-10 border-t border-line-soft px-6 py-5 text-xs leading-relaxed text-ink-soft md:px-12">
      <strong className="font-bold text-ink">MyClubs</strong> is an independent HackUMass 2026 prototype. It is not affiliated
      with, endorsed by, or connected to UMass Amherst or Instructure Canvas. All courses, clubs, events and deadlines shown
      are sample data. Follows, saved events and reviews are stored only in this browser.
    </footer>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-4 py-2 text-link shadow focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <div className="fixed inset-y-0 left-0 z-30 hidden md:block">
        <GlobalNav />
      </div>

      {/* Mobile header + drawer */}
      <header className="on-dark sticky top-0 z-30 flex h-14 items-center gap-3 bg-umass px-4 text-white md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid h-10 w-10 place-items-center rounded hover:bg-umass-dark"
          aria-label="Open global navigation"
          aria-expanded={drawerOpen}
        >
          <Menu size={24} aria-hidden />
        </button>
        <Link to="/" className="font-serif text-lg leading-none">
          UMass Amherst
        </Link>
      </header>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Global navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="on-dark relative h-full w-72 shadow-xl">
            <GlobalNav variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded text-white hover:bg-umass-dark"
              aria-label="Close navigation"
            >
              <X size={22} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="md:pl-[84px]">
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
        <PrototypeFooter />
      </div>
    </div>
  );
}
