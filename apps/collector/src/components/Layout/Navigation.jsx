import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Inventory', icon: '🗃️', end: true },
  { to: '/dashboard', label: 'Dashboard', icon: '📊', end: false },
];

const Navigation = () => (
  <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
    <div className="mx-auto flex max-w-3xl">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              isActive ? 'text-sky-600' : 'text-slate-400'
            }`
          }
        >
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default Navigation;
