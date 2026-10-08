/* ------------------------------------------------------------------ */
/*  Mise: step details (notes, links, comments, attachments)           */
/*  Pure functions only — no React, no Firebase.                       */
/*                                                                     */
/*  mise_implementations/{implId}/details/{nodeId}                     */
/*    notes        free text                                           */
/*    links        [{ id, url, label }]                                */
/*    comments     [{ id, text, by, name, at }]   at = epoch ms        */
/*    attachments  [{ id, name, path, url, size, type, at }]           */
/*    updatedAt                                                        */
/*                                                                     */
/*  Details live beside the tree rather than inside it. The tree is   */
/*  already close to Firestore's 20-level nesting limit at full depth, */
/*  and an array of maps inside a node would push it over. Keeping     */
/*  them in their own docs also means typing a note never rewrites the */
/*  whole plan.                                                        */
/* ------------------------------------------------------------------ */

export const MAX_NOTES = 20000;
export const MAX_LINKS = 50;
export const MAX_COMMENTS = 200;
export const MAX_COMMENT = 4000;
export const MAX_ATTACHMENTS = 30;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // keep in step with storage.rules

let counter = 0;
export const detailId = () =>
  `d${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const EMPTY_DETAILS = Object.freeze({ notes: "", links: [], comments: [], attachments: [] });

const str = (v) => (typeof v === "string" ? v : "");
const list = (v) => (Array.isArray(v) ? v : []);
const objs = (v) => list(v).filter((x) => x && typeof x === "object" && !Array.isArray(x));

/* Only http(s) and mailto/tel ever become an href, so a pasted
   `javascript:` link can't run anything when clicked. A bare domain
   ("dmv.ny.gov/address") gets https:// in front. Returns "" for junk. */
export const cleanUrl = (raw) => {
  const s = str(raw).trim();
  if (!s || /\s/.test(s)) return "";
  if (/^(mailto|tel):/i.test(s)) return s;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return "";
    return u.href;
  } catch {
    return "";
  }
};

export const linkLabel = (link) => {
  if (link.label) return link.label;
  try {
    const u = new URL(link.url);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return link.url.replace(/^[a-z]+:/i, "");
    return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    return link.url;
  }
};

export const readDetails = (raw) => ({
  notes: str(raw?.notes).slice(0, MAX_NOTES),
  links: objs(raw?.links)
    .map((l) => ({ id: str(l.id) || detailId(), url: cleanUrl(l.url), label: str(l.label).trim().slice(0, 200) }))
    .filter((l) => l.url)
    .slice(0, MAX_LINKS),
  comments: objs(raw?.comments)
    .map((c) => ({
      id: str(c.id) || detailId(),
      text: str(c.text).trim().slice(0, MAX_COMMENT),
      by: str(c.by),
      name: str(c.name),
      at: typeof c.at === "number" && Number.isFinite(c.at) ? c.at : 0,
    }))
    .filter((c) => c.text)
    .slice(-MAX_COMMENTS),
  attachments: objs(raw?.attachments)
    .map((a) => ({
      id: str(a.id) || detailId(),
      name: str(a.name) || "file",
      path: str(a.path),
      url: str(a.url),
      size: typeof a.size === "number" ? a.size : 0,
      type: str(a.type),
      at: typeof a.at === "number" ? a.at : 0,
    }))
    .filter((a) => a.path && a.url)
    .slice(0, MAX_ATTACHMENTS),
});

export const isEmptyDetails = (d) =>
  !d || (!d.notes?.trim() && !d.links?.length && !d.comments?.length && !d.attachments?.length);

/* Short per-cell summary, e.g. "note · 2 links · 1 file". */
export const detailSummary = (d) => {
  if (isEmptyDetails(d)) return "";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts = [];
  if (d.notes?.trim()) parts.push("note");
  if (d.links?.length) parts.push(plural(d.links.length, "link"));
  if (d.attachments?.length) parts.push(plural(d.attachments.length, "file"));
  if (d.comments?.length) parts.push(plural(d.comments.length, "comment"));
  return parts.join(" · ");
};

export const makeComment = (text, user) => ({
  id: detailId(),
  text: text.trim().slice(0, MAX_COMMENT),
  by: user.uid,
  name: user.displayName || user.email || "",
  at: Date.now(),
});

export const makeLink = (url, label) => {
  const clean = cleanUrl(url);
  return clean ? { id: detailId(), url: clean, label: str(label).trim().slice(0, 200) } : null;
};

/* Storage object names: keep them readable but path-safe. */
export const safeFileName = (name) =>
  (str(name) || "file")
    .replace(/[\\/#?[\]*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120) || "file";

export const fileSize = (n) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/* "just now", "5m ago", "3h ago", else a short date. */
export const when = (at, now = Date.now()) => {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
