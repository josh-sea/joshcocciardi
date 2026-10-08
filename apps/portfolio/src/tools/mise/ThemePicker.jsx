import React from "react";
import { THEMES } from "./themes";

/* A row of round swatches, each split between the theme's main color and its
   highlight. Drawn from the theme's literal values rather than tokens so every
   swatch shows its own colors whatever theme it sits on. */
export default function ThemePicker({ value, onChange }) {
  return (
    <div className="themes" role="radiogroup" aria-label="Color theme">
      {THEMES.map((t) => (
        <button
          key={t.key}
          type="button"
          role="radio"
          aria-checked={value === t.key}
          className={`tsw${value === t.key ? " on" : ""}`}
          title={t.name}
          onClick={() => onChange(t.key)}
        >
          <span style={{ background: t.strong }} />
          <span style={{ background: t.hi }} />
        </button>
      ))}
    </div>
  );
}
