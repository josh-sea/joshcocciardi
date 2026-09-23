import React, { useCallback, useEffect, useMemo, useState } from "react";
import CSS from "./styles";
import Inventory from "./Inventory";
import Recipes from "./Recipes";
import Shopping from "./Shopping";
import WeekPlan from "./WeekPlan";
import { HouseholdSetup, KitchenSettings } from "./Household";
import { authMessage, redirectSettled, signInWithGoogle, signOutOfMealPlanner, watchAuth } from "./auth";
import { inStock, kitchenConfig } from "./plan";
import { addRecipe, stockItems, watchHouseholds, watchInventory, watchRecipes } from "./store";

// ---------------------------------------------------------------------------
// Family Meal Planner: the weekly plan, recipes, inventory, and a shopping
// list, over one shared household. Nothing matches recipes to inventory or
// recommends anything yet. The plan draws its choices from recipes and what's
// in stock, and tapping Ate on the plan feeds back into both: recipes get
// marked made and rated, inventory gets struck through and relisted.
// ---------------------------------------------------------------------------

const TABS = [
  ["plan", "Plan"],
  ["recipes", "Recipes"],
  ["inventory", "Inventory"],
  ["shopping", "Shopping"],
];

const TAB_KEY = "mealplan.tab";
const readTab = () => {
  try {
    const t = window.localStorage.getItem(TAB_KEY);
    return TABS.some(([k]) => k === t) ? t : "plan";
  } catch (e) {
    return "plan";
  }
};
const writeTab = (t) => {
  try {
    window.localStorage.setItem(TAB_KEY, t);
  } catch (e) {
    /* private mode: the tab just won't be remembered */
  }
};

const explain = (e) =>
  e?.code === "permission-denied"
    ? "Firestore rules blocked that. If this is the first run, deploy the rules (./deploy.sh firestore) and reload."
    : e?.message || String(e);

function Gate({ error, onSignIn, busy }) {
  return (
    <div className="gate">
      <div className="card form" style={{ maxWidth: 400 }}>
        <div className="brand">Family Meal Planner</div>
        <h1 className="h1">What's for dinner?</h1>
        <p className="muted">Recipes, the week's plan, and what's in the kitchen, shared by the whole house.</p>
        <button className="btn" type="button" disabled={busy} onClick={onSignIn}>
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

export default function MealPlanner() {
  const [user, setUser] = useState(undefined); // undefined while auth resolves
  const [authErr, setAuthErr] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [households, setHouseholds] = useState(undefined);
  const [recipes, setRecipes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [tab, setTab] = useState(readTab);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = () => {};
    let live = true;
    // Wait for a pending Google redirect to land before deciding "signed out".
    redirectSettled.then(() => {
      if (live) off = watchAuth((u) => setUser(u || null));
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  // iOS Safari zooms the page when a text field gets focus and never zooms
  // back, which left the picker half off screen. maximum-scale stops that
  // auto-zoom; iOS still allows pinch zoom regardless, so nobody loses the
  // ability to enlarge the page. Only while this tool is on screen.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return undefined;
    const before = meta.getAttribute("content");
    meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");
    return () => meta.setAttribute("content", before);
  }, []);

  const onError = useCallback((e) => {
    console.error("[meal-planner]", e);
    setError(explain(e));
  }, []);

  const verified = !!user && user.emailVerified && !!user.email;

  useEffect(() => {
    setHouseholds(undefined);
    if (!verified) return undefined;
    return watchHouseholds(user.email, setHouseholds, (e) => {
      onError(e);
      setHouseholds([]);
    });
  }, [user, verified, onError]);

  const household = households && households[0];
  // Who's in the kitchen and how each meal is laid out, defaults filled in.
  // Keyed on the saved fields so the plan only re-derives when they change.
  const config = useMemo(
    () => kitchenConfig(household),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(household?.people), JSON.stringify(household?.sections)]
  );

  // The id the recipe, inventory, and plan listeners run against. It only
  // takes a household once the server has confirmed it: listening under a
  // household that's still just a local write gets permission-denied (the
  // rules read membership from the stored document) and the listener dies.
  // Once confirmed it sticks, so a later pending edit to the member list
  // doesn't tear the listeners down.
  const [hid, setHid] = useState(null);
  useEffect(() => {
    if (!household) setHid(null);
    else if (!household.pending) setHid(household.id);
  }, [household]);

  useEffect(() => {
    setRecipes([]);
    setInventory([]);
    if (!hid) return undefined;
    const a = watchRecipes(hid, setRecipes, onError);
    const b = watchInventory(hid, setInventory, onError);
    return () => {
      a();
      b();
    };
  }, [hid, onError]);

  const signIn = async () => {
    setAuthBusy(true);
    setAuthErr(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthErr(authMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const pickTab = (t) => {
    setTab(t);
    setShowSettings(false);
    writeTab(t);
    window.scrollTo(0, 0);
  };

  const quickRecipe = useCallback((name) => addRecipe(hid, user.uid, { name, link: "", ingredients: "" }), [hid, user]);
  // Adding from the plan's picker puts the items in stock (reviving used-up
  // rows of the same names) and returns their ids for the slot.
  const quickItems = useCallback((names) => stockItems(hid, user.uid, names, inventory), [hid, user, inventory]);
  const stock = useMemo(() => inventory.filter(inStock), [inventory]);
  const listCount = inventory.filter((i) => i.onList).length;

  let body;
  if (user === undefined) {
    body = <div className="center">checking your session…</div>;
  } else if (!user) {
    body = <Gate error={authErr} busy={authBusy} onSignIn={signIn} />;
  } else if (!verified) {
    body = (
      <div className="gate">
        <div className="card form" style={{ maxWidth: 400 }}>
          <h2 className="h2">Use Google to sign in</h2>
          <p className="muted">
            {user.email || "This account"} isn't a verified address, and kitchens are shared by verified email. Sign out
            and continue with Google instead.
          </p>
          <button className="btn" type="button" onClick={signOutOfMealPlanner}>
            Sign out
          </button>
        </div>
      </div>
    );
  } else if (households === undefined || (household && !hid)) {
    body = <div className="center">opening the kitchen…</div>;
  } else if (!household) {
    body = <HouseholdSetup user={user} onError={onError} />;
  } else if (showSettings) {
    body = (
      <KitchenSettings
        household={household}
        config={config}
        user={user}
        onError={onError}
        onClose={() => setShowSettings(false)}
      />
    );
  } else if (tab === "recipes") {
    body = <Recipes hid={hid} user={user} people={config.active} recipes={recipes} onError={onError} />;
  } else if (tab === "inventory") {
    body = <Inventory hid={hid} user={user} inventory={inventory} onError={onError} />;
  } else if (tab === "shopping") {
    body = <Shopping hid={hid} user={user} inventory={inventory} onError={onError} />;
  } else {
    body = (
      <WeekPlan
        hid={hid}
        config={config}
        recipes={recipes}
        inventory={inventory}
        stock={stock}
        onAddRecipe={quickRecipe}
        onAddInventory={quickItems}
        onError={onError}
      />
    );
  }

  return (
    <div className="mp">
      <style>{CSS}</style>
      {user && (
        <header className="top">
          <div className="topline">
            <span className="brand">{household ? household.name : "Family Meal Planner"}</span>
            <span className="acct">
              {household && (
                <button className="linkish" type="button" onClick={() => setShowSettings(!showSettings)}>
                  settings
                </button>
              )}
              <button className="linkish" type="button" onClick={signOutOfMealPlanner}>
                sign out
              </button>
            </span>
          </div>
          {household && (
            <nav className="tabs">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={tab === k && !showSettings ? "on" : ""}
                  aria-current={tab === k && !showSettings ? "page" : undefined}
                  onClick={() => pickTab(k)}
                >
                  {label}
                  {k === "shopping" && listCount > 0 && <span className="badge">{listCount}</span>}
                </button>
              ))}
            </nav>
          )}
        </header>
      )}
      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button className="iconbtn" type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {body}
    </div>
  );
}
