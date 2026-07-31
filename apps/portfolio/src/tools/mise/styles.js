/* Type scale and palette for Mise. The chart rules are unchanged from the
   prototype; everything below the CHROME marker is the shell added around it
   (sign-in, implementation picker, account bar). */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');

.mise{
  --pine:#1F4A3F; --pine-mid:#3D6B5C; --bone:#ECEDE6; --paper:#F6F7F2;
  --ink:#14201B; --amber:#DFA327; --amber-soft:#F7E6BF;
  font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--ink);
  background:var(--paper);min-height:100vh;padding-bottom:96px;
}
.mise *{box-sizing:border-box;}
.mise button{font-family:inherit;cursor:pointer;}
.mise button:focus-visible,.mise input:focus-visible{outline:2px solid var(--amber);outline-offset:2px;}

.bar{border-bottom:1px solid rgba(31,74,63,.18);padding:12px 16px;background:var(--bone);position:sticky;top:0;z-index:5;}
.word{font-family:'IBM Plex Sans Condensed',sans-serif;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:13px;color:var(--pine);}
.mono{font-family:'IBM Plex Mono',monospace;}
.sub{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--pine-mid);letter-spacing:.05em;}

.seg{display:inline-flex;border:1px solid rgba(31,74,63,.28);border-radius:4px;overflow:hidden;}
.seg button{background:transparent;border:none;padding:5px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--pine-mid);}
.seg button.on{background:var(--pine);color:var(--bone);}

.navrow{display:flex;align-items:center;gap:6px;margin-top:9px;flex-wrap:wrap;}
.up{border:1px solid rgba(31,74,63,.3);background:#fff;border-radius:4px;padding:4px 9px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--pine);}
.up:disabled{opacity:.3;cursor:default;}
.crumb{font-family:'IBM Plex Mono',monospace;font-size:11px;background:none;border:none;padding:3px 5px;border-radius:3px;color:var(--pine-mid);}
.crumb:hover{background:rgba(31,74,63,.09);}
.crumb.here{color:var(--ink);background:var(--amber-soft);}
.sep{color:rgba(31,74,63,.35);font-size:10px;}

.scroller{overflow-x:auto;padding:16px 16px 20px;}
.colhead{display:grid;gap:2px;margin-bottom:6px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--pine-mid);}
.frame{background:var(--pine);padding:2px;border-radius:3px;display:grid;gap:2px;}

.cell{position:relative;display:flex;flex-direction:column;justify-content:center;
  padding:9px 10px 15px 14px;min-height:52px;background:#fff;text-align:left;
  border:none;width:100%;font-family:inherit;color:inherit;}
.cell .lab{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:14px;line-height:1.25;font-weight:500;}
.cell.d0{background:var(--pine);color:var(--bone);}
.cell.d0 .lab{font-size:17px;}
.cell.d1{background:#CFE0D5;}
.cell.d2{background:#E5EEE7;}
.cell.sel{box-shadow:inset 0 0 0 3px var(--amber);}
.cell.isdone .lab{opacity:.5;text-decoration:line-through;text-decoration-thickness:1px;}

.stripe{position:absolute;left:0;top:0;bottom:0;width:5px;display:flex;flex-direction:column;}
.meta{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--pine-mid);margin-top:3px;letter-spacing:.04em;}
.cell.d0 .meta{color:rgba(236,237,230,.75);}
.badge{position:absolute;right:6px;top:6px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;background:var(--amber);color:#2B1E00;border-radius:2px;padding:1px 4px;}

.track{position:absolute;left:5px;right:0;bottom:0;height:6px;display:flex;gap:1px;padding:1px;}
.tick{flex:1 1 0;min-width:1px;background:rgba(31,74,63,.16);}
.tick.on{background:var(--pine);}
.cell.d0 .tick{background:rgba(236,237,230,.22);}
.cell.d0 .tick.on{background:var(--bone);}

.dock{position:fixed;left:0;right:0;bottom:0;background:var(--bone);border-top:2px solid var(--pine);
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));z-index:20;}
.dockname{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:15px;font-weight:600;margin-bottom:7px;
  display:flex;align-items:center;gap:8px;}
.acts{display:flex;gap:5px;flex-wrap:wrap;}
.act{border:1px solid rgba(31,74,63,.3);background:#fff;border-radius:4px;padding:6px 10px;
  font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--pine);}
.act:hover{border-color:var(--amber);}
.act.solid{background:var(--pine);color:var(--bone);border-color:var(--pine);}
.act.danger{color:#9B3A2E;}
.act:disabled{opacity:.35;cursor:default;}
.pill{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#fff;border-radius:2px;padding:1px 5px;}
.edit{width:100%;font-family:'IBM Plex Sans Condensed',sans-serif;font-size:14px;border:none;
  border-bottom:2px solid var(--amber);background:transparent;padding:1px 0;color:inherit;}

.legend{display:flex;gap:12px;flex-wrap:wrap;padding:0 16px 22px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--pine-mid);}
.swatch{display:inline-block;width:9px;height:9px;border-radius:1px;margin-right:4px;vertical-align:-1px;}

.plan{padding:18px 16px 40px;max-width:820px;}
.prow{display:flex;gap:9px;padding:5px 0;border-bottom:1px solid rgba(31,74,63,.1);align-items:baseline;}
.wbs{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--pine-mid);min-width:66px;flex-shrink:0;}
.pname{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:14px;}
.pmeta{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--pine-mid);margin-left:auto;flex-shrink:0;}
.hint{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--pine-mid);padding:0 16px 20px;line-height:1.7;}

/* ------------------------------ CHROME ----------------------------- */

.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;}
.sheet{width:100%;max-width:404px;background:#fff;border:1px solid rgba(31,74,63,.18);border-radius:5px;
  padding:26px 24px 22px;box-shadow:0 1px 0 rgba(31,74,63,.06);}
.sheet .word{font-size:15px;}
.tagline{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:19px;font-weight:500;line-height:1.3;margin:10px 0 4px;}

.field{display:block;margin-top:12px;}
.flabel{display:block;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--pine-mid);margin-bottom:4px;}
.input{width:100%;font-family:'IBM Plex Sans',sans-serif;font-size:14px;padding:8px 10px;color:var(--ink);
  border:1px solid rgba(31,74,63,.28);border-radius:4px;background:var(--paper);}

.btn{width:100%;margin-top:14px;border:1px solid var(--pine);background:var(--pine);color:var(--bone);
  border-radius:4px;padding:10px 12px;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.03em;}
.btn:disabled{opacity:.5;cursor:default;}
.btn.ghost{background:#fff;color:var(--pine);}
.btn.ghost:hover{border-color:var(--amber);}
.linkish{background:none;border:none;padding:0;font-family:'IBM Plex Mono',monospace;font-size:11px;
  color:var(--pine-mid);text-decoration:underline;}
.linkish:hover{color:var(--ink);}

.rule{display:flex;align-items:center;gap:10px;margin:18px 0 4px;
  font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pine-mid);}
.rule:before,.rule:after{content:"";flex:1;height:1px;background:rgba(31,74,63,.16);}

.err{margin-top:12px;padding:8px 10px;border-left:3px solid #9B3A2E;background:#F7ECEA;
  font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.5;color:#7A2E24;}
.ok{margin-top:12px;padding:8px 10px;border-left:3px solid var(--pine);background:#E5EEE7;
  font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.5;color:var(--pine);}
.foot{margin-top:16px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;}

.who{display:flex;align-items:center;gap:7px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--pine-mid);}
.avatar{width:20px;height:20px;border-radius:50%;background:var(--pine);color:var(--bone);display:flex;
  align-items:center;justify-content:center;font-size:9.5px;font-weight:500;flex-shrink:0;overflow:hidden;}
.avatar img{width:100%;height:100%;object-fit:cover;}
.state{font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--pine-mid);letter-spacing:.05em;}
.state.dirty{color:var(--amber);}
.state.failed{color:#9B3A2E;}

.picker{max-width:760px;margin:0 auto;padding:26px 16px 60px;}
.pickhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px;}
.h1{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:23px;font-weight:600;}
.plans{margin-top:18px;display:grid;gap:8px;}
.planitem{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(31,74,63,.18);
  border-radius:4px;padding:0;overflow:hidden;}
.planopen{flex:1;min-width:0;text-align:left;background:none;border:none;padding:12px 14px;color:inherit;font-family:inherit;}
.planopen:hover{background:#F1F4F0;}
.planname{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:16px;font-weight:500;}
.planbar{display:flex;height:5px;margin-top:7px;border-radius:2px;overflow:hidden;background:rgba(31,74,63,.13);}
.planrm{border:none;background:none;padding:12px 14px;color:#9B3A2E;font-family:'IBM Plex Mono',monospace;font-size:11px;align-self:stretch;}
.planrm:hover{background:#F7ECEA;}

.tmpl{display:grid;gap:8px;margin-top:10px;}
.tmplbtn{text-align:left;background:#fff;border:1px solid rgba(31,74,63,.22);border-radius:4px;padding:11px 13px;color:inherit;}
.tmplbtn.on{border-color:var(--pine);box-shadow:inset 0 0 0 2px var(--amber-soft);}
.tmplname{font-family:'IBM Plex Sans Condensed',sans-serif;font-size:15px;font-weight:500;}
.tmplblurb{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--pine-mid);margin-top:3px;line-height:1.5;}

.empty{background:#fff;border:1px dashed rgba(31,74,63,.3);border-radius:4px;padding:22px 18px;text-align:center;}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
  font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--pine-mid);}
`;

export default CSS;
