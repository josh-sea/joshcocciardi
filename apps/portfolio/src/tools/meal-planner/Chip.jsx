import React from "react";

// What each kind of pick is, in words, for screen readers and the legend.
// The visual difference is carried by fill as well as hue (solid, tinted,
// outlined), so it still reads in grayscale or with color blindness. A new
// kind needs an entry here and a .chip.<kind> rule in styles.js.
export const KINDS = {
  recipe: "Recipe",
  inventory: "Inventory",
  text: "Typed in",
};

/* One thing in a slot. Recipes are solid and inventory a tint of the same
   green, since recipes are made from inventory; typed-in meals are outlined.
   The ✕ removes it right there, without opening the picker. */
export default function Chip({ pick, onRemove }) {
  return (
    <span className={`chip ${pick.kind}`}>
      <span className="sr">{KINDS[pick.kind]}: </span>
      {pick.name}
      {onRemove && (
        <button
          type="button"
          className="chipx"
          aria-label={`Remove ${pick.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

export const KindDot = ({ kind }) => <span className={`dot ${kind}`} aria-hidden="true" />;

export const Legend = () => (
  <div className="legend" aria-hidden="true">
    {Object.entries(KINDS).map(([kind, label]) => (
      <span key={kind} className="legenditem">
        <KindDot kind={kind} />
        {label}
      </span>
    ))}
  </div>
);
