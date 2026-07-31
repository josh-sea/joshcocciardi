import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Renders an email body inside a sandboxed iframe.
 *
 * Email HTML is attacker-controlled: anyone who can send you mail decides
 * what lands here. Rather than trying to filter it, we deny it a useful
 * environment. The iframe is sandboxed without `allow-same-origin`, so its
 * document sits in an opaque origin with no access to this app's DOM,
 * storage, or Firebase session — and a CSP inside the document blocks every
 * script except our own nonce-tagged height reporter.
 *
 * Image blocking is enforced by that same CSP (`img-src 'none'`), which
 * covers <img>, srcset and CSS background images alike — the tracking-pixel
 * shapes a regex over the HTML kept missing.
 */

let frameCounter = 0;

function randomNonce() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bubble-matching colours. The frame is a separate document, so the app's
 * stylesheet doesn't reach inside it.
 */
const VARIANTS = {
  received: { color: '#000', link: '#007aff', quote: 'rgba(0,0,0,0.15)', quoteText: '#555' },
  sent: { color: '#fff', link: '#fff', quote: 'rgba(255,255,255,0.4)', quoteText: '#e8f1ff' },
  plain: { color: '#000', link: '#007aff', quote: 'rgba(0,0,0,0.15)', quoteText: '#555' },
};

function frameStyles(variant) {
  const v = VARIANTS[variant] || VARIANTS.received;
  return `
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: ${v.color};
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  img, video, table { max-width: 100% !important; height: auto; }
  table { border-collapse: collapse; }
  pre { white-space: pre-wrap; }
  blockquote {
    margin: 8px 0 8px 8px;
    padding-left: 10px;
    border-left: 2px solid ${v.quote};
    color: ${v.quoteText};
  }
  a { color: ${v.link}; }
`;
}

export function buildSrcDoc({ html, showImages, nonce, frameId, variant }) {
  const imgSrc = showImages ? "img-src https: http: data: cid: blob:" : "img-src 'none'";
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    imgSrc,
    `script-src 'nonce-${nonce}'`,
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');

  // The reporter measures the rendered document and hands its height back to
  // the parent, which can't read it directly across the sandbox boundary.
  const reporter = `
    var last = 0;
    function report() {
      var h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      if (h !== last) {
        last = h;
        parent.postMessage({ type: 'mail-frame-height', id: ${JSON.stringify(frameId)}, height: h }, '*');
      }
    }
    report();
    window.addEventListener('load', report);
    if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
    setTimeout(report, 250);
    setTimeout(report, 1500);
  `;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>${frameStyles(variant)}</style>
</head>
<body>
${html || ''}
<script nonce="${nonce}">${reporter}</script>
</body>
</html>`;
}

export default function MessageBody({
  html,
  showImages = false,
  variant = 'received',
  className = '',
}) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(80);
  const frameId = useMemo(() => `mail-frame-${++frameCounter}`, []);
  const nonce = useMemo(() => randomNonce(), []);

  const srcDoc = useMemo(
    () => buildSrcDoc({ html, showImages, nonce, frameId, variant }),
    [html, showImages, nonce, frameId, variant]
  );

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type !== 'mail-frame-height') return;
      if (event.data.id !== frameId) return;
      // The frame is sandboxed into an opaque origin, so `event.origin` is
      // "null" and useless for validation — match on the window instead.
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return;
      const next = Number(event.data.height);
      if (Number.isFinite(next) && next > 0) setHeight(Math.min(next, 20000));
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameId]);

  return (
    <iframe
      ref={frameRef}
      title="Message content"
      className={`message-frame ${className}`.trim()}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height }}
    />
  );
}
