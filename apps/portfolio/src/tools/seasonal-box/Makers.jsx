import React, { useMemo, useState } from "react";
import { ACTIONS } from "./seed";
import { ago, parseJson, usd } from "./pipeline";
import { deleteMaker, saveMaker } from "./store";
import { Field, Modal, useAction, useHQ } from "./ui";

// The Makers directory (spec 8.1 item 5). Approved Scout Reports add makers
// here as prospects; Josh moves them through contacted, sampling, and active
// partner as the relationship grows. Each profile shows the proposals that
// involve the maker (outreach, purchase orders), which is the email and order
// history until the mailbox integration lands.

export const MAKER_STATUSES = ["prospect", "contacted", "sampling", "active", "paused"];
const STATUS_TONE = { prospect: "", contacted: "yellow", sampling: "clay", active: "green", paused: "" };

const MakerForm = ({ maker, onClose }) => {
  const [m, setM] = useState({
    name: maker?.name || "",
    status: maker?.status || "prospect",
    location: maker?.location || "",
    distanceMiles: maker?.distanceMiles ?? "",
    website: maker?.website || "",
    contactMethod: maker?.contact?.method || "email",
    contactValue: maker?.contact?.value || "",
    capacity: maker?.capacity || "",
    leadTime: maker?.leadTime || "",
    insurance: maker?.insurance || "",
    notes: maker?.notes || "",
    products: (maker?.products || []).map((p) => (typeof p === "string" ? p : `${p.name}${p.price != null ? ` | ${p.price}` : ""}`)).join("\n"),
  });
  const act = useAction();
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const save = () =>
    act.run(async () => {
      if (!m.name.trim()) throw new Error("Give the maker a name.");
      await saveMaker(maker?.id || null, {
        name: m.name.trim(),
        status: m.status,
        location: m.location || null,
        distanceMiles: m.distanceMiles === "" ? null : Number(m.distanceMiles),
        website: m.website || null,
        contact: m.contactValue ? { method: m.contactMethod, value: m.contactValue } : null,
        capacity: m.capacity || null,
        leadTime: m.leadTime || null,
        insurance: m.insurance || null,
        notes: m.notes || null,
        // One product per line, optionally "name | price".
        products: m.products
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [name, price] = l.split("|").map((x) => x.trim());
            return { name, price: price && !Number.isNaN(Number(price)) ? Number(price) : null };
          }),
      });
      onClose();
    });
  return (
    <Modal title={maker ? `Edit ${maker.name}` : "Add a maker"} onClose={onClose}>
      <div className="sb-cols2">
        <Field label="Name">
          <input className="sb-input" value={m.name} onChange={set("name")} />
        </Field>
        <Field label="Status">
          <select className="sb-input" value={m.status} onChange={set("status")}>
            {MAKER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input className="sb-input" value={m.location} onChange={set("location")} />
        </Field>
        <Field label="Miles from base">
          <input className="sb-input" type="number" value={m.distanceMiles} onChange={set("distanceMiles")} />
        </Field>
        <Field label="Contact">
          <select className="sb-input" value={m.contactMethod} onChange={set("contactMethod")}>
            {["email", "phone", "instagram", "form"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Contact detail">
          <input className="sb-input" value={m.contactValue} onChange={set("contactValue")} />
        </Field>
        <Field label="Capacity">
          <input className="sb-input" value={m.capacity} onChange={set("capacity")} />
        </Field>
        <Field label="Lead time">
          <input className="sb-input" value={m.leadTime} onChange={set("leadTime")} />
        </Field>
      </div>
      <Field label="Website">
        <input className="sb-input" value={m.website} onChange={set("website")} />
      </Field>
      <Field label="Insurance certificate" hint="Where it is filed, and its expiry.">
        <input className="sb-input" value={m.insurance} onChange={set("insurance")} />
      </Field>
      <Field label="Products" hint={'One per line. Add a price with "name | 12.50".'}>
        <textarea className="sb-input" rows={4} value={m.products} onChange={set("products")} />
      </Field>
      <Field label="Notes">
        <textarea className="sb-input" rows={3} value={m.notes} onChange={set("notes")} />
      </Field>
      <div className="sb-row">
        <button className="sb-btn" type="button" disabled={act.busy} onClick={save}>
          Save
        </button>
        {maker && (
          <button
            className="sb-btn danger"
            type="button"
            disabled={act.busy}
            onClick={() => window.confirm(`Delete ${maker.name}?`) && act.run(async () => {
              await deleteMaker(maker.id);
              onClose();
            })}
          >
            Delete
          </button>
        )}
      </div>
      {act.error && <div className="sb-err">{act.error}</div>}
    </Modal>
  );
};

const History = ({ maker }) => {
  const { proposals } = useHQ();
  const name = maker.name.toLowerCase();
  const related = proposals.filter((p) => {
    const payload = parseJson(p.payloadJson, {});
    return payload.makerId === maker.id || String(payload.to || "").toLowerCase() === String(maker.contact?.value || "~").toLowerCase() || p.title.toLowerCase().includes(name);
  });
  if (!related.length) return <div className="sb-small sb-faint">No outreach or orders yet.</div>;
  return related.map((p) => (
    <div key={p.id} className="sb-small" style={{ padding: "3px 0" }}>
      {ACTIONS[p.actionType]?.label || p.actionType}: {p.title} <span className="sb-faint">· {p.execution?.status || p.status} · {ago(p.createdAt)}</span>
    </div>
  ));
};

export default function Makers() {
  const { makers } = useHQ();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, object edit
  const [open, setOpen] = useState(null);
  const shown = useMemo(
    () =>
      makers
        .filter((m) => filter === "all" || m.status === filter)
        .filter((m) => !q || `${m.name} ${m.location || ""} ${(m.products || []).map((p) => p.name || p).join(" ")}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [makers, filter, q]
  );
  return (
    <div>
      <div className="sb-pagehead">
        <div>
          <h1>Makers</h1>
          <div className="sb-sub">{makers.length} in the directory. Approved Scout Reports add prospects here.</div>
        </div>
        <button className="sb-btn clay" type="button" onClick={() => setEditing(null)}>
          Add a maker
        </button>
      </div>
      <div className="sb-row" style={{ marginBottom: 12 }}>
        <input className="sb-input" style={{ maxWidth: 280 }} placeholder="Search name, town, product" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sb-input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {MAKER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {!shown.length && <div className="sb-empty">No makers match.</div>}
      <div className="sb-cols2">
        {shown.map((m) => (
          <div className="sb-card" key={m.id} style={{ marginBottom: 0 }}>
            <div className="sb-between">
              <div>
                <b>{m.name}</b>
                <div className="sb-small sb-muted">
                  {m.location || "Location unknown"}
                  {m.distanceMiles != null ? ` · ${m.distanceMiles} mi` : ""}
                </div>
              </div>
              <span className={`sb-chip ${STATUS_TONE[m.status] || ""}`}>{m.status}</span>
            </div>
            {(m.products || []).length > 0 && (
              <div className="sb-taglist">
                {m.products.slice(0, 6).map((p, i) => (
                  <span className="sb-chip" key={i}>
                    {p.name || p}
                    {p.price != null ? ` · ${usd(p.price)}` : ""}
                  </span>
                ))}
              </div>
            )}
            <div className="sb-small sb-muted" style={{ marginTop: 6 }}>
              {[m.leadTime && `Lead ${m.leadTime}`, m.capacity && `Capacity ${m.capacity}`, m.contact?.value].filter(Boolean).join(" · ")}
            </div>
            <div className="sb-row" style={{ marginTop: 8 }}>
              <button className="sb-btn ghost sm" type="button" onClick={() => setEditing(m)}>
                Edit
              </button>
              <button className="sb-link" type="button" onClick={() => setOpen(open === m.id ? null : m.id)}>
                {open === m.id ? "Hide history" : "History"}
              </button>
              {m.website && (
                <a className="sb-small" href={m.website} target="_blank" rel="noreferrer noopener">
                  Website
                </a>
              )}
            </div>
            {open === m.id && (
              <div style={{ marginTop: 8 }}>
                {m.notes && <div className="sb-small sb-pre" style={{ marginBottom: 6 }}>{m.notes}</div>}
                <History maker={m} />
              </div>
            )}
          </div>
        ))}
      </div>
      {editing !== undefined && <MakerForm maker={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
