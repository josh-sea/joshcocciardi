import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

const TABS = [
  { to: '/today', label: 'Today', icon: 'today' },
  { to: '/jobs', label: 'Jobs', icon: 'jobs' },
  { to: '/add', label: 'Add job', icon: 'add' },
  { to: '/dashboard', label: 'Numbers', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Layout() {
  const { profile } = useAuth();
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <NavLink to="/today" className="brand">EzPayze</NavLink>
        {profile?.businessName && <span className="who">{profile.businessName}</span>}
      </header>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="spinner" role="status">{label}</p>;
}
