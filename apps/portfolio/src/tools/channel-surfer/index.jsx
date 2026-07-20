import React, {
  useState,
  useEffect,
  useMemo,
  useDeferredValue,
  useCallback,
} from "react";

// ---------------------------------------------------------------------------
// Channel Surfer — search the iptv-org channel guide (~40k channels, ~17k
// live streams) and hand streams to VLC.
//
// Data comes straight from the iptv-org public API (github.io, CORS-open):
//   channels.json / streams.json / countries.json / categories.json eagerly,
//   guides.json (EPG sources) and logos.json lazily since they're large.
//
// "Open in VLC" strategy: desktop browsers can't launch VLC directly (no
// registered URL protocol), so we download a one-channel .m3u that VLC is
// the default handler for. On iOS/Android we use the vlc-x-callback deep
// link the mobile apps register. Copy-URL is always available as a fallback.
// ---------------------------------------------------------------------------

const API = "https://iptv-org.github.io/api";
const PAGE_SIZE = 50;

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const isAndroid = () => /Android/i.test(navigator.userAgent || "");

function vlcDeepLink(url) {
  if (isAndroid()) {
    // VLC for Android doesn't reliably handle vlc-x-callback; an explicit
    // intent targeting the VLC package carries the stream URL correctly.
    const scheme = url.split(":", 1)[0];
    return `intent://${url.replace(/^[a-z]+:\/\//i, "")}#Intent;action=android.intent.action.VIEW;scheme=${scheme};package=org.videolan.vlc;type=video/*;end`;
  }
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  }
  copyTextFallback(text);
  return Promise.resolve();
}

function copyTextFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

function downloadM3U(filename, lines) {
  const blob = new Blob([lines.join("\n") + "\n"], {
    type: "audio/x-mpegurl",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function m3uEntry(entry, stream) {
  const attrs = [
    entry.id ? `tvg-id="${entry.id}"` : null,
    entry.logo ? `tvg-logo="${entry.logo}"` : null,
    entry.categories.length ? `group-title="${entry.categories.join(";")}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const label = stream.quality ? `${entry.name} (${stream.quality})` : entry.name;
  const lines = [`#EXTINF:-1 ${attrs},${label}`];
  if (stream.user_agent) lines.push(`#EXTVLCOPT:http-user-agent=${stream.user_agent}`);
  if (stream.referrer) lines.push(`#EXTVLCOPT:http-referrer=${stream.referrer}`);
  lines.push(stream.url);
  return lines;
}

function safeFilename(name) {
  return (name || "channel").replace(/[^\w\d-]+/g, "_").slice(0, 60);
}

async function fetchJSON(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function useGuideData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJSON("channels.json"),
      fetchJSON("streams.json"),
      fetchJSON("countries.json"),
      fetchJSON("categories.json"),
    ])
      .then(([channels, streams, countries, categories]) => {
        if (cancelled) return;

        const countryByCode = new Map(countries.map((c) => [c.code, c]));

        const streamsByChannel = new Map();
        const orphans = [];
        for (const s of streams) {
          if (s.channel) {
            if (!streamsByChannel.has(s.channel)) streamsByChannel.set(s.channel, []);
            streamsByChannel.get(s.channel).push(s);
          } else if (s.url) {
            orphans.push(s);
          }
        }

        // One searchable entry per channel; orphan streams (in the playlist
        // but not matched to a channel in the database) become entries too so
        // nothing playable is hidden from search.
        const entries = channels.map((ch) => {
          const country = countryByCode.get(ch.country);
          return {
            key: ch.id,
            id: ch.id,
            name: ch.name,
            network: ch.network,
            country: ch.country,
            countryName: country ? country.name : ch.country || "",
            flag: country ? country.flag : "",
            categories: ch.categories || [],
            isNsfw: ch.is_nsfw,
            website: ch.website,
            closed: ch.closed,
            streams: streamsByChannel.get(ch.id) || [],
            logo: null,
            haystack: [ch.id, ch.name, ...(ch.alt_names || []), ch.network || "", country ? country.name : ""]
              .join(" ")
              .toLowerCase(),
          };
        });
        for (const s of orphans) {
          entries.push({
            key: `orphan:${s.url}`,
            id: null,
            name: s.title || s.url,
            network: null,
            country: null,
            countryName: "",
            flag: "",
            categories: [],
            isNsfw: false,
            website: null,
            closed: null,
            streams: [s],
            logo: null,
            haystack: (s.title || s.url).toLowerCase(),
          });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));

        setData({ entries, countries, categories });
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Logos are a separate 7MB file — fetch after first paint and patch in.
  useEffect(() => {
    if (!data || data.logosLoaded) return;
    let cancelled = false;
    fetchJSON("logos.json")
      .then((logos) => {
        if (cancelled) return;
        const best = new Map();
        for (const l of logos) {
          if (!best.has(l.channel)) best.set(l.channel, l.url);
        }
        setData((d) => ({
          ...d,
          logosLoaded: true,
          entries: d.entries.map((e) =>
            e.id && best.has(e.id) ? { ...e, logo: best.get(e.id) } : e
          ),
        }));
      })
      .catch(() => {}); // logos are cosmetic — ignore failures
    return () => {
      cancelled = true;
    };
  }, [data]);

  return { data, error };
}

// guides.json is ~25MB raw, so it loads only once a channel is expanded.
let guidesPromise = null;
function loadGuides() {
  if (!guidesPromise) {
    guidesPromise = fetchJSON("guides.json").then((guides) => {
      const byChannel = new Map();
      for (const g of guides) {
        if (!g.channel) continue;
        if (!byChannel.has(g.channel)) byChannel.set(g.channel, []);
        byChannel.get(g.channel).push(g);
      }
      return byChannel;
    });
  }
  return guidesPromise;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CopyButton({ text, label = "Copy link" }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    copyText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button className="cs-btn" onClick={copy}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}

function StreamRow({ entry, stream, index }) {
  const [launched, setLaunched] = useState(false);
  const openInVlc = () => {
    // Always put the stream URL on the clipboard first: if the VLC handoff
    // drops the URL (flaky on some platforms), paste always works.
    copyText(stream.url);
    setLaunched(true);
    setTimeout(() => setLaunched(false), 2500);
    if (isIOS() || isAndroid()) {
      window.location.href = vlcDeepLink(stream.url);
    } else {
      downloadM3U(`${safeFilename(entry.name)}.m3u`, ["#EXTM3U", ...m3uEntry(entry, stream)]);
    }
  };
  return (
    <div className="cs-stream">
      <div className="cs-stream-meta">
        <span className="cs-quality">{stream.quality || "stream"}</span>
        {stream.label && <span className="cs-label">{stream.label}</span>}
        <span className="cs-url" title={stream.url}>
          {stream.url}
        </span>
      </div>
      <div className="cs-stream-actions">
        <button className="cs-btn cs-btn-primary" onClick={openInVlc}>
          {launched ? "✓ Link copied too" : "▶ Open in VLC"}
        </button>
        <CopyButton text={stream.url} />
      </div>
    </div>
  );
}

function GuideSources({ channelId }) {
  const [state, setState] = useState({ status: "idle", sites: null });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", sites: null });
    loadGuides()
      .then((byChannel) => {
        if (cancelled) return;
        const sites = byChannel.get(channelId) || [];
        const seen = new Set();
        const unique = sites.filter((g) => {
          const k = `${g.site}|${g.lang}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setState({ status: "done", sites: unique });
      })
      .catch(() => !cancelled && setState({ status: "error", sites: null }));
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (state.status === "loading")
    return <div className="cs-guides cs-dim">Loading EPG sources…</div>;
  if (state.status === "error")
    return <div className="cs-guides cs-dim">Couldn't load EPG sources.</div>;
  if (!state.sites || state.sites.length === 0)
    return <div className="cs-guides cs-dim">No EPG guide sources listed for this channel.</div>;
  return (
    <div className="cs-guides">
      <span className="cs-dim">EPG guides: </span>
      {state.sites.map((g, i) => (
        <a
          key={i}
          className="cs-guide-link"
          href={`https://${g.site}`}
          target="_blank"
          rel="noreferrer"
        >
          {g.site_name || g.site}
          {g.lang ? ` (${g.lang})` : ""}
        </a>
      ))}
    </div>
  );
}

function Logo({ entry }) {
  const [broken, setBroken] = useState(false);
  if (entry.logo && !broken) {
    return (
      <img
        className="cs-logo"
        src={entry.logo}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="cs-logo cs-logo-fallback">
      {entry.flag || entry.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ChannelCard({ entry, expanded, onToggle }) {
  return (
    <div className={`cs-card${entry.streams.length ? "" : " cs-card-nostream"}`}>
      <button className="cs-card-head" onClick={onToggle}>
        <Logo entry={entry} />
        <span className="cs-card-title">
          <span className="cs-name">
            {entry.name}
            {entry.isNsfw && <span className="cs-badge cs-badge-nsfw">18+</span>}
            {entry.closed && <span className="cs-badge">closed</span>}
          </span>
          <span className="cs-sub">
            {entry.flag} {entry.countryName}
            {entry.network ? ` · ${entry.network}` : ""}
            {entry.categories.length ? ` · ${entry.categories.join(", ")}` : ""}
          </span>
        </span>
        <span className={`cs-badge ${entry.streams.length ? "cs-badge-live" : ""}`}>
          {entry.streams.length
            ? `${entry.streams.length} stream${entry.streams.length > 1 ? "s" : ""}`
            : "no stream"}
        </span>
        <span className="cs-chevron">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="cs-card-body">
          {entry.streams.map((s, i) => (
            <StreamRow key={i} entry={entry} stream={s} index={i} />
          ))}
          {entry.streams.length === 0 && (
            <div className="cs-dim" style={{ padding: "4px 0" }}>
              This channel is in the guide database but has no public stream in
              the iptv-org playlist.
            </div>
          )}
          <div className="cs-card-foot">
            {entry.id && <GuideSources channelId={entry.id} />}
            {entry.website && (
              <a className="cs-guide-link" href={entry.website} target="_blank" rel="noreferrer">
                Official website ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ChannelSurfer() {
  const { data, error } = useGuideData();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [onlyStreams, setOnlyStreams] = useState(true);
  const [showNsfw, setShowNsfw] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expandedKey, setExpandedKey] = useState(null);

  const results = useMemo(() => {
    if (!data) return [];
    const q = deferredQuery.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return data.entries.filter((e) => {
      if (onlyStreams && e.streams.length === 0) return false;
      if (!showNsfw && e.isNsfw) return false;
      if (country && e.country !== country) return false;
      if (category && !e.categories.includes(category)) return false;
      for (const t of terms) if (!e.haystack.includes(t)) return false;
      return true;
    });
  }, [data, deferredQuery, country, category, onlyStreams, showNsfw]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [deferredQuery, country, category, onlyStreams, showNsfw]);

  const exportPlaylist = () => {
    const lines = ["#EXTM3U"];
    let count = 0;
    for (const e of results) {
      for (const s of e.streams) {
        lines.push(...m3uEntry(e, s));
        count++;
      }
    }
    if (count === 0) return;
    downloadM3U("channel-surfer.m3u", lines);
  };

  const totalStreams = useMemo(
    () => results.reduce((n, e) => n + e.streams.length, 0),
    [results]
  );

  return (
    <div className="cs-root">
      <style>{styles}</style>
      <header className="cs-header">
        <h1>
          📺 Channel Surfer
        </h1>
        <p className="cs-tagline">
          Search the{" "}
          <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">
            iptv-org
          </a>{" "}
          guide — {data ? `${data.entries.length.toLocaleString()} channels` : "…"} — and
          send any stream to VLC.
        </p>
      </header>

      {error && (
        <div className="cs-error">
          Failed to load channel data ({String(error.message || error)}). The
          iptv-org API may be temporarily unavailable — try reloading.
        </div>
      )}

      {!data && !error && <div className="cs-loading">Loading channel guide…</div>}

      {data && (
        <>
          <div className="cs-controls">
            <input
              className="cs-search"
              type="search"
              placeholder="Search channels, networks, countries… (e.g. news, BBC, ESPN)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <select className="cs-select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {data.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            <select className="cs-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="cs-check">
              <input
                type="checkbox"
                checked={onlyStreams}
                onChange={(e) => setOnlyStreams(e.target.checked)}
              />
              Playable only
            </label>
            <label className="cs-check">
              <input
                type="checkbox"
                checked={showNsfw}
                onChange={(e) => setShowNsfw(e.target.checked)}
              />
              Show 18+
            </label>
          </div>

          <div className="cs-resultbar">
            <span>
              {results.length.toLocaleString()} channels · {totalStreams.toLocaleString()} streams
            </span>
            <button
              className="cs-btn"
              onClick={exportPlaylist}
              disabled={totalStreams === 0}
              title="Download the current results as an .m3u playlist (open it in VLC)"
            >
              ⬇ Export results as .m3u
            </button>
          </div>

          <div className="cs-list">
            {results.slice(0, limit).map((e) => (
              <ChannelCard
                key={e.key}
                entry={e}
                expanded={expandedKey === e.key}
                onToggle={() => setExpandedKey(expandedKey === e.key ? null : e.key)}
              />
            ))}
          </div>

          {results.length > limit && (
            <button className="cs-btn cs-more" onClick={() => setLimit(limit + 200)}>
              Show more ({(results.length - limit).toLocaleString()} remaining)
            </button>
          )}

          <footer className="cs-foot">
            <strong>Opening streams in VLC:</strong> “Open in VLC” always
            copies the stream link to your clipboard, then on desktop downloads
            a tiny <code>.m3u</code> file (open it and VLC plays the stream)
            and on iOS/Android launches the VLC app. If VLC opens without the
            stream, just paste — the link is already copied (Media → Open
            Network Stream). Streams are community-maintained by iptv-org and
            some go offline — if one fails, try another quality or channel.
          </footer>
        </>
      )}
    </div>
  );
}

const styles = `
.cs-root {
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  padding: 24px 16px 64px;
}
.cs-root a { color: #58a6ff; text-decoration: none; }
.cs-root a:hover { text-decoration: underline; }
.cs-header { max-width: 860px; margin: 0 auto 16px; }
.cs-header h1 { margin: 0 0 4px; font-size: 1.7rem; }
.cs-tagline { margin: 0; color: #8b949e; }
.cs-loading, .cs-error {
  max-width: 860px; margin: 40px auto; text-align: center; color: #8b949e;
}
.cs-error { color: #f85149; }
.cs-controls {
  max-width: 860px; margin: 0 auto 10px;
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}
.cs-search {
  flex: 1 1 260px; padding: 10px 14px; font-size: 1rem;
  background: #161b22; color: #e6edf3;
  border: 1px solid #30363d; border-radius: 8px; outline: none;
}
.cs-search:focus { border-color: #58a6ff; }
.cs-select {
  padding: 9px 8px; background: #161b22; color: #e6edf3;
  border: 1px solid #30363d; border-radius: 8px; max-width: 180px;
}
.cs-check {
  display: inline-flex; align-items: center; gap: 6px;
  color: #8b949e; font-size: 0.85rem; white-space: nowrap; cursor: pointer;
}
.cs-resultbar {
  max-width: 860px; margin: 0 auto 12px;
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  color: #8b949e; font-size: 0.85rem;
}
.cs-list { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
.cs-card {
  background: #161b22; border: 1px solid #30363d; border-radius: 10px;
  overflow: hidden;
}
.cs-card-nostream { opacity: 0.75; }
.cs-card-head {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 10px 14px; background: none; border: none; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.cs-card-head:hover { background: #1c2129; }
.cs-logo {
  width: 40px; height: 40px; flex: 0 0 40px; border-radius: 6px;
  object-fit: contain; background: #fff;
}
.cs-logo-fallback {
  display: inline-flex; align-items: center; justify-content: center;
  background: #21262d; color: #8b949e; font-size: 1.1rem; font-weight: 600;
}
.cs-card-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cs-name { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-sub {
  color: #8b949e; font-size: 0.8rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cs-badge {
  font-size: 0.7rem; padding: 2px 8px; border-radius: 999px;
  background: #21262d; color: #8b949e; white-space: nowrap;
}
.cs-badge-live { background: #12261e; color: #3fb950; border: 1px solid #238636; }
.cs-badge-nsfw { background: #2d1215; color: #f85149; }
.cs-chevron { color: #8b949e; }
.cs-card-body { padding: 4px 14px 12px; border-top: 1px solid #21262d; }
.cs-stream {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 0; border-bottom: 1px solid #21262d;
}
.cs-stream:last-of-type { border-bottom: none; }
.cs-stream-meta { flex: 1 1 240px; min-width: 0; display: flex; align-items: center; gap: 8px; }
.cs-quality {
  font-size: 0.72rem; font-weight: 700; color: #d29922;
  background: #271d12; padding: 2px 7px; border-radius: 4px; white-space: nowrap;
}
.cs-label { color: #8b949e; font-size: 0.8rem; white-space: nowrap; }
.cs-url {
  color: #8b949e; font-size: 0.75rem; font-family: ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.cs-stream-actions { display: flex; gap: 6px; }
.cs-btn {
  padding: 6px 12px; font-size: 0.82rem; border-radius: 7px; cursor: pointer;
  background: #21262d; color: #e6edf3; border: 1px solid #30363d;
}
.cs-btn:hover:not(:disabled) { background: #30363d; }
.cs-btn:disabled { opacity: 0.5; cursor: default; }
.cs-btn-primary { background: #e85e00; border-color: #e85e00; color: #fff; font-weight: 600; }
.cs-btn-primary:hover:not(:disabled) { background: #ff6d00; }
.cs-card-foot {
  display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline;
  padding-top: 8px; font-size: 0.8rem;
}
.cs-guides { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.cs-guide-link { font-size: 0.8rem; }
.cs-dim { color: #8b949e; font-size: 0.8rem; }
.cs-more { display: block; margin: 16px auto 0; }
.cs-foot {
  max-width: 860px; margin: 28px auto 0; color: #8b949e; font-size: 0.8rem;
  line-height: 1.5; border-top: 1px solid #21262d; padding-top: 14px;
}
.cs-foot code { background: #21262d; padding: 1px 5px; border-radius: 4px; }
@media (max-width: 640px) {
  .cs-select { max-width: 140px; }
  .cs-stream-actions { width: 100%; }
  .cs-stream-actions .cs-btn { flex: 1; }
}
`;
