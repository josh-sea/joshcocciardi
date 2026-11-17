// Export the knowledge base as a folder of linked Markdown pages (an Obsidian
// style vault: frontmatter for what gets counted, [[links]] between pages),
// zipped in the browser. This is the bridge to a file-based knowledge base:
// Firestore is the working store, the vault is the portable copy.
//
// Pure functions, no dependencies. The zip writer stores files uncompressed,
// which every unzip tool reads.

const slug = (s, n = 50) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, n) || "untitled";

const day = (ts) => {
  const m = ts && typeof ts.toMillis === "function" ? ts.toMillis() : typeof ts === "number" ? ts : Date.parse(ts || "");
  return Number.isFinite(m) ? new Date(m).toISOString().slice(0, 10) : "undated";
};

/* YAML scalar: quoted when it could be misread. */
const y = (v) => {
  if (v === null || v === undefined || v === "") return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(String(v));
};
const yList = (xs) => `[${(xs || []).map(y).join(", ")}]`;

export const pageNames = ({ items = [], sources = [], narratives = [], claims = [] }) => {
  const names = {};
  for (const it of items) names[`item:${it.id}`] = `items/${day(it.context?.publishedAt || it.createdAt)}-${slug(it.context?.title || it.title)}-${it.id.slice(0, 6)}`;
  for (const s of sources) names[`source:${s.id}`] = `sources/${s.id}`;
  for (const n of narratives) names[`narrative:${n.id}`] = `narratives/${slug(n.name)}-${n.id.slice(-6)}`;
  for (const c of claims) names[`claim:${c.id}`] = `claims/${slug(c.text, 60)}-${c.id.slice(-6)}`;
  return names;
};

export const toVault = ({ items = [], sources = [], narratives = [], claims = [], edges = [], library = null, exportedAt = new Date() }) => {
  const names = pageNames({ items, sources, narratives, claims });
  const link = (kind, id, label) => (names[`${kind}:${id}`] ? `[[${names[`${kind}:${id}`]}${label ? `|${label.replace(/[[\]|]/g, "")}` : ""}]]` : label || id);
  const tech = Object.fromEntries((library?.techniques || []).map((t) => [t.id, t]));
  const trans = Object.fromEntries((library?.transformations || []).map((t) => [t.id, t]));
  const files = [];

  for (const it of items) {
    const c = it.context || {};
    const sc = it.scores || {};
    const into = edges.filter((e) => e.to === it.id);
    const out = edges.filter((e) => e.from === it.id);
    const fm = [
      "---",
      "type: item",
      `id: ${y(it.id)}`,
      `title: ${y(c.title || it.title)}`,
      `source: ${y(it.sourceId ? `[[${names[`source:${it.sourceId}`]}]]` : "")}`,
      `outlet: ${y(it.outletId ? `[[${names[`source:${it.outletId}`]}]]` : "")}`,
      `author: ${y(c.author)}`,
      `publisher: ${y(c.publisher)}`,
      `url: ${y(c.url)}`,
      `published: ${y(c.publishedAt)}`,
      `genre: ${y(c.genre)}`,
      `format: ${y(c.format)}`,
      `status: ${y(it.status)}`,
      `words: ${y(it.words)}`,
      `hop: ${y(it.hop)}`,
      `narratives: ${yList((it.narrativeIds || []).map((n) => `[[${names[`narrative:${n}`]}]]`))}`,
      `upstream: ${yList(into.filter((e) => e.from).map((e) => `[[${names[`item:${e.from}`]}]]`))}`,
      `library_version: ${y(it.libraryVersion)}`,
      "scores:",
      `  density_raw: ${y(sc.densityRaw)}`,
      `  density_pct: ${y(sc.densityPct)}`,
      `  fidelity: ${y(sc.fidelity)}`,
      `  direction: ${y(sc.direction)}`,
      `  pressure: {${Object.entries(it.pressure?.scores || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}}`,
      "---",
    ];
    const body = [
      `# ${c.title || it.title || "Untitled"}`,
      "",
      c.summary || "",
      "",
      "## Claims",
      ...(it.claims || []).map((cl) => `- ${link("claim", cl.claimId, cl.text)}`),
      "",
      "## Findings",
      ...(it.findings || []).map((f) => `- **${f.id}** Layer ${f.layer}, ${tech[f.techniqueId]?.name || f.techniqueId} (${f.confidence}): "${f.quote}" ${f.explanation}`),
      ...((it.layer4?.maneuvers || []).map((m) => `- **${m.id}** Layer 4, BEND ${m.maneuverId} (${m.confidence}): "${m.quote}" ${m.explanation}`)),
      "",
      "## Pressure",
      ...Object.entries(it.pressure?.scores || {}).map(([k, v]) => `- ${k}: ${v}/3${it.pressure?.support?.[k]?.length ? ` (supported by ${it.pressure.support[k].join(", ")})` : ""}`),
      it.direction ? `- direction: ${it.direction.value}. ${it.direction.rationale || ""}` : "",
      "",
      "## Upstream",
      ...into.map((e) =>
        e.from
          ? `- ${link("item", e.from, e.fromTitle)} (${e.relation}, ${e.status}${typeof e.fidelity === "number" ? `, fidelity ${e.fidelity}` : ""})${(e.transformations || []).length ? `: ${(e.transformations || []).map((t) => `${t.id} ${trans[t.id]?.name || ""}`.trim()).join(", ")}` : ""}`
          : `- Not yet ingested: ${e.ref?.title || e.ref?.url || "unknown"}${e.ref?.url ? ` <${e.ref.url}>` : ""}`
      ),
      "",
      "## Downstream",
      ...out.map((e) => `- ${link("item", e.to, e.toTitle)} (${e.relation}${typeof e.fidelity === "number" ? `, fidelity ${e.fidelity}` : ""})`),
      "",
      "## Questions",
      ...(it.questions || []).map((q) => `- ${q.question}${q.findingId ? ` (${q.findingId})` : ""}`),
      it.notes ? `\n## Notes\n\n${it.notes}` : "",
    ];
    files.push({ path: `${names[`item:${it.id}`]}.md`, content: `${fm.join("\n")}\n\n${body.filter((x) => x !== undefined).join("\n").replace(/\n{3,}/g, "\n\n")}\n` });
  }

  for (const s of sources) {
    const p = s.profile || {};
    const mine = items.filter((it) => it.sourceId === s.id || it.outletId === s.id);
    files.push({
      path: `${names[`source:${s.id}`]}.md`,
      content: [
        "---",
        "type: source",
        `name: ${y(s.name)}`,
        `kind: ${y(s.kind)}`,
        `items_count: ${y(s.itemsCount || 0)}`,
        `usual_role: ${y(p.usualRole)}`,
        `profile_shown: ${y(!!p.shown)}`,
        `density_median: ${y(p.densityMedian)}`,
        `fidelity_median: ${y(p.fidelityMedian)}`,
        "---",
        "",
        `# ${s.name}`,
        "",
        s.notes ? `${s.notes}\n` : "",
        "## Affiliations",
        ...(s.affiliations || []).map((a) => `- ${a.name}${a.cite ? ` (${a.cite})` : ""}`),
        "",
        "## Items",
        ...mine.map((it) => `- ${link("item", it.id, it.context?.title || it.title)}`),
        "",
      ].join("\n"),
    });
  }

  for (const n of narratives) {
    const mine = items.filter((it) => (it.narrativeIds || []).includes(n.id));
    files.push({
      path: `${names[`narrative:${n.id}`]}.md`,
      content: [
        "---",
        "type: narrative",
        `name: ${y(n.name)}`,
        `invariants: ${yList(n.invariants)}`,
        `item_count: ${y(n.itemCount || 0)}`,
        `source_count: ${y(n.sourceCount || 0)}`,
        "---",
        "",
        `# ${n.name}`,
        "",
        n.summary || "",
        "",
        n.impliedAction ? `Implied action: ${n.impliedAction}\n` : "",
        "## Timeline",
        ...mine
          .slice()
          .sort((a, b) => String(a.context?.publishedAt || "").localeCompare(String(b.context?.publishedAt || "")))
          .map((it) => {
            const role = (it.narratives || []).find((x) => x.id === n.id)?.role;
            return `- ${it.context?.publishedAt?.slice(0, 10) || "undated"} ${link("item", it.id, it.context?.title || it.title)}${role ? ` (${role})` : ""}`;
          }),
        "",
      ].join("\n"),
    });
  }

  for (const c of claims) {
    files.push({
      path: `${names[`claim:${c.id}`]}.md`,
      content: [
        "---",
        "type: claim",
        `kind: ${y(c.kind)}`,
        `verdict: ${y(c.verdict)}`,
        `items: ${yList((c.itemIds || []).map((i) => (names[`item:${i}`] ? `[[${names[`item:${i}`]}]]` : i)))}`,
        "---",
        "",
        `# ${c.text}`,
        "",
        c.verdictNote ? `${c.verdictNote}\n` : "",
        (c.variants || []).length ? `## Wordings\n\n${c.variants.map((v) => `- ${v}`).join("\n")}\n` : "",
        "## Made by",
        ...(c.itemIds || []).map((i) => `- ${link("item", i)}`),
        "",
      ].join("\n"),
    });
  }

  files.push({
    path: "index.md",
    content: [
      "# Narrative Lab knowledge base",
      "",
      `Exported ${new Date(exportedAt).toISOString()} · library ${library?.version || "unknown"}`,
      "",
      `- ${items.length} items, ${sources.length} sources, ${narratives.length} narratives, ${claims.length} claims, ${edges.length} edges`,
      "",
      "## Narratives",
      ...narratives.map((n) => `- ${link("narrative", n.id, n.name)} (${n.itemCount || 0} items)`),
      "",
      "## Sources",
      ...sources.map((s) => `- ${link("source", s.id, s.name)} (${s.itemsCount || 0} items)`),
      "",
    ].join("\n"),
  });
  return files;
};

// ── Zip (store method) ──────────────────────────────────────────────────────

let CRC_TABLE = null;
const crc32 = (bytes) => {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/* A zip archive of [{ path, content }] as a Uint8Array. */
export const zip = (files, when = new Date()) => {
  const enc = new TextEncoder();
  const dosTime = ((when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export { crc32 };
