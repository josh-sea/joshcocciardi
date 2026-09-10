import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PLAYERS,
  BY_NAME,
  lookup,
  BLOCKS,
  NEWS_CARDS,
  NEWS_NOTES,
  RULE_CARDS,
  RULE_NOTES,
  BIG_BYES,
  DRAFT_ORDER,
} from "./data";
import {
  PRESETS,
  configFromPreset,
  normalizeConfig,
  pickNumbers,
  positionTargets,
  scoringLabel,
  starterSlots,
  flexEligible,
  treeFits,
} from "./league";
import { bestAvailable } from "./recommend";
import { watchAuth, signOutOfDraftNight } from "./auth";
import { createLeague, deleteLeague, saveDraft, saveSettings, watchLeagues } from "./store";
import LeagueScreen from "./LeagueScreen";
import css from "./styles";

// ---------------------------------------------------------------------------
// Draft Night — a live draft board.
//
// Two pieces of state drive the whole tool: `gone` (names off the board,
// however they left) and `mine` (names I took, in pick order). Everything else
// — the clock, the pruned branches, the roster, the tray — is derived.
//
// Where that state lives depends on whether you're signed in. Signed out, it's
// localStorage and one league config, which is exactly how the tool shipped.
// Signed in, each league is a Firestore document that carries its own config
// and its own draft, so one account can hold several drafts and pick any of
// them back up on another device.
// ---------------------------------------------------------------------------

const DRAFT_KEY = "dn.draft.v1";
const LEAGUE_KEY = "dn.league.v1";
// Set once this browser's draft has been copied into an account, so the
// "import" offer doesn't keep reappearing over a draft that's already saved.
const IMPORTED_KEY = "dn.importedAt";
const lastLeagueKey = (uid) => `dn.lastLeague.${uid}`;

const TABS = [
  ["tree", "Tree"],
  ["board", "Board"],
  ["team", "My Team"],
  ["news", "News"],
  ["rules", "Rules"],
];

const posLabel = (pos) => (pos === "DST" ? "D/ST" : pos);
const arrowFor = (flag) => (flag === "up" ? "↑" : flag === "down" ? "↓" : flag === "hurt" ? "✚" : "");
const readLS = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};
const writeLS = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* private mode or quota — the draft still works, it just won't survive a reload */
  }
};

const loadLocalDraft = () => {
  try {
    const parsed = JSON.parse(readLS(DRAFT_KEY) || "{}");
    const valid = (n) => typeof n === "string" && BY_NAME[n];
    return {
      gone: Array.isArray(parsed.gone) ? parsed.gone.filter(valid) : [],
      mine: Array.isArray(parsed.mine) ? parsed.mine.filter(valid) : [],
    };
  } catch (e) {
    return { gone: [], mine: [] };
  }
};

// The signed-out league. Defaults to the league this tool was built for, so a
// reload of an in-progress draft finds exactly what it left behind.
const loadLocalLeague = () => {
  try {
    const parsed = JSON.parse(readLS(LEAGUE_KEY) || "{}");
    return {
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : PRESETS.josh.label,
      preset: PRESETS[parsed.preset] ? parsed.preset : "josh",
      config: normalizeConfig(parsed.config || configFromPreset("josh")),
    };
  } catch (e) {
    return { name: PRESETS.josh.label, preset: "josh", config: configFromPreset("josh") };
  }
};

const DraftNight = () => {
  const [tab, setTab] = useState("tree");
  const [screen, setScreen] = useState("draft");
  const [query, setQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [availOnly, setAvailOnly] = useState(false);

  const [user, setUser] = useState(undefined); // undefined while auth resolves
  const [leagues, setLeagues] = useState([]);
  // The uid whose league list has actually arrived. A boolean "loading" flag
  // can't be trusted here: on the render where auth resolves, a setState from
  // this same pass hasn't landed yet, so the flag still reads false and any
  // guard using it fires against an empty list. Comparing against the uid has
  // no such window — it only matches after a snapshot for that user.
  const [loadedFor, setLoadedFor] = useState(null);
  const [listError, setListError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [notice, setNotice] = useState(null);

  const [localLeague, setLocalLeague] = useState(loadLocalLeague);
  const [localDraft, setLocalDraft] = useState(loadLocalDraft);
  const [localImported, setLocalImported] = useState(() => Boolean(readLS(IMPORTED_KEY)));

  const history = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const importedRef = useRef(false);
  const restoredRef = useRef(false);

  // The tool renders full-bleed over the site's white body, so paint the body
  // to match while it's mounted and hand it back on the way out.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#0C1A13";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  useEffect(() => watchAuth((u) => setUser(u || null)), []);

  useEffect(() => {
    writeLS(DRAFT_KEY, JSON.stringify(localDraft));
  }, [localDraft]);
  useEffect(() => {
    writeLS(LEAGUE_KEY, JSON.stringify(localLeague));
  }, [localLeague]);

  // The signed-in user's leagues, live.
  useEffect(() => {
    restoredRef.current = false;
    importedRef.current = false;
    if (!user) {
      setLeagues([]);
      setActiveId(null);
      setLoadedFor(null);
      return undefined;
    }
    setLoadedFor(null);
    setListError(null);
    return watchLeagues(
      user.uid,
      (rows) => {
        setLeagues(rows);
        setLoadedFor(user.uid);
        // Reopen whatever was open last, falling back to the most recently
        // touched league. Done on the first snapshot rather than in an effect
        // of its own, which would run against a list that hasn't arrived yet.
        if (!restoredRef.current && rows.length) {
          restoredRef.current = true;
          const last = readLS(lastLeagueKey(user.uid));
          setActiveId(rows.some((r) => r.id === last) ? last : rows[0].id);
        }
      },
      (e) => {
        console.error("[draft-night] league list failed:", e);
        setListError(
          e.code === "permission-denied"
            ? "Firestore rules are blocking this account. Deploy the Draft Night rules (./deploy.sh firestore) and reload."
            : e.message
        );
      }
    );
  }, [user]);

  // Signed out there is nothing to wait for; signed in, the list has to land
  // before anything reads it.
  const listLoading = Boolean(user) && loadedFor !== user.uid && !listError;

  useEffect(() => {
    if (user && activeId) writeLS(lastLeagueKey(user.uid), activeId);
  }, [user, activeId]);

  const localHasDraft = localDraft.gone.length > 0 || localDraft.mine.length > 0;

  const importLocal = useCallback(async () => {
    if (!user) return null;
    const carried = localDraft.gone.length > 0 || localDraft.mine.length > 0;
    const id = await createLeague(user.uid, {
      name: localLeague.name,
      preset: localLeague.preset,
      config: localLeague.config,
      gone: localDraft.gone,
      mine: localDraft.mine,
    });
    setActiveId(id);
    if (carried) {
      writeLS(IMPORTED_KEY, new Date().toISOString());
      setLocalImported(true);
      setNotice(
        `Saved this browser's draft to your account as “${localLeague.name}” (${localDraft.mine.length} picks, ${localDraft.gone.length} names struck).`
      );
    }
    return id;
  }, [user, localLeague, localDraft]);

  // First sign-in on an empty account: create the league right away, carrying
  // this browser's draft into it if there is one, rather than leaving someone
  // signed in but still writing to localStorage. Only when the account is
  // empty, so it can never duplicate a league that's already there.
  useEffect(() => {
    if (!user || loadedFor !== user.uid || leagues.length > 0) return;
    if (localHasDraft && localImported) return;
    if (importedRef.current) return;
    importedRef.current = true;
    importLocal().catch((e) => {
      console.error("[draft-night] import failed:", e);
      importedRef.current = false;
      setListError(e.message);
    });
  }, [user, loadedFor, leagues.length, localHasDraft, localImported, importLocal]);

  const activeLeague = useMemo(
    () => leagues.find((l) => l.id === activeId) || null,
    [leagues, activeId]
  );
  const cloud = Boolean(user && activeLeague);

  // One config and one draft, whichever source is in play. Firestore applies
  // local writes to its cache before they reach the network, so a snapshot-fed
  // draft still updates on the same tick as the tap.
  const cfg = cloud ? activeLeague.config : localLeague.config;
  const leagueName = cloud ? activeLeague.name : localLeague.name;
  const draft = useMemo(
    () => (cloud ? { gone: activeLeague.gone, mine: activeLeague.mine } : localDraft),
    [cloud, activeLeague, localDraft]
  );

  const PICKNUMS = useMemo(() => pickNumbers(cfg), [cfg]);
  const ROUNDS = PICKNUMS.length;
  const TARGETS = useMemo(() => positionTargets(cfg), [cfg]);
  const SLOTS = useMemo(() => starterSlots(cfg), [cfg]);
  const usesTree = treeFits(cfg);

  const commit = useCallback(
    (next) => {
      if (cloud) {
        saveDraft(activeLeague.id, next).catch((e) => {
          console.error("[draft-night] save failed:", e);
          setListError(`Couldn't save that pick: ${e.message}`);
        });
      } else {
        setLocalDraft(next);
      }
    },
    [cloud, activeLeague]
  );

  const apply = useCallback(
    (fn) => {
      const prev = draft;
      const next = fn(prev);
      history.current = [...history.current.slice(-49), prev];
      setCanUndo(true);
      commit(next);
    },
    [draft, commit]
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) commit(prev);
    setCanUndo(history.current.length > 0);
  }, [commit]);

  const reset = useCallback(() => {
    if (!window.confirm("Clear every strike and every pick?")) return;
    history.current = [];
    setCanUndo(false);
    commit({ gone: [], mine: [] });
  }, [commit]);

  const goneSet = useMemo(() => new Set(draft.gone), [draft.gone]);
  const mineSet = useMemo(() => new Set(draft.mine), [draft.mine]);

  // Tap a name: struck if it was alive, alive again if it was struck (which
  // also un-claims it — you can't own a player who isn't off the board).
  const toggleGone = useCallback(
    (name) => {
      if (!BY_NAME[name]) return;
      apply((prev) =>
        prev.gone.includes(name)
          ? { gone: prev.gone.filter((n) => n !== name), mine: prev.mine.filter((n) => n !== name) }
          : { gone: [...prev.gone, name], mine: prev.mine }
      );
    },
    [apply]
  );

  // MINE implies gone. Un-claiming leaves him off the board, since somebody
  // still took him — you just fat-fingered whose he is.
  const toggleMine = useCallback(
    (name) => {
      if (!BY_NAME[name]) return;
      apply((prev) => {
        if (prev.mine.includes(name)) return { gone: prev.gone, mine: prev.mine.filter((n) => n !== name) };
        return {
          gone: prev.gone.includes(name) ? prev.gone : [...prev.gone, name],
          mine: [...prev.mine, name],
        };
      });
    },
    [apply]
  );

  const minePlayers = useMemo(() => draft.mine.map((n) => BY_NAME[n]).filter(Boolean), [draft.mine]);
  const counts = useMemo(
    () => minePlayers.reduce((acc, p) => ({ ...acc, [p.pos]: (acc[p.pos] || 0) + 1 }), {}),
    [minePlayers]
  );
  const have = useCallback((pos) => counts[pos] || 0, [counts]);
  const curIdx = Math.min(minePlayers.length, ROUNDS - 1);
  const draftDone = minePlayers.length >= ROUNDS;

  const branchState = useCallback(
    (br) => {
      if (br.fill && have(br.fill) >= (TARGETS[br.fill] || 0)) return "covered";
      if (br.list.every((n) => goneSet.has(n))) return "dead";
      return "live";
    },
    [have, goneSet, TARGETS]
  );

  const activeBlock = usesTree ? BLOCKS.find((b) => b.idx.includes(curIdx)) : null;

  // The recommendation. For the league the tree was written for, that's the
  // first surviving name in the first surviving branch of this pick's block.
  // For every other league it's the best available player at a position still
  // short of its target.
  const { rec, recWhy, backups } = useMemo(() => {
    if (draftDone) return { rec: null, recWhy: null, backups: [] };
    if (!usesTree) {
      const { picks, reason } = bestAvailable({ cfg, goneSet, counts, roundIdx: curIdx });
      return { rec: picks[0] || null, recWhy: reason, backups: picks.slice(1, 4) };
    }
    if (!activeBlock) return { rec: null, recWhy: null, backups: [] };
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
    return { rec: pick, recWhy: branch ? branch.t.toLowerCase() : null, backups: bk };
  }, [usesTree, cfg, goneSet, counts, curIdx, draftDone, activeBlock, branchState]);

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

  // ---- roster: fill the configured starting slots in pick order, best
  // leftover eligible player in each flex, everyone else on the bench.
  const roster = useMemo(() => {
    const pool = [...minePlayers];
    const eligible = flexEligible(cfg);
    const take = (pos) => {
      const i = pool.findIndex((p) => p.pos === pos);
      return i === -1 ? null : pool.splice(i, 1)[0];
    };
    const takeFlex = () => {
      const best = pool
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => eligible.includes(p.pos))
        .sort((a, b) => a.p.rk - b.p.rk)[0];
      return best ? pool.splice(best.i, 1)[0] : null;
    };
    const starters = SLOTS.map(({ pos, label }) => [
      label,
      pos === "FLEX" ? takeFlex() : take(pos),
    ]);
    const byes = {};
    starters.forEach(([, p]) => {
      if (p) byes[p.bye] = (byes[p.bye] || 0) + 1;
    });
    const clashes = Object.entries(byes)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1]);
    return { starters, bench: pool, clashes };
  }, [minePlayers, SLOTS, cfg]);

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
        className={"leaf" + (gone ? " taken" : "") + (isMine ? " ours" : "") + (first ? " first" : "")}
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
  const clockCard = (
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
            {posLabel(rec.pos)} · {rec.team} · bye {rec.bye}
            {recWhy ? ` — ${recWhy}` : ""}
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
  );

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

      {clockCard}

      {usesTree ? (
        <>
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
            Tap any name to kill it. Tap <b>MINE</b> when you take him, which advances the clock and
            prunes everything downstream.
          </p>
        </>
      ) : (
        <>
          <div className="note key">
            <h3>Best available, tuned to your roster</h3>
            <p>
              The hand-written pick tree was built for one specific draft: 10 teams, half PPR, from
              slot 2. Your league is set up differently, so the clock above runs the generic engine
              instead. It takes the highest-ranked player left at a position you're still short at,
              and forces QB, TE, D/ST, or K once you're down to just enough picks to fill them.
            </p>
          </div>
          <div className="bhead" style={{ marginTop: 14 }}>
            <h2>Still needed</h2>
            <em>
              {minePlayers.length} of {ROUNDS} picks
            </em>
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {Object.keys(TARGETS).map((pos) => {
              const short = TARGETS[pos] - have(pos);
              return (
                <button key={pos} type="button" aria-pressed={short > 0} disabled>
                  {posLabel(pos)} {have(pos)}/{TARGETS[pos]}
                </button>
              );
            })}
          </div>
          {bestAvailable({ cfg, goneSet, counts, roundIdx: curIdx, limit: 24 }).picks.map((p, i) => (
            <Leaf key={p.name} p={p} first={i === 0} />
          ))}
        </>
      )}
    </section>
  );

  const boardTab = (
    <section>
      <div className="tools">
        <input
          type="search"
          value={boardQuery}
          onChange={(e) => setBoardQuery(e.target.value)}
          placeholder="Filter the board by name or team"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <div className="filters">
          {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((f) => (
            <button type="button" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : posLabel(f)}
            </button>
          ))}
          <button type="button" aria-pressed={availOnly} onClick={() => setAvailOnly((v) => !v)}>
            Alive only
          </button>
        </div>
      </div>
      <p className="sub" style={{ margin: "9px 0 3px" }}>
        Ranks are ESPN's 9/2 board; arrows are a half-PPR adjustment. {boardRows.length} shown.
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
        takes the best leftover eligible player.
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
        {roster.starters.map(([slot, p], i) => (
          <div key={slot + i} className={"slotrow" + (p ? "" : " empty")}>
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
        {draftDone ? "No picks left." : PICKNUMS.slice(minePlayers.length).join(" · ")}
      </p>
    </section>
  );

  const newsTab = (
    <section>
      <p className="sub" style={{ marginBottom: 11 }}>
        Checked the morning of September 8. The ESPN sheet is from 9/2 and hasn't caught up on
        several of these.
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
      <div className="note key">
        <h3>{leagueName}</h3>
        <p>
          {scoringLabel(cfg)} · you pick from slot {cfg.seat} of {cfg.teams} · {ROUNDS} rounds.
          <br />
          Starters: {SLOTS.map((s) => s.label).join(", ")}.
          <br />
          Your picks: {PICKNUMS.join(" · ")}.
        </p>
      </div>
      {cfg.scoring.ppr !== 1 && (
        <div className="note key">
          <h3>Your cheat sheets are probably full PPR</h3>
          <p>
            This league scores {cfg.scoring.ppr === 0 ? "no points" : `${cfg.scoring.ppr} points`} per
            catch. On a 90-catch season that's a{" "}
            {Math.round((1 - cfg.scoring.ppr) * 90)}-point swing the sheets don't account for. Volume
            slot receivers drop; touchdown scorers and pure runners rise.
          </p>
        </div>
      )}
      <h2 style={{ margin: "18px 0 8px" }}>Written for the John Jay FC league</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        The notes below, the pick tree, and the news are all specific to one 10-team half-PPR league.
        Read them as reasoning you can borrow, not as rules for your draft.
      </p>
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
      {usesTree && (
        <>
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
        </>
      )}
    </section>
  );

  // Until auth and the league list resolve, the local draft is not necessarily
  // the draft this person is in. Showing it and then swapping it out under them
  // is worse than a beat of "restoring" — at a draft table a wrong roster reads
  // as lost work.
  const restoring = user === undefined || listLoading;

  const picksLeft = ROUNDS - minePlayers.length;
  const trayCounts = ["QB", "RB", "WR", "TE", "DST", "K"].filter((p) => TARGETS[p] > 0);

  return (
    <div className="dn">
      <style>{css}</style>

      <div className="wrap">
        <header>
          <button className="slot" type="button" onClick={() => setScreen("league")}>
            <b>{cfg.seat}</b>
            <span>
              {leagueName}
              <br />
              {scoringLabel(cfg)}
            </span>
          </button>
          <div className="headbtns">
            {screen === "draft" && (
              <>
                <button type="button" onClick={undo} disabled={!canUndo}>
                  UNDO
                </button>
                <button type="button" onClick={reset}>
                  RESET
                </button>
              </>
            )}
          </div>
        </header>
        {notice && (
          <div className="note good" style={{ marginBottom: 10 }}>
            <p>{notice}</p>
            <button className="linkish" type="button" onClick={() => setNotice(null)}>
              dismiss
            </button>
          </div>
        )}
      </div>

      {screen === "draft" && !restoring && (
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
      )}

      <div className="wrap">
        {screen === "league" ? (
          <LeagueScreen
            user={user}
            leagues={leagues}
            listLoading={listLoading}
            listError={listError}
            activeId={activeId}
            activeConfig={cfg}
            localHasDraft={localHasDraft && !localImported}
            onOpen={(id) => {
              setActiveId(id);
              setScreen("draft");
            }}
            onCreate={async (payload) => {
              try {
                const id = await createLeague(user.uid, payload);
                setActiveId(id);
              } catch (e) {
                console.error("[draft-night] create failed:", e);
                setListError(e.message);
              }
            }}
            onSaveSettings={async (id, payload) => {
              try {
                await saveSettings(id, payload);
              } catch (e) {
                console.error("[draft-night] settings save failed:", e);
                setListError(e.message);
              }
            }}
            onDelete={async (id) => {
              try {
                await deleteLeague(id);
                if (id === activeId) setActiveId(null);
              } catch (e) {
                console.error("[draft-night] delete failed:", e);
                setListError(e.message);
              }
            }}
            onSignOut={async () => {
              setActiveId(null);
              await signOutOfDraftNight();
            }}
            onClose={() => setScreen("draft")}
            onImportLocal={() => {
              importedRef.current = true;
              importLocal()
                .then(() => setScreen("draft"))
                .catch((e) => setListError(e.message));
            }}
            onLocalChange={setLocalLeague}
            localLeague={localLeague}
          />
        ) : restoring ? (
          <p className="sub" style={{ padding: "28px 0" }}>Restoring your draft…</p>
        ) : (
          <>
            {tab === "tree" && treeTab}
            {tab === "board" && boardTab}
            {tab === "team" && teamTab}
            {tab === "news" && newsTab}
            {tab === "rules" && rulesTab}
          </>
        )}

        <footer>
          Ranks from the ESPN 9/2 non-superflex board, cross-checked against FantasyPros 9/8.{" "}
          {cloud
            ? `Saved to your account under “${leagueName}”.`
            : "Saved in this browser; sign in from the header to sync it."}
        </footer>
      </div>

      {screen === "draft" && !restoring && (
        <div className="tray">
          <div className="inner">
            <div className="cnt">
              {trayCounts.map((pos) => {
                const n = have(pos);
                return (
                  <span key={pos} className={n >= TARGETS[pos] ? "filled" : ""}>
                    {posLabel(pos)} {n}/{TARGETS[pos]}
                  </span>
                );
              })}
            </div>
            <b>
              {picksLeft <= 0 ? "roster full" : picksLeft === 1 ? "1 pick left" : picksLeft + " picks left"}
            </b>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftNight;
