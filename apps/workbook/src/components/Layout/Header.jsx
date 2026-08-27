import { Link, useNavigate } from 'react-router-dom';
import { useKid } from '../../contexts/KidContext';

// A calm, kid-facing header. The active child's name is front and center; the
// grown-up controls (switch kid, word bank, sign out) hide behind one button.
const Header = () => {
  const { activeKid } = useKid();
  const navigate = useNavigate();

  const possessive = activeKid
    ? `${activeKid.name}${/s$/i.test(activeKid.name) ? "'" : "'s"} Workbook`
    : 'Workbook Reader';

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/projects/workbook/book.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-bold text-slate-800">{possessive}</span>
        </Link>
        <button
          onClick={() => navigate('/grownups')}
          className="text-sm font-semibold text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-slate-50"
        >
          Grown-ups
        </button>
      </div>
    </header>
  );
};

export default Header;
