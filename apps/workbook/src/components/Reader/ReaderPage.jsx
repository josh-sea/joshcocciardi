import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useKid } from '../../contexts/KidContext';
import { getPage } from '../../services/pages.service';
import { tokenize, isSpeakable } from '../../utils/words';
import Word from './Word';
import LoadingSpinner from '../Layout/LoadingSpinner';

// Render one saved page for reading. Every real word is tappable; punctuation
// and spacing are preserved so it reads like the page Bodhi has in front of him.
const kindStyles = {
  heading: 'text-2xl font-bold text-slate-900',
  direction: 'text-xl leading-relaxed bg-amber-50 border border-amber-200 rounded-2xl p-4',
  question: 'text-xl leading-relaxed',
  passage: 'text-xl leading-relaxed',
  example: 'text-lg leading-relaxed text-slate-600 bg-slate-50 rounded-2xl p-4',
  choice: 'text-lg leading-relaxed pl-2',
  other: 'text-lg leading-relaxed',
};

const BlockText = ({ text }) => (
  <>
    {tokenize(text).map((t, i) =>
      t.space
        ? <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{t.value}</span>
        : isSpeakable(t.word)
          ? <Word key={i} text={t.word} />
          : <span key={i}>{t.word}</span>
    )}
  </>
);

const ReaderPage = () => {
  const { pageId } = useParams();
  const { currentUser } = useAuth();
  const { activeKidId } = useKid();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser || !activeKidId) return;
      setLoading(true);
      const p = await getPage(currentUser.uid, activeKidId, pageId);
      if (!cancelled) { setPage(p); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [currentUser, activeKidId, pageId]);

  if (loading) return <LoadingSpinner label="Opening the page…" />;
  if (!page) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center text-slate-500">
        <p>That page isn’t here anymore.</p>
        <button className="btn-secondary mt-4" onClick={() => navigate('/')}>Back to shelf</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate('/')} className="text-sm font-semibold text-slate-500 hover:text-indigo-600">
          ← Shelf
        </button>
        {page.imageUrl && (
          <button onClick={() => setShowImage((v) => !v)} className="text-sm font-semibold text-slate-500 hover:text-indigo-600">
            {showImage ? 'Hide photo' : 'See the real page'}
          </button>
        )}
      </div>

      <p className="text-center text-sm text-indigo-500 font-semibold mb-4">👆 Tap any word to hear it</p>

      {showImage && page.imageUrl && (
        <img src={page.imageUrl} alt="Original workbook page" className="w-full rounded-2xl border border-slate-200 mb-6" />
      )}

      <article className="space-y-5">
        {page.title && <h1 className="text-2xl font-bold text-slate-900"><BlockText text={page.title} /></h1>}
        {page.blocks.map((b, i) => (
          <div key={i} className={kindStyles[b.kind] || kindStyles.other}>
            {b.number && <span className="font-bold text-indigo-600 mr-2">{b.number}.</span>}
            <BlockText text={b.text} />
          </div>
        ))}
      </article>

      <div className="h-8" />
    </div>
  );
};

export default ReaderPage;
