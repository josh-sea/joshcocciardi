import React, { useEffect, useState } from "react";
import { checkKey, explain, readRaw, saveApiKey, saveSettings } from "./store";
import { fmtUsd } from "./format";
import { toVault, zip } from "./vault";
import { Field, useLab } from "./ui";

const STAGE_HELP = {
  extract: "Context packet, claims, and upstream references.",
  blind: "Reasoning and rhetoric, with the author masked. Where judgment matters most.",
  resolve: "Filing into narratives and matching claims.",
  relate: "Comparing a derivative with its source. Reads both texts.",
  narrate: "Narrative roles, invariant pressure, and questions.",
};

export default function Settings() {
  const lab = useLab();
  const { server, refreshStatus, setError, library } = lab;
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (server?.settings && !form) setForm(JSON.parse(JSON.stringify(server.settings)));
  }, [server, form]);

  if (!server) return <div className="nl-faint">Loading settings…</div>;

  const onSaveKey = async () => {
    try {
      await saveApiKey(key);
      setKey("");
      setKeyMsg("Saved. Checking it…");
      const r = await checkKey();
      setKeyMsg(r.message);
      refreshStatus();
    } catch (e) {
      setError(explain(e));
    }
  };
  const onCheck = async () => {
    setKeyMsg("Checking…");
    try {
      setKeyMsg((await checkKey()).message);
    } catch (e) {
      setKeyMsg(explain(e));
    }
  };
  const onSave = async () => {
    try {
      await saveSettings({ model: form.model, stages: form.stages, budgetMonthlyUsd: Number(form.budgetMonthlyUsd) || 0 });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refreshStatus();
    } catch (e) {
      setError(explain(e));
    }
  };
  const setStage = (k, field, v) => setForm({ ...form, stages: { ...form.stages, [k]: { ...form.stages[k], [field]: v } } });

  const onExport = async (withText) => {
    setExporting(true);
    try {
      const files = toVault({ items: lab.items, sources: lab.sources, narratives: lab.narratives, claims: lab.claims, edges: lab.edges, library });
      if (withText) {
        for (const it of lab.items) {
          const raw = await readRaw(it.id);
          if (raw?.text) files.push({ path: `raw/${it.id}.txt`, content: raw.text });
        }
      }
      const blob = new Blob([zip(files)], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `narrative-lab-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(explain(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="nl-head">
        <div>
          <h1>Settings</h1>
          <div className="nl-sub">The pipeline reads these on every stage. Library version {library?.version}.</div>
        </div>
      </div>
      <div className="nl-two">
        <div>
          <div className="nl-card">
            <h2>Anthropic API key</h2>
            <div className="nl-soft nl-small" style={{ marginBottom: 8 }}>
              {server.keySet
                ? server.keySource === "seasonal-box"
                  ? "Using the key saved in Seasonal Box HQ. Save one here to give Narrative Lab its own."
                  : "A key is saved. It can be replaced but never read back."
                : "No key yet. The pipeline queues items but cannot analyze them until one is saved."}
            </div>
            <div className="nl-row">
              <input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 200 }} autoComplete="off" />
              <button type="button" className="nl-btn primary" disabled={!key.trim().startsWith("sk-")} onClick={onSaveKey}>
                Save key
              </button>
              {server.keySet && (
                <button type="button" className="nl-btn" onClick={onCheck}>
                  Check
                </button>
              )}
            </div>
            {keyMsg && <div className="nl-small" style={{ marginTop: 6 }}>{keyMsg}</div>}
          </div>

          {form && (
            <div className="nl-card">
              <h2>Models</h2>
              <Field label="Default model" hint="Used for every stage unless a stage names its own.">
                <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                  {server.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <table className="nl-table" style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Model</th>
                    <th>Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(STAGE_HELP).map((k) => (
                    <tr key={k}>
                      <td>
                        <strong>{k}</strong>
                        <div className="nl-faint nl-tiny">{STAGE_HELP[k]}</div>
                      </td>
                      <td>
                        <select value={form.stages[k]?.model || form.model} onChange={(e) => setStage(k, "model", e.target.value)}>
                          {server.models.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={form.stages[k]?.effort} onChange={(e) => setStage(k, "effort", e.target.value)}>
                          {server.efforts.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Field label="Monthly budget (USD)" hint={`Spent in ${server.spend.month}: ${fmtUsd(server.spend.usd)}. Stages stop with a clear message once it is reached. 0 means no limit.`}>
                <input type="number" min="0" step="1" value={form.budgetMonthlyUsd} onChange={(e) => setForm({ ...form, budgetMonthlyUsd: e.target.value })} style={{ maxWidth: 160 }} />
              </Field>
              <div className="nl-row">
                <button type="button" className="nl-btn primary" onClick={onSave}>
                  Save settings
                </button>
                <button type="button" className="nl-btn" onClick={() => setForm(JSON.parse(JSON.stringify({ ...server.defaults, stages: Object.fromEntries(Object.entries(server.defaults.stages).map(([k, v]) => [k, { ...v, model: server.defaults.model }])) })))}>
                  Reset to defaults
                </button>
                {saved && <span className="nl-small nl-soft">Saved</span>}
              </div>
            </div>
          )}

          <div className="nl-card">
            <h2>Export as a Markdown vault</h2>
            <div className="nl-soft nl-small" style={{ marginBottom: 8 }}>
              A zip of linked Markdown pages (items, sources, narratives, claims, an index) with frontmatter and [[links]], ready to open in Obsidian or to
              commit to a knowledge-base repo.
            </div>
            <div className="nl-row">
              <button type="button" className="nl-btn" disabled={exporting} onClick={() => onExport(false)}>
                {exporting ? "Building…" : "Download vault"}
              </button>
              <button type="button" className="nl-btn" disabled={exporting} onClick={() => onExport(true)}>
                With original texts
              </button>
            </div>
          </div>
        </div>

        <div className="nl-card nl-lib">
          <h2>Library {library?.version}</h2>
          <div className="nl-faint nl-small">Every finding records this version, so a change here can be rescored and compared.</div>
          {[2, 3].map((layer) => (
            <details key={layer} open={layer === 2}>
              <summary style={{ marginTop: 12, fontWeight: 600 }}>Layer {layer}: {layer === 2 ? "reasoning" : "rhetoric"}</summary>
              <dl>
                {(library?.techniques || [])
                  .filter((t) => t.layer === layer)
                  .map((t) => (
                    <React.Fragment key={t.id}>
                      <dt>
                        {t.name} <span className="nl-faint nl-tiny">{t.source}</span>
                      </dt>
                      <dd>
                        {t.definition} <em>{t.question}</em>
                      </dd>
                    </React.Fragment>
                  ))}
              </dl>
            </details>
          ))}
          <details>
            <summary style={{ marginTop: 12, fontWeight: 600 }}>Layer 4: BEND maneuvers</summary>
            <dl>
              {(library?.maneuvers || []).map((m) => (
                <React.Fragment key={m.id}>
                  <dt>
                    {m.name} <span className="nl-faint nl-tiny">{m.kind}</span>
                  </dt>
                  <dd>{m.definition}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
          <details>
            <summary style={{ marginTop: 12, fontWeight: 600 }}>Layer 5: invariants</summary>
            <dl>
              {(library?.invariants || []).map((m) => (
                <React.Fragment key={m.id}>
                  <dt>{m.name}</dt>
                  <dd>
                    {m.definition} Attack: {m.attack} <em>{m.question}</em>
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
          <details>
            <summary style={{ marginTop: 12, fontWeight: 600 }}>Transformations</summary>
            <dl>
              {(library?.transformations || []).map((m) => (
                <React.Fragment key={m.id}>
                  <dt>
                    {m.id} {m.name} <span className="nl-faint nl-tiny">{m.direction}</span>
                  </dt>
                  <dd>{m.definition}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        </div>
      </div>
    </>
  );
}
