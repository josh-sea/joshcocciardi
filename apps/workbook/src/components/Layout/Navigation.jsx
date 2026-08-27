import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Shelf', icon: '📚', end: true },
  { to: '/capture', label: 'Add Page', icon: '📷' },
];

const Navigation = () => (
  <nav
    className="fixed bottom-0 inset-x-0 z-10 bg-white/95 backdrop-blur border-t border-slate-100"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="max-w-2xl mx-auto grid grid-cols-2">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`
          }
        >
          <span className="text-2xl leading-none">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default Navigation;
