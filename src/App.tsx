import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NAV_ITEMS } from './nav';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Placeholder from './pages/Placeholder';

// MyClubs pages load on demand (one small chunk each); the shell, homepage, Dashboard and placeholders stay in the main
// bundle.
const ClubsLayout = lazy(() => import('./pages/clubs/ClubsLayout'));
const Discover = lazy(() => import('./pages/clubs/Discover'));
const ClubProfile = lazy(() => import('./pages/clubs/ClubProfile'));
const Following = lazy(() => import('./pages/clubs/Following'));
const Events = lazy(() => import('./pages/clubs/Events'));
const EventDetail = lazy(() => import('./pages/clubs/EventDetail'));
const CampusLife = lazy(() => import('./pages/clubs/CampusLife'));
const FindMyFit = lazy(() => import('./pages/clubs/FindMyFit'));
const Applications = lazy(() => import('./pages/clubs/Applications'));
const ApplicationDetail = lazy(() => import('./pages/clubs/ApplicationDetail'));
const ApplyForm = lazy(() => import('./pages/clubs/ApplyForm'));
const ApplicantProfilePage = lazy(() => import('./pages/clubs/ApplicantProfile'));
// ClubFund (Supabase + wallet code) loads only when a ClubFund page is opened.
const ClubFundLayout = lazy(() => import('./pages/clubs/clubfund/ClubFundLayout'));
const ClubFundHome = lazy(() => import('./pages/clubs/clubfund/ClubFundHome'));
const WalletSettings = lazy(() => import('./pages/clubs/clubfund/WalletSettings'));
const CampaignPage = lazy(() => import('./pages/clubs/clubfund/CampaignPage'));

function Loading() {
  return (
    <p role="status" aria-live="polite" className="px-6 py-10 text-sm text-ink-soft md:px-12">
      Loading…
    </p>
  );
}

const page = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clubs" element={page(<ClubsLayout />)}>
          <Route index element={<Navigate to="discover" replace />} />
          <Route path="discover" element={page(<Discover />)} />
          <Route path="discover/:clubId" element={page(<ClubProfile />)} />
          <Route path="fit" element={page(<FindMyFit />)} />
          <Route path="applications" element={page(<Applications />)} />
          <Route path="applications/profile" element={page(<ApplicantProfilePage />)} />
          <Route path="applications/:clubId" element={page(<ApplicationDetail />)} />
          <Route path="applications/:clubId/apply" element={page(<ApplyForm />)} />
          <Route path="following" element={page(<Following />)} />
          <Route path="events" element={page(<Events />)} />
          <Route path="events/:eventId" element={page(<EventDetail />)} />
          <Route path="campus-life" element={page(<CampusLife />)} />
          <Route path="clubfund" element={page(<ClubFundLayout />)}>
            <Route index element={page(<ClubFundHome />)} />
            <Route path="settings" element={page(<WalletSettings />)} />
            <Route path="campaigns/:slug" element={page(<CampaignPage />)} />
          </Route>
        </Route>
        {NAV_ITEMS.filter((n) => n.prototype).map((item) => (
          <Route key={item.to} path={item.to.slice(1)} element={<Placeholder item={item} />} />
        ))}
        <Route path="*" element={<Placeholder />} />
      </Route>
    </Routes>
  );
}
