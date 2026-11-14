import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NAV_ITEMS } from './nav';
import Dashboard from './pages/Dashboard';
import Placeholder from './pages/Placeholder';
import ClubsLayout from './pages/clubs/ClubsLayout';
import Discover from './pages/clubs/Discover';
import ClubProfile from './pages/clubs/ClubProfile';
import Following from './pages/clubs/Following';
import Events from './pages/clubs/Events';
import EventDetail from './pages/clubs/EventDetail';
import CampusLife from './pages/clubs/CampusLife';
import FindMyFit from './pages/clubs/FindMyFit';
import Applications from './pages/clubs/Applications';
import ApplicationDetail from './pages/clubs/ApplicationDetail';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="clubs" element={<ClubsLayout />}>
          <Route index element={<Navigate to="discover" replace />} />
          <Route path="discover" element={<Discover />} />
          <Route path="discover/:clubId" element={<ClubProfile />} />
          <Route path="fit" element={<FindMyFit />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/:clubId" element={<ApplicationDetail />} />
          <Route path="following" element={<Following />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:eventId" element={<EventDetail />} />
          <Route path="campus-life" element={<CampusLife />} />
        </Route>
        {NAV_ITEMS.filter((n) => n.prototype).map((item) => (
          <Route key={item.to} path={item.to.slice(1)} element={<Placeholder item={item} />} />
        ))}
        <Route path="*" element={<Placeholder />} />
      </Route>
    </Routes>
  );
}
