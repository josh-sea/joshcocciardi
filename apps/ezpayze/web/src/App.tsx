import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout, Loading } from './components/Layout';
import { Landing } from './pages/Landing';
import { SignIn, FinishSignIn } from './pages/SignIn';
import { Setup } from './pages/Setup/Setup';
import { Today } from './pages/Today';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { AddJob } from './pages/AddJob';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { PayPage } from './pages/public/PayPage';

const TITLES: Record<string, string> = {
  '/today': 'Today',
  '/jobs': 'Jobs',
  '/add': 'Add a job',
  '/dashboard': 'Your numbers',
  '/settings': 'Settings',
  '/setup': 'Set up',
  '/signin': 'Sign in',
};

/** Page title + move focus to <main> on navigation, for screen readers. */
function RouteAnnouncer() {
  const { pathname } = useLocation();
  useEffect(() => {
    const key = Object.keys(TITLES).find((k) => pathname === k || pathname.startsWith(`${k}/`));
    document.title = key ? `${TITLES[key]} · EzPayze` : 'EzPayze: get paid without chasing';
    const main = document.getElementById('main');
    if (main && pathname !== '/') main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RequireProfile({ children, allowSetup = false }: { children: ReactNode; allowSetup?: boolean }) {
  const { user, profile, loading, error } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!profile) {
    return (
      <main id="main" tabIndex={-1}>
        <div className="card danger" role="alert">
          <h1>We couldn't open your account</h1>
          <p>{error ?? 'Please check your internet connection and reload the page.'}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </main>
    );
  }
  if (!profile.onboardingComplete && !allowSetup) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <>
      <RouteAnnouncer />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signin/finish" element={<FinishSignIn />} />
        <Route path="/pay/:token" element={<PayPage />} />
        <Route path="/setup" element={<RequireProfile allowSetup><Setup /></RequireProfile>} />
        <Route element={<RequireProfile><Layout /></RequireProfile>}>
          <Route path="/today" element={<Today />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/add" element={<AddJob />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function NotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <h1>We couldn't find that page</h1>
      <p><a href="/today">Go to Today</a></p>
    </main>
  );
}
