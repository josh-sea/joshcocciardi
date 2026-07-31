import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccountBar from "./AccountBar";
import { Cell, PlanView } from "./Chart";
import { logEvent, saveTree } from "./store";
import {
  COMPLETE_COLOR,
  MAX_DEPTH,
  OWNERS,
  OWNER_ORDER,
  buildLayout,
  canNest,
  findPath,
  leavesOf,
  mapTree,
  node as makeNode,
  removeNode,
} from "./tree";

/* How long to sit on an edit before writing. Long enough that renaming a step
   is one write instead of one per keystroke, short enough that it lands before
   a user can tab away — and unmount/pagehide flush anyway. */
const SAVE_DELAY = 600;

export default function Editor({ user, impl, onExit, onSignOut, onRename }) {
  const implId = impl.id;

  const [tree, setTree] = useState(() => impl.tree);
  const [layout, setLayout] = useState(() => impl.layout);
  const [selId, setSelId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const [notice, setNotice] = useState(null);

  // Refs shadow the state so the debounced write always sees the newest tree
  // rather than whatever was current when the timer was set.
  const treeRef = useRef(tree);
  const layoutRef = useRef(layout);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const syncedRef = useRef(JSON.stringify(impl.tree));

  /* ------------------------- persistence ------------------------- */

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const t = treeRef.current;
    const l = layoutRef.current;
    const stamp = JSON.stringify(t);
    try {
      await saveTree(implId, t, l);
      syncedRef.current = stamp;
      // Another edit may have landed while this write was in flight; only
      // call it clean if nothing changed underneath us.
      if (treeRef.current === t && layoutRef.current === l) {
        dirtyRef.current = false;
        setSaveState("saved");
      }
    } catch (e) {
      console.error("[mise] save failed:", e);
      setSaveState("error");
    }
  }, [implId]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState("saving");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Don't strand a pending edit when the tab is hidden, closed, or unmounted.
  useEffect(() => {
    const flushIfDirty = () => {
      if (dirtyRef.current) flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushIfDirty();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushIfDirty);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushIfDirty);
      flushIfDirty();
    };
  }, [flush]);

  // Adopt changes made in another tab or on another device, but never while a
  // local edit is still on its way to Firestore.
  useEffect(() => {
    if (!impl.tree || dirtyRef.current) return;
    const incoming = JSON.stringify(impl.tree);
    if (incoming === syncedRef.current) return;
    syncedRef.current = incoming;
    treeRef.current = impl.tree;
    layoutRef.current = impl.layout;
    setTree(impl.tree);
    setLayout(impl.layout);
  }, [impl]);

  const commitState = useCallback(
    (nextTree, layoutPatch) => {
      if (nextTree) {
        treeRef.current = nextTree;
        setTree(nextTree);
      }
      if (layoutPatch) {
        const next = { ...layoutRef.current, ...layoutPatch };
        layoutRef.current = next;
        setLayout(next);
      }
      markDirty();
    },
    [markDirty]
  );

  const update = useCallback(
    (id, fn) => commitState(mapTree(treeRef.current, id, fn)),
    [commitState]
  );

  /* --------------------------- derived --------------------------- */

  const path = useMemo(() => findPath(tree, layout.focusId) || [tree], [tree, layout.focusId]);
  const focus = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const { cells, totalRows } = useMemo(
    () => buildLayout(focus, layout.depthWindow),
    [focus, layout.depthWindow]
  );

  const sel = selId ? (findPath(tree, selId) || []).slice(-1)[0] : null;
  const selInView = sel && cells.some((c) => c.node.id === sel.id) ? sel : null;

  /* --------------------------- actions --------------------------- */

  const zoomTo = (id) => {
    commitState(null, { focusId: id });
    setSelId(null);
  };

  const insert = (parentId, build) => {
    if (!canNest(treeRef.current, parentId)) {
      setNotice(`Steps only nest ${MAX_DEPTH} levels deep. Re-root and build the branch from there.`);
      return;
    }
    const fresh = makeNode("New step", "us");
    commitState(mapTree(treeRef.current, parentId, (x) => build(x, fresh)));
    logEvent(implId, user.uid, { nodeId: fresh.id, nodeName: fresh.name, type: "opened" });
    setNotice(null);
    setSelId(fresh.id);
    setEditingId(fresh.id);
  };

  const addChild = (id) => insert(id, (x, fresh) => ({ ...x, children: [...x.children, fresh] }));

  const addSibling = (id) => {
    const trail = findPath(treeRef.current, id);
    if (!trail || trail.length < 2) return;
    const p = trail[trail.length - 2];
    insert(p.id, (x, fresh) => {
      const i = x.children.findIndex((c) => c.id === id);
      const next = [...x.children];
      next.splice(i + 1, 0, fresh);
      return { ...x, children: next };
    });
  };

  const commitName = (id, value) => {
    update(id, (x) => ({ ...x, name: value.trim() || "Untitled step" }));
    setEditingId(null);
  };

  const cycleOwner = (id) =>
    update(id, (x) => ({ ...x, owner: OWNER_ORDER[(OWNER_ORDER.indexOf(x.owner) + 1) % 3] }));

  const toggleDone = (id) => {
    const target = (findPath(treeRef.current, id) || []).slice(-1)[0];
    if (!target) return;
    update(id, (x) => ({ ...x, done: !x.done }));
    logEvent(implId, user.uid, {
      nodeId: id,
      nodeName: target.name,
      type: target.done ? "reopened" : "closed",
    });
  };

  const remove = (id) => {
    const trail = findPath(treeRef.current, id);
    if (!trail || trail.length < 2) return;
    const doomed = trail[trail.length - 1];
    const next = removeNode(treeRef.current, id);
    // Only move the outcome if it was inside what just got deleted; deleting a
    // node further down the chart shouldn't yank the view around.
    const focusLost = findPath(doomed, layoutRef.current.focusId);
    commitState(next, focusLost ? { focusId: trail[trail.length - 2].id } : null);
    // Close the ledger entry for anything that was opened but never finished,
    // otherwise a deleted step reads as forever-open in the cycle-time math.
    leavesOf(doomed)
      .filter((l) => !l.done)
      .forEach((l) =>
        logEvent(implId, user.uid, { nodeId: l.id, nodeName: l.name, type: "deleted" })
      );
    setSelId(null);
  };

  /* ---------------------------- render --------------------------- */

  const labels = Array.from({ length: layout.depthWindow }, (_, i) => {
    const out = layout.depthWindow - i - 1;
    return out === 0 ? "outcome" : `${out} step${out > 1 ? "s" : ""} out`;
  });
  const gridCols = `repeat(${layout.depthWindow}, minmax(128px, 1fr))`;
  const frameMin = layout.depthWindow * 132;

  const selIsFocus = selInView && selInView.id === focus.id;
  const selIsLeaf = selInView && selInView.children.length === 0;
  const selHasKids = selInView && selInView.children.length > 0;

  const saveLabel =
    saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "not saved";

  return (
    <>
      <div className="bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="up" onClick={onExit} title="All implementations">
            ◂ plans
          </button>
          <button
            className="crumb"
            style={{ fontFamily: "'IBM Plex Sans Condensed',sans-serif", fontSize: 15, fontWeight: 600 }}
            onClick={onRename}
            title="Rename this implementation"
          >
            {impl.name}
          </button>
          <span className={`state${saveState === "saved" ? "" : saveState === "error" ? " failed" : " dirty"}`}>
            {saveLabel}
          </span>
          {saveState === "error" && (
            <button className="linkish" onClick={flush}>
              retry
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <AccountBar user={user} onSignOut={onSignOut} />
          </div>
        </div>

        <div className="navrow">
          <div className="seg">
            {[3, 4, 5].map((d) => (
              <button
                key={d}
                className={layout.depthWindow === d ? "on" : ""}
                onClick={() => commitState(null, { depthWindow: d })}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="seg">
            <button
              className={layout.view === "chart" ? "on" : ""}
              onClick={() => commitState(null, { view: "chart" })}
            >
              chart
            </button>
            <button
              className={layout.view === "plan" ? "on" : ""}
              onClick={() => commitState(null, { view: "plan" })}
            >
              plan
            </button>
          </div>
        </div>

        <div className="navrow">
          <button className="up" disabled={!parent} onClick={() => parent && zoomTo(parent.id)}>
            ◂ up
          </button>
          {path.map((x, i) => (
            <React.Fragment key={x.id}>
              {i > 0 && <span className="sep">▸</span>}
              <button
                className={`crumb${i === path.length - 1 ? " here" : ""}`}
                onClick={() => zoomTo(x.id)}
              >
                {x.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {notice && (
        <div className="hint" style={{ padding: "12px 16px 0", color: "#9B3A2E" }}>
          {notice}
        </div>
      )}

      {layout.view === "chart" ? (
        <>
          <div className="scroller">
            <div className="colhead" style={{ gridTemplateColumns: gridCols, minWidth: frameMin }}>
              {labels.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
            <div
              className="frame"
              style={{
                gridTemplateColumns: gridCols,
                gridTemplateRows: `repeat(${totalRows}, minmax(52px, auto))`,
                minWidth: frameMin,
              }}
            >
              {cells.map((item) => (
                <Cell
                  key={item.node.id}
                  item={item}
                  depthWindow={layout.depthWindow}
                  selected={selId === item.node.id}
                  editing={editingId === item.node.id}
                  onSelect={(id) => setSelId(id === selId ? null : id)}
                  onCommit={commitName}
                />
              ))}
            </div>
          </div>

          <div className="legend">
            {OWNER_ORDER.map((k) => (
              <span key={k}>
                <span className="swatch" style={{ background: OWNERS[k].color }} />
                {OWNERS[k].label}
              </span>
            ))}
            <span>
              <span className="swatch" style={{ background: COMPLETE_COLOR }} />
              complete
            </span>
          </div>

          <div className="hint">
            tap any block to select it · amber badge means a branch is collapsed, use “open” to re-root
            there · the bottom rule is one tick per end step underneath, so a merge block shows real
            progress before anything near it is finished · every change saves to your account
          </div>
        </>
      ) : (
        <PlanView root={focus} />
      )}

      {selInView && (
        <div className="dock">
          <div className="dockname">
            <span className="pill" style={{ background: OWNERS[selInView.owner].color }}>
              {OWNERS[selInView.owner].label}
            </span>
            <span>{selInView.name}</span>
          </div>
          <div className="acts">
            {selHasKids && !selIsFocus && (
              <button className="act solid" onClick={() => zoomTo(selInView.id)}>
                open ▸
              </button>
            )}
            {selIsFocus && parent && (
              <button className="act solid" onClick={() => zoomTo(parent.id)}>
                ◂ up a level
              </button>
            )}
            {selIsLeaf && (
              <button className="act solid" onClick={() => toggleDone(selInView.id)}>
                {selInView.done ? "reopen" : "mark done"}
              </button>
            )}
            <button className="act" onClick={() => setEditingId(selInView.id)}>
              rename
            </button>
            <button
              className="act"
              disabled={!canNest(tree, selInView.id)}
              onClick={() => addChild(selInView.id)}
            >
              ＋ step left
            </button>
            {selInView.id !== tree.id && (
              <button className="act" onClick={() => addSibling(selInView.id)}>
                ＋ row below
              </button>
            )}
            {selIsLeaf && (
              <button className="act" onClick={() => cycleOwner(selInView.id)}>
                owner ▸
              </button>
            )}
            {selInView.id !== tree.id && (
              <button className="act danger" onClick={() => remove(selInView.id)}>
                delete
              </button>
            )}
            <button className="act" onClick={() => setSelId(null)}>
              close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
