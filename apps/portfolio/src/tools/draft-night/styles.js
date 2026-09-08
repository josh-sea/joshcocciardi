// Every rule is scoped under `.dn` so the portfolio's global Semantic UI
// stylesheet can't reach in and restyle the inputs, buttons, or lists.
const css = `
.dn{
  --pitch:#0C1A13; --panel:#152720; --panel2:#1C332A; --line:#2A4739;
  --chalk:#ECE7DA; --muted:#8CA595; --signal:#F0A63C; --go:#7FC98A; --alert:#E2635A;
  background:var(--pitch); color:var(--chalk); min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:15px; line-height:1.45; -webkit-text-size-adjust:100%;
  padding-bottom:82px; overscroll-behavior-y:none;
}
.dn *{box-sizing:border-box;}
.dn .wrap{max-width:720px;margin:0 auto;padding:0 12px;}
.dn h2{font-size:16px;margin:0;font-weight:700;letter-spacing:-.01em;color:var(--chalk);}
.dn .sub{font-size:12.5px;color:var(--muted);margin:0;}
.dn a{color:var(--signal);}

/* ---- masthead ---- */
.dn header{padding:14px 0 10px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.dn .slot{display:flex;align-items:baseline;gap:9px;}
.dn .slot b{font-size:40px;line-height:.85;font-weight:800;letter-spacing:-.04em;
  font-variant-numeric:tabular-nums;color:var(--signal);}
.dn .slot span{font-size:13px;color:var(--muted);}
.dn .headbtns{display:flex;gap:6px;flex:0 0 auto;padding-top:4px;}
.dn .headbtns button{background:var(--panel2);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:11.5px;font-weight:700;padding:6px 9px;border-radius:7px;cursor:pointer;}
.dn .headbtns button:disabled{opacity:.35;cursor:default;}

/* ---- tabs ---- */
.dn nav{position:sticky;top:0;z-index:40;background:var(--pitch);border-bottom:1px solid var(--line);display:flex;}
.dn nav button{flex:1;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);
  font:inherit;font-size:13px;font-weight:600;padding:11px 2px;cursor:pointer;border-radius:0;}
.dn nav button[aria-selected="true"]{color:var(--chalk);border-bottom-color:var(--signal);}
.dn nav button:focus-visible{outline:2px solid var(--signal);outline-offset:-2px;}
.dn section{padding-top:12px;}

/* ---- strike bar ---- */
.dn .strike{position:sticky;top:43px;z-index:35;background:var(--pitch);padding:9px 0 8px;border-bottom:1px solid var(--line);}
.dn .strike input{width:100%;background:#20372C;border:1px solid var(--line);border-radius:9px;
  color:var(--chalk);font:inherit;font-size:16px;padding:11px 12px;}
.dn .strike input::placeholder{color:var(--muted);}
.dn .hits{margin-top:6px;display:flex;flex-wrap:wrap;gap:5px;}
.dn .hits button{background:var(--panel2);border:1px solid var(--line);color:var(--chalk);
  font:inherit;font-size:13.5px;font-weight:600;padding:8px 11px;border-radius:8px;cursor:pointer;}
.dn .hits button.undo{background:#3A2320;border-color:#5A3330;color:#F0A9A2;}
.dn .hits button .mini{color:var(--muted);font-weight:600;font-size:11.5px;margin-left:5px;}

/* ---- clock card ---- */
.dn .clock{background:var(--panel);border:1px solid var(--signal);border-radius:12px;padding:13px 14px;margin:12px 0 14px;}
.dn .clock .lbl{font-size:12px;color:var(--signal);font-weight:700;letter-spacing:.02em;}
.dn .clock .big{font-size:29px;font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:3px 0 1px;}
.dn .clock .pos2{font-size:13px;color:var(--muted);}
.dn .clock .then{margin-top:9px;padding-top:9px;border-top:1px solid var(--line);font-size:13.5px;color:#C9D6CD;}
.dn .clock .then b{color:var(--chalk);font-weight:600;}
.dn .clock .away{margin-top:9px;padding-top:9px;border-top:1px solid var(--line);
  display:flex;align-items:baseline;gap:7px;font-size:12.5px;color:var(--muted);}
.dn .clock .away b{color:var(--chalk);font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}
.dn .clock .away.up b{color:var(--go);}
.dn .clock .takebtn{margin-top:10px;width:100%;background:var(--signal);border:none;color:#161007;
  font:inherit;font-size:14px;font-weight:800;padding:11px;border-radius:9px;cursor:pointer;letter-spacing:.01em;}

/* ---- tree ---- */
.dn .block{margin-bottom:16px;}
.dn .bhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
  padding:0 2px 7px;border-bottom:1px solid var(--line);margin-bottom:8px;}
.dn .bhead em{font-style:normal;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
.dn .block.past{opacity:.35;}
.dn .block.active .bhead h2{color:var(--signal);}

.dn .branch{margin:0 0 7px;padding-left:11px;border-left:2px solid var(--line);}
.dn .branch.live{border-left-color:var(--go);}
.dn .branch.dead{border-left-color:#3A2320;opacity:.42;}
.dn .branch.covered{border-left-color:var(--line);opacity:.42;}
.dn .btitle{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;padding:1px 0 3px;}
.dn .btitle .why{font-weight:500;color:var(--muted);font-size:12px;}
.dn .state{font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:.03em;}
.dn .state.on{background:#123A2C;color:var(--go);}
.dn .state.off{background:#3A2320;color:var(--alert);}
.dn .state.ok{background:#2A2113;color:var(--signal);}

.dn .leaf{display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid #1E362B;cursor:pointer;}
.dn .leaf:last-child{border-bottom:none;}
.dn .leaf .nm{font-size:16px;font-weight:600;flex:1;min-width:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dn .leaf .tag{font-size:11px;color:var(--muted);white-space:nowrap;}
.dn .leaf.first .nm{color:var(--go);font-weight:800;}
.dn .leaf.taken{opacity:.32;}
.dn .leaf.taken .nm{text-decoration:line-through;font-weight:500;}
.dn .leaf.taken .tag{color:var(--alert);}
.dn .leaf.ours{background:#22190B;}
.dn .leaf.ours .nm{color:var(--signal);text-decoration:none;}
.dn .pos{display:inline-block;min-width:29px;text-align:center;font-size:10px;font-weight:800;
  padding:2px 4px;border-radius:4px;letter-spacing:.03em;}
.dn .pos.QB{background:#3A2A50;color:#C9AEEF;} .dn .pos.RB{background:#123A2C;color:#7FC98A;}
.dn .pos.WR{background:#123246;color:#79B9E0;} .dn .pos.TE{background:#4A2E1A;color:#EDA96A;}
.dn .pos.K{background:#33322A;color:#C3BFA6;} .dn .pos.DST{background:#3D2426;color:#E39A94;}
.dn .flag{font-weight:700;}
.dn .flag.up{color:var(--go);} .dn .flag.down,.dn .flag.hurt{color:var(--alert);}

.dn .mineBtn{background:var(--panel2);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:11px;font-weight:800;padding:6px 8px;border-radius:7px;cursor:pointer;flex:0 0 auto;}
.dn .mineBtn.on{background:var(--signal);border-color:var(--signal);color:#161007;}

/* ---- board ---- */
.dn .tools{position:sticky;top:43px;z-index:15;background:var(--pitch);padding:9px 0 7px;border-bottom:1px solid var(--line);}
.dn .tools input{width:100%;background:#20372C;border:1px solid var(--line);border-radius:9px;
  color:var(--chalk);font:inherit;font-size:16px;padding:9px 12px;margin-bottom:7px;}
.dn .tools input::placeholder{color:var(--muted);}
.dn .filters{display:flex;flex-wrap:wrap;gap:5px;}
.dn .filters button{background:var(--panel);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:12.5px;font-weight:600;padding:6px 10px;border-radius:999px;cursor:pointer;}
.dn .filters button[aria-pressed="true"]{background:var(--signal);border-color:var(--signal);color:#161007;}
.dn .row{display:flex;align-items:center;gap:8px;padding:8px 3px;border-bottom:1px solid var(--line);}
.dn .row .rk{width:28px;flex:0 0 28px;text-align:right;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
.dn .row .who{flex:1;min-width:0;cursor:pointer;}
.dn .row .nm{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dn .row .meta{font-size:11.5px;color:var(--muted);}
.dn .row.gone{opacity:.3;} .dn .row.gone .nm{text-decoration:line-through;}
.dn .row.own{background:#22190B;opacity:1;} .dn .row.own .nm{text-decoration:none;color:var(--signal);}

/* ---- roster ---- */
.dn .slotrow{display:flex;align-items:center;gap:9px;padding:9px 3px;border-bottom:1px solid var(--line);}
.dn .slotrow .lab{width:46px;flex:0 0 46px;font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.04em;}
.dn .slotrow .fill{flex:1;min-width:0;}
.dn .slotrow .fill .nm{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dn .slotrow .fill .meta{font-size:11.5px;color:var(--muted);}
.dn .slotrow.empty .fill .nm{color:var(--muted);font-weight:500;font-style:italic;}
.dn .slotrow .pk{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;}

/* ---- notes ---- */
.dn .note{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 13px;margin-bottom:9px;}
.dn .note h3{margin:0 0 4px;font-size:14px;font-weight:700;color:var(--chalk);}
.dn .note p{margin:0;font-size:13.5px;color:#C9D6CD;}
.dn .note.warn{border-left:3px solid var(--alert);} .dn .note.good{border-left:3px solid var(--go);}
.dn .note.key{border-left:3px solid var(--signal);}
.dn dl{margin:0;} .dn dt{font-size:14px;font-weight:700;margin-top:10px;} .dn dt:first-child{margin-top:0;}
.dn dd{margin:1px 0 0;font-size:13.5px;color:#C9D6CD;}
.dn footer{padding:20px 0 6px;font-size:12px;color:var(--muted);}

/* ---- tray ---- */
.dn .tray{position:fixed;left:0;right:0;bottom:0;z-index:45;background:var(--panel);
  border-top:1px solid var(--line);padding:8px 12px calc(8px + env(safe-area-inset-bottom));}
.dn .tray .inner{max-width:720px;margin:0 auto;display:flex;align-items:center;gap:8px;}
.dn .cnt{display:flex;gap:4px;flex:1;flex-wrap:wrap;}
.dn .cnt span{font-size:11px;font-weight:700;padding:3px 6px;border-radius:5px;
  background:var(--panel2);color:var(--muted);font-variant-numeric:tabular-nums;}
.dn .cnt span.filled{color:var(--chalk);}
.dn .tray b{font-size:11.5px;color:var(--muted);font-weight:600;white-space:nowrap;}
`;

export default css;
