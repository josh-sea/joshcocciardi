import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useKid } from '../../contexts/KidContext';
import { listPages, deletePage } from '../../services/pages.service';
import LoadingSpinner from '../Layout/LoadingSpinner';

// The child's shelf: every workbook page saved for them, newest first.
const LibraryPage = () => {
  const { currentUser } = useAuth();
  const { activeKid, activeKidId, kids, loading: kidsLoading } = useKid();
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser || !activeKidId) { setPages([]); setLoading(false); return; }
      setLoading(true);
      const list = await listPages(currentUser.uid, activeKidId);
      if (cancelled) return;
      setPages(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser, activeKidId]);

  const onDelete = async (e, page) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Remove "${page.title}" from ${activeKid.name}'s shelf?`)) return;
    await deletePage(currentUser.uid, activeKidId, page);
    setPages((ps) => ps.filter((p) => p.id !== page.id));
  };

  if (kidsLoading) return <LoadingSpinner label="Loading…" />;

  if (!kids.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">👋</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Welcome!</h1>
        <p className="text-slate-500 mb-6">Add your child to start building their workbook shelf.</p>
        <button className="btn-primary" onClick={() => navigate('/grownups')}>Add a child</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-xl font-bold text-slate-900 mb-4">
        {activeKid ? `${activeKid.name}’s shelf` : 'Shelf'}
      </h1>

      {loading ? (
        <LoadingSpinner label="Getting the pages…" />
      ) : pages.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-slate-500 mb-6">No pages yet. Add the first one!</p>
          <button className="btn-primary" onClick={() => navigate('/capture')}>📷 Add a page</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pages.map((p) => (
            <Link key={p.id} to={`/read/${p.id}`}
              className="group relative block bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-indigo-300 hover:shadow-md transition">
              <div className="aspect-[3/4] bg-slate-100">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl">📄</div>}
              </div>
              <div className="p-2">
                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{p.title}</p>
              </div>
              <button onClick={(e) => onDelete(e, p)}
                className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/40 text-white text-sm opacity-0 group-hover:opacity-100 transition"
                aria-label="Delete page">✕</button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
