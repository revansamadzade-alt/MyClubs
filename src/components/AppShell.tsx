import { useEffect, useRef, useState } from 'react';
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
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  // A modal <dialog> traps focus, makes the page inert, closes on Escape and returns focus to the menu button.
  useEffect(() => {
    const d = drawerRef.current;
    if (!d) return;
    if (drawerOpen && !d.open) d.showModal();
    if (!drawerOpen && d.open) d.close();
    if (!drawerOpen) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const onChange = () => desktop.matches && setDrawerOpen(false);
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
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
          aria-controls="mobile-nav"
        >
          <Menu size={24} aria-hidden />
        </button>
        <Link to="/" className="font-serif text-lg leading-none">
          UMass Amherst
        </Link>
      </header>
      <dialog
        ref={drawerRef}
        id="mobile-nav"
        aria-label="Menu"
        onClose={() => setDrawerOpen(false)}
        onClick={(e) => e.target === drawerRef.current && drawerRef.current?.close()}
        className="on-dark m-0 h-full max-h-none w-72 max-w-none bg-umass p-0 shadow-xl backdrop:bg-black/40 md:hidden"
      >
        <div className="relative h-full">
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
      </dialog>

      <div className="md:pl-[84px]">
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
        <PrototypeFooter />
      </div>
    </div>
  );
}
