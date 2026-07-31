import React from "react";

const initials = (user) => {
  const source = user.displayName || user.email || "?";
  const parts = source.replace(/@.*/, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
};

/* Who's signed in, plus the way out. Sits in the top bar of both screens. */
export default function AccountBar({ user, onSignOut }) {
  return (
    <div className="who">
      <span className="avatar" aria-hidden="true">
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(user)}
      </span>
      <span
        style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={user.email || ""}
      >
        {user.displayName || user.email}
      </span>
      <button className="linkish" type="button" onClick={onSignOut}>
        sign out
      </button>
    </div>
  );
}
