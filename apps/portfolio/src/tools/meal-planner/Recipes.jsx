import React, { useMemo, useState } from "react";
import { addRecipe, deleteRecipe, setRating, updateRecipe } from "./store";
import { normalizeLink, ratingSummary, shortDate, sourceLabel, todayKey } from "./plan";

const THUMBS = [
  { value: "up", icon: "👍", label: "thumbs up" },
  { value: "neutral", icon: "😐", label: "neutral" },
  { value: "down", icon: "👎", label: "thumbs down" },
];

const SORTS = [
  ["name", "A to Z"],
  ["recent", "Recently made"],
  ["liked", "Most liked"],
];

/* Name, where it came from, and the ingredients. That's the whole add form:
   ratings and "made it" happen later, whenever someone gets to them. */
function RecipeForm({ initial, onSave, onCancel, saveLabel }) {
  const [name, setName] = useState(initial?.name || "");
  const [mode, setMode] = useState(initial && !initial.link ? "typed" : "link");
  const [link, setLink] = useState(initial?.link || "");
  const [ingredients, setIngredients] = useState(initial?.ingredients || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const cleanLink = mode === "link" ? normalizeLink(link) : "";
    if (!name.trim()) return setError("Give it a name.");
    if (mode === "link" && link.trim() && !cleanLink) return setError("That link doesn't look like a web address.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), link: cleanLink, ingredients });
      if (!initial) {
        setName("");
        setLink("");
        setIngredients("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label className="field">
        <span className="flabel">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sheet pan chicken" />
      </label>

      <div className="field">
        <span className="flabel">Source</span>
        <div className="seg">
          <button type="button" className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>
            Link
          </button>
          <button type="button" className={mode === "typed" ? "on" : ""} onClick={() => setMode("typed")}>
            Typed in
          </button>
        </div>
        {mode === "link" && (
          <input
            className="input"
            style={{ marginTop: 8 }}
            type="text"
            inputMode="url"
            autoCapitalize="off"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a link"
          />
        )}
      </div>

      <label className="field">
        <span className="flabel">Ingredients</span>
        <textarea
          className="input"
          rows={4}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="Anything goes: a list, a paragraph, a note to self"
        />
      </label>

      {error && <div className="err">{error}</div>}
      <div className="row gap">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : saveLabel}
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function RecipeCard({ hid, people, recipe, onError }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { up, down, rated } = ratingSummary(recipe.ratings, people);

  // Marking as made stamps today's date. Unmarking clears it, since a last
  // made date on something never made would be a contradiction.
  const toggleMade = () =>
    updateRecipe(hid, recipe.id, recipe.made ? { made: false, lastMade: null } : { made: true, lastMade: todayKey() }).catch(
      onError
    );

  const rate = (person, value) =>
    setRating(hid, recipe.id, person, recipe.ratings[person] === value ? null : value).catch(onError);

  const remove = () => {
    if (window.confirm(`Delete “${recipe.name}”? Days that planned it keep the name.`)) {
      deleteRecipe(hid, recipe.id).catch(onError);
    }
  };

  if (editing) {
    return (
      <RecipeForm
        initial={recipe}
        saveLabel="Save changes"
        onCancel={() => setEditing(false)}
        onSave={async (data) => {
          await updateRecipe(hid, recipe.id, data);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <article className="card recipe">
      <div className="rhead">
        <button className="rname" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          {recipe.name}
        </button>
        <label className={`made ${recipe.made ? "on" : ""}`}>
          <input type="checkbox" checked={recipe.made} onChange={toggleMade} />
          Made it
        </label>
      </div>

      <div className="rmeta">
        {recipe.link ? (
          <a href={recipe.link} target="_blank" rel="noopener noreferrer">
            {sourceLabel(recipe.link)} ↗
          </a>
        ) : (
          <span>typed in</span>
        )}
        {recipe.lastMade && <span>last made {shortDate(recipe.lastMade)}</span>}
        {rated > 0 && (
          <span>
            {up > 0 && `👍 ${up}`} {down > 0 && `👎 ${down}`} {rated < people.length && `· ${rated}/${people.length} rated`}
          </span>
        )}
      </div>

      <div className="ratings">
        {people.map((p) => (
          <div key={p.key} className="rate">
            <span className="who">{p.name}</span>
            <span className="thumbs">
              {THUMBS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={recipe.ratings[p.key] === t.value ? "on" : ""}
                  aria-pressed={recipe.ratings[p.key] === t.value}
                  aria-label={`${p.name}: ${t.label}`}
                  onClick={() => rate(p.key, t.value)}
                >
                  {t.icon}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>

      {open && (
        <div className="rbody">
          {recipe.ingredients ? <p className="ingredients">{recipe.ingredients}</p> : <p className="muted small">No ingredients yet.</p>}
          <div className="row gap">
            {recipe.made && (
              <button
                className="chipbtn"
                type="button"
                onClick={() => updateRecipe(hid, recipe.id, { lastMade: todayKey() }).catch(onError)}
                disabled={recipe.lastMade === todayKey()}
              >
                Made it again today
              </button>
            )}
            <button className="chipbtn" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="chipbtn danger" type="button" onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Recipes({ hid, user, people, recipes, onError }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? recipes.filter((r) => r.name.toLowerCase().includes(needle) || r.ingredients.toLowerCase().includes(needle))
      : [...recipes];
    if (sort === "recent") hits.sort((a, b) => (b.lastMade || "").localeCompare(a.lastMade || ""));
    if (sort === "liked") {
      const score = (r) => {
        const s = ratingSummary(r.ratings, people);
        return s.up - s.down;
      };
      hits.sort((a, b) => score(b) - score(a));
    }
    return hits;
  }, [recipes, people, q, sort]);

  return (
    <div className="page">
      <div className="pagehead">
        <h2 className="h2">Recipes</h2>
        <button className="btn small" type="button" onClick={() => setAdding(!adding)}>
          {adding ? "Close" : "+ Add recipe"}
        </button>
      </div>

      {adding && (
        <RecipeForm saveLabel="Save recipe" onSave={(data) => addRecipe(hid, user.uid, data)} onCancel={() => setAdding(false)} />
      )}

      {recipes.length > 0 && (
        <div className="filters">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes or ingredients" />
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}

      {recipes.length === 0 && !adding && (
        <div className="empty">
          No recipes yet. Add the ones you make on repeat and they'll show up when you plan dinner.
        </div>
      )}

      {rows.map((r) => (
        <RecipeCard key={r.id} hid={hid} people={people} recipe={r} onError={onError} />
      ))}
      {recipes.length > 0 && rows.length === 0 && <div className="muted small pad">Nothing matches “{q}”.</div>}
    </div>
  );
}
