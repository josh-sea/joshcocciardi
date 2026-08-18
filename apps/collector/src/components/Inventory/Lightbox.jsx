import { useEffect, useState } from 'react';

// Full-screen photo viewer. Beyond the on-screen Share / Copy-link buttons, the
// big image keeps the native long-press callout, so on a phone you can press and
// hold it to Copy / Save / Share via the OS — which works cross-origin where a
// scripted copy of a Storage URL would be blocked by CORS.
const Lightbox = ({ url, name, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: name || 'Item photo', url });
        return;
      } catch {
        return; // user cancelled
      }
    }
    copyLink();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 truncate text-sm">{name}</div>
        <div className="flex shrink-0 items-center gap-4 text-sm">
          <button onClick={share} className="hover:text-sky-300">Share</button>
          <button onClick={copyLink} className="hover:text-sky-300">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button onClick={onClose} aria-label="Close" className="text-lg hover:text-sky-300">✕</button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-3" onClick={onClose}>
        <img
          src={url}
          alt={name || ''}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>

      <div className="px-4 pb-5 pt-1 text-center text-xs text-white/50">
        Press &amp; hold the photo to copy, save, or share it.
      </div>
    </div>
  );
};

export default Lightbox;
