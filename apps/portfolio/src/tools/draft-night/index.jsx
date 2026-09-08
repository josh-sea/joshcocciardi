import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PLAYERS,
  BY_NAME,
  lookup,
  SLOTS,
  NEED,
  PICKNUMS,
  ROUNDS,
  BLOCKS,
  NEWS_CARDS,
  NEWS_NOTES,
  RULE_CARDS,
  RULE_NOTES,
  BIG_BYES,
  DRAFT_ORDER,
} from "./data";
import css from "./styles";

// ---------------------------------------------------------------------------
// Draft Night — a live decision tree for one seat in one league.
//
// Two pieces of state drive everything: `gone` (names off the board, however
// they left) and `mine` (names I took, in pick order). The tree prunes itself
// against `gone`, the clock reads the first surviving name in the first
// surviving branch of the current pick block, and marking a player MINE
// advances the clock to the next pick.
//
// State is mirrored to localStorage on every change: a draft lasts two hours
// on a phone that will lock, ring, and reload the tab at least once.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dn.draft.v1";
const TABS = [
  ["tree", "Tree"],
  ["board", "Board"],
  ["team", "My Team"],
  ["news", "News"],
  ["rules", "Rules"],
];

const posLabel = (pos) => (pos === "DST" ? "D/ST" : pos);
const arrowFor = (flag) => (flag === "up" ? "↑" : flag === "down" ? "↓" : flag === "hurt" ? "✚" : "");

const loadState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { gone: [], mine: [] };
    const parsed = JSON.parse(raw);
    const valid = (n) => typeof n === "string" && BY_NAME[n];
    return {
      gone: Array.isArray(parsed.gone) ? parsed.gone.filter(valid) : [],
      mine: Array.isArray(parsed.mine) ? parsed.mine.filter(valid) : [],
    };
  } catch (e) {
    return { gone: [], mine: [] };
  }
};

const DraftNight = () => {
  const [tab, setTab] = useState("tree");
  const [draft, setDraft] = useState(loadState);
  const [query, setQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [availOnly, setAvailOnly] = useState(false);
  const history = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  // The tool renders full-bleed over the site's white body, so paint the body
  // to match while it's mounted and hand it back on the way out.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#0C1A13";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      /* private mode / quota — the draft still works, it just won't survive a reload */
    }
  }, [draft]);

  const goneSet = useMemo(() => new Set(draft.gone), [draft.gone]);
  const mineSet = useMemo(() => new Set(draft.mine), [draft.mine]);

  const apply = useCallback((fn) => {
    setDraft((prev) => {
      history.current = [...history.current.slice(-49), prev];
      return fn(prev);
    });
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setDraft(prev);
    setCanUndo(history.current.length > 0);
  }, []);

  const reset = useCallback(() => {
    if (!window.confirm("Clear every strike and every pick?")) return;
    history.current = [];
    setCanUndo(false);
    setDraft({ gone: [], mine: [] });
  }, []);

  // Tap a name: struck if it was alive, alive again if it was struck (which
  // also un-claims it — you can't own a player who isn't off the board).
  const toggleGone = useCallback(
    (name) => {
      if (!BY_NAME[name]) return;
      apply((prev) => {
        const wasGone = prev.gone.includes(name);
        return wasGone
          ? { gone: prev.gone.filter((n) => n !== name), mine: prev.mine.filter((n) => n !== name) }
          : { gone: [...prev.gone, name], mine: prev.mine };
      });
    },
    [apply]
  );

  // MINE implies gone. Un-claiming leaves him off the board, since somebody
  // still took him — you just fat-fingered whose he is.
  const toggleMine = useCallback(
    (name) => {
      if (!BY_NAME[name]) return;
      apply((prev) => {
        const wasMine = prev.mine.includes(name);
        if (wasMine) return { gone: prev.gone, mine: prev.mine.filter((n) => n !== name) };
        return {
          gone: prev.gone.includes(name) ? prev.gone : [...prev.gone, name],
          mine: [...prev.mine, name],
        };
      });
    },
    [apply]
  );

  const minePlayers = useMemo(() => draft.mine.map((n) => BY_NAME[n]).filter(Boolean), [draft.mine]);
  const have = useCallback((pos) => minePlayers.filter((p) => p.pos === pos).length, [minePlayers]);
  const curIdx = Math.min(minePlayers.length, ROUNDS - 1);
  const draftDone = minePlayers.length >= ROUNDS;

  const branchState = useCallback(
    (br) => {
      if (br.fill && have(br.fill) >= NEED[br.fill]) return "covered";
      if (br.list.every((n) => goneSet.has(n))) return "dead";
      return "live";
    },
    [have, goneSet]
  );

  const activeBlock = BLOCKS.find((b) => b.idx.includes(curIdx));

  // The recommendation: first surviving name in the first surviving branch of
  // the block this pick belongs to. Backups are the next three alive names
  // anywhere in that block.
  const { rec, recBranch, backups } = useMemo(() => {
    if (!activeBlock || draftDone) return { rec: null, recBranch: null, backups: [] };
    let pick = null;
    let branch = null;
    for (const br of activeBlock.branches) {
      if (branchState(br) !== "live") continue;
      const first = br.list.map(lookup).find((p) => !goneSet.has(p.name));
      if (first) {
        pick = first;
        branch = br;
        break;
      }
    }
    const bk = [];
    for (const br of activeBlock.branches) {
      if (branchState(br) !== "live") continue;
      for (const name of br.list) {
        if (bk.length >= 3) break;
        if (goneSet.has(name)) continue;
        if (pick && name === pick.name) continue;
        if (!bk.some((p) => p.name === name)) bk.push(lookup(name));
      }
    }
    return { rec: pick, recBranch: branch, backups: bk };
  }, [activeBlock, branchState, goneSet, draftDone]);

  const picksAway = PICKNUMS[curIdx] - draft.gone.length - 1;

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return PLAYERS.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 7);
  }, [query]);

  const boardRows = useMemo(() => {
    const q = boardQuery.trim().toLowerCase();
    return PLAYERS.filter(
      (p) =>
        (filter === "ALL" || p.pos === filter) &&
        (!availOnly || !goneSet.has(p.name)) &&
        (!q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
    );
  }, [filter, availOnly, goneSet, boardQuery]);

  // ---- roster: fill the nine starting slots in pick order, best leftover in
  // the flex, everyone else on the bench.
  const roster = useMemo(() => {
    const pool = [...minePlayers];
    const take = (pos) => {
      const i = pool.findIndex((p) => p.pos === pos);
      return i === -1 ? null : pool.splice(i, 1)[0];
    };
    const starters = [
      ["QB", take("QB")],
      ["RB1", take("RB")],
      ["RB2", take("RB")],
      ["WR1", take("WR")],
      ["WR2", take("WR")],
      ["TE", take("TE")],
    ];
    const flexIdx = pool
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => ["RB", "WR", "TE"].includes(p.pos))
      .sort((a, b) => a.p.rk - b.p.rk)[0];
    starters.push(["FLEX", flexIdx ? pool.splice(flexIdx.i, 1)[0] : null]);
    starters.push(["D/ST", take("DST")]);
    starters.push(["K", take("K")]);
    const byes = {};
    starters.forEach(([, p]) => {
      if (p) byes[p.bye] = (byes[p.bye] || 0) + 1;
    });
    const clashes = Object.entries(byes)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1]);
    return { starters, bench: pool, clashes };
  }, [minePlayers]);

  const pickNumberOf = (name) => {
    const i = draft.mine.indexOf(name);
    return i === -1 ? null : PICKNUMS[i];
  };

  // ---- shared row pieces -------------------------------------------------
  const MineBtn = ({ name }) => (
    <button
      type="button"
      className={"mineBtn" + (mineSet.has(name) ? " on" : "")}
      onClick={(e) => {
        e.stopPropagation();
        toggleMine(name);
      }}
    >
      MINE
    </button>
  );

  const Leaf = ({ p, first }) => {
    const gone = goneSet.has(p.name);
    const isMine = mineSet.has(p.name);
    const arrow = arrowFor(p.flag);
    return (
      <div
        className={
          "leaf" + (gone ? " taken" : "") + (isMine ? " ours" : "") + (first ? " first" : "")
        }
        onClick={() => toggleGone(p.name)}
      >
        <span className={"pos " + p.pos}>{posLabel(p.pos)}</span>
        <span className="nm">{p.name}</span>
        <span className={"tag" + (p.flag ? " flag " + p.flag : "")}>
          {gone ? (isMine ? "YOURS" : "TAKEN") : (arrow ? arrow + " " : "") + (p.note || "bye " + p.bye)}
        </span>
        {!p.missing && <MineBtn name={p.name} />}
      </div>
    );
  };

  // ---- tabs --------------------------------------------------------------
  const treeTab = (
    <section>
      <div className="strike">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Heard a name? Type 3 letters, tap to kill it"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <div className="hits">
          {hits.map((p) => {
            const gone = goneSet.has(p.name);
            return (
              <button
                type="button"
                key={p.name}
                className={gone ? "undo" : ""}
                onClick={() => {
                  toggleGone(p.name);
                  setQuery("");
                }}
              >
                {gone ? "undo " + p.name : p.name}
                <span className="mini">
                  {posLabel(p.pos)} {p.rk}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="clock">
        {draftDone ? (
          <>
            <div className="lbl">Draft complete</div>
            <div className="big">You're done</div>
            <div className="pos2">Check your byes on the My Team tab before you leave.</div>
          </>
        ) : rec ? (
          <>
            <div className="lbl">
              On the clock — pick {PICKNUMS[curIdx]} · round {curIdx + 1}
            </div>
            <div className="big">{rec.name}</div>
            <div className="pos2">
              {posLabel(rec.pos)} · {rec.team} · bye {rec.bye} — {recBranch.t.toLowerCase()}
            </div>
            {backups.length > 0 && (
              <div className="then">
                Backups:{" "}
                {backups.map((p, i) => (
                  <React.Fragment key={p.name}>
                    {i > 0 && " · "}
                    <b>{p.name}</b>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className={"away" + (picksAway <= 0 ? " up" : "")}>
              <b>{picksAway <= 0 ? "UP NOW" : picksAway}</b>
              <span>
                {picksAway <= 0
                  ? `${draft.gone.length} players off the board`
                  : `${picksAway === 1 ? "pick" : "picks"} away · ${draft.gone.length} off the board`}
              </span>
            </div>
            <button type="button" className="takebtn" onClick={() => toggleMine(rec.name)}>
              TAKE {rec.name.toUpperCase()}
            </button>
          </>
        ) : (
          <>
            <div className="lbl">On the clock — pick {PICKNUMS[curIdx]}</div>
            <div className="big">Everything here is gone</div>
            <div className="pos2">Open the Board tab and take the best alive player.</div>
          </>
        )}
      </div>

      <div>
        {BLOCKS.map((b) => {
          const isPast = b.idx.every((i) => i < minePlayers.length);
          const isActive = b.idx.includes(curIdx) && !draftDone;
          return (
            <div
              key={b.label}
              className={"block" + (isPast ? " past" : "") + (isActive ? " active" : "")}
            >
              <div className="bhead">
                <h2>{b.label}</h2>
                <em>{b.picks}</em>
              </div>
              {b.branches.map((br) => {
                const st = branchState(br);
                let seenFirst = false;
                return (
                  <div key={br.t} className={"branch " + st}>
                    <div className="btitle">
                      <span className={"state " + (st === "live" ? "on" : st === "dead" ? "off" : "ok")}>
                        {st === "live" ? "OPEN" : st === "dead" ? "GONE" : "FILLED"}
                      </span>
                      <span>{br.t}</span>
                    </div>
                    {br.why && (
                      <div className="btitle" style={{ paddingTop: 0 }}>
                        <span className="why">{br.why}</span>
                      </div>
                    )}
                    {st === "live" &&
                      br.list.map(lookup).map((p) => {
                        const first = !goneSet.has(p.name) && !seenFirst;
                        if (first) seenFirst = true;
                        return <Leaf key={p.name} p={p} first={first} />;
                      })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="sub" style={{ margin: "14px 0 0" }}>
        Tap any name to kill it. Tap <b>MINE</b> when you take him — that advances the clock and
        prunes everything downstream. Everything you tap is saved on this device.
      </p>
    </section>
  );

  const boardTab = (
    <section>
      <div className="tools">
        <input
          type="search"
          value={boardQuery}
          onChange={(e) => setBoardQuery(e.target.value)}
          placeholder="Filter the 200 by name or team"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <div className="filters">
          {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((f) => (
            <button
              type="button"
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "ALL" ? "All" : posLabel(f)}
            </button>
          ))}
          <button type="button" aria-pressed={availOnly} onClick={() => setAvailOnly((v) => !v)}>
            Alive only
          </button>
        </div>
      </div>
      <p className="sub" style={{ margin: "9px 0 3px" }}>
        Full 200. Ranks are ESPN's 9/2 board; arrows are my half-PPR adjustment.{" "}
        {boardRows.length} shown.
      </p>
      <div>
        {boardRows.map((p) => {
          const gone = goneSet.has(p.name);
          const isMine = mineSet.has(p.name);
          const arrow = arrowFor(p.flag);
          return (
            <div key={p.name} className={"row" + (gone ? " gone" : "") + (isMine ? " own" : "")}>
              <div className="rk">{p.rk}</div>
              <span className={"pos " + p.pos}>{posLabel(p.pos)}</span>
              <div className="who" onClick={() => toggleGone(p.name)}>
                <div className="nm">{p.name}</div>
                <div className="meta">
                  {p.team} · bye {p.bye}
                  {p.note ? " · " : ""}
                  <span className={"flag " + p.flag}>
                    {arrow ? arrow + " " : ""}
                    {p.note}
                  </span>
                </div>
              </div>
              <MineBtn name={p.name} />
            </div>
          );
        })}
      </div>
    </section>
  );

  const teamTab = (
    <section>
      <p className="sub" style={{ marginBottom: 11 }}>
        {minePlayers.length} of {ROUNDS} picks in. Slots fill in the order you took them; the flex
        takes the best leftover skill player.
      </p>
      {roster.clashes.length > 0 && (
        <div className="note warn">
          <h3>Bye week pile-up</h3>
          <p>
            {roster.clashes.map(([wk, n], i) => (
              <React.Fragment key={wk}>
                {i > 0 && " "}
                {n} starters are off in week {wk}
                {BIG_BYES[wk] ? ` (${BIG_BYES[wk]})` : ""}.
              </React.Fragment>
            ))}{" "}
            Week 11 is the deep one this season, so keep a startable bench body for it.
          </p>
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        {roster.starters.map(([slot, p]) => (
          <div key={slot} className={"slotrow" + (p ? "" : " empty")}>
            <div className="lab">{slot}</div>
            {p ? (
              <>
                <span className={"pos " + p.pos}>{posLabel(p.pos)}</span>
                <div className="fill">
                  <div className="nm">{p.name}</div>
                  <div className="meta">
                    {p.team} · bye {p.bye} · rank {p.rk}
                  </div>
                </div>
                <div className="pk">pick {pickNumberOf(p.name)}</div>
              </>
            ) : (
              <div className="fill">
                <div className="nm">open</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <h2 style={{ margin: "18px 0 6px" }}>Bench</h2>
      {roster.bench.length === 0 ? (
        <p className="sub">Nothing on the bench yet.</p>
      ) : (
        roster.bench.map((p) => (
          <div key={p.name} className="slotrow">
            <div className="lab">BN</div>
            <span className={"pos " + p.pos}>{posLabel(p.pos)}</span>
            <div className="fill">
              <div className="nm">{p.name}</div>
              <div className="meta">
                {p.team} · bye {p.bye} · rank {p.rk}
              </div>
            </div>
            <div className="pk">pick {pickNumberOf(p.name)}</div>
          </div>
        ))
      )}
      <h2 style={{ margin: "18px 0 6px" }}>Still to come</h2>
      <p className="sub">
        {draftDone
          ? "No picks left."
          : PICKNUMS.slice(minePlayers.length).join(" · ")}
      </p>
    </section>
  );

  const newsTab = (
    <section>
      <p className="sub" style={{ marginBottom: 11 }}>
        Checked the morning of the draft. The ESPN sheet is from 9/2 and hasn't caught up on several
        of these.
      </p>
      {NEWS_CARDS.map((c) => (
        <div key={c.head} className={"note " + c.kind}>
          <h3>{c.head}</h3>
          <p>{c.body}</p>
        </div>
      ))}
      <dl style={{ marginTop: 14 }}>
        {NEWS_NOTES.map(([dt, dd]) => (
          <React.Fragment key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );

  const rulesTab = (
    <section>
      {RULE_CARDS.map((c) => (
        <div key={c.head} className="note key">
          <h3>{c.head}</h3>
          <p>{c.body}</p>
        </div>
      ))}
      <dl style={{ marginTop: 14 }}>
        {RULE_NOTES.map(([dt, dd]) => (
          <React.Fragment key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </React.Fragment>
        ))}
        <dt>Bye landmines</dt>
        <dd>
          <b>Week 11 has six teams:</b> Falcons, Browns, Packers, Rams, Patriots, Seahawks. Weeks 6,
          7, 8, 10 have four each.
        </dd>
      </dl>
      <h2 style={{ margin: "18px 0 6px" }}>Draft order</h2>
      <p className="sub">
        {DRAFT_ORDER.map((name, i) => (
          <React.Fragment key={name}>
            {i > 0 && " · "}
            {name === "you" ? (
              <b style={{ color: "var(--signal)" }}>{i + 1} you</b>
            ) : (
              `${i + 1} ${name}`
            )}
          </React.Fragment>
        ))}
      </p>
    </section>
  );

  const picksLeft = ROUNDS - minePlayers.length;

  return (
    <div className="dn">
      <style>{css}</style>

      <div className="wrap">
        <header>
          <div className="slot">
            <b>2</b>
            <span>of 10 · snake · half PPR · 5 bench · 4 of 10 make playoffs</span>
          </div>
          <div className="headbtns">
            <button type="button" onClick={undo} disabled={!canUndo}>
              UNDO
            </button>
            <button type="button" onClick={reset}>
              RESET
            </button>
          </div>
        </header>
      </div>

      <nav role="tablist">
        {TABS.map(([id, label]) => (
          <button
            type="button"
            role="tab"
            key={id}
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="wrap">
        {tab === "tree" && treeTab}
        {tab === "board" && boardTab}
        {tab === "team" && teamTab}
        {tab === "news" && newsTab}
        {tab === "rules" && rulesTab}

        <footer>
          Ranks from the ESPN 9/2 non-superflex board, cross-checked against FantasyPros 9/8. Your
          strikes and picks are saved in this browser; RESET clears them.
        </footer>
      </div>

      <div className="tray">
        <div className="inner">
          <div className="cnt">
            {Object.keys(SLOTS).map((pos) => {
              const n = have(pos);
              return (
                <span key={pos} className={n >= SLOTS[pos] ? "filled" : ""}>
                  {posLabel(pos)} {n}/{SLOTS[pos]}
                </span>
              );
            })}
          </div>
          <b>{picksLeft <= 0 ? "roster full" : picksLeft === 1 ? "1 pick left" : picksLeft + " picks left"}</b>
        </div>
      </div>
    </div>
  );
};

export default DraftNight;
