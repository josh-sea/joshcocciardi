/* Type scale and layout for Mise. Every color and font reads from the theme
   tokens in themes.js, so nothing here names a hex value. The chart rules are
   unchanged from the prototype; everything below the CHROME marker is the
   shell added around it (sign-in, implementation picker, account bar). */

import { THEME_CSS } from "./themes";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');

.mise{
  font-family:var(--font-sans);color:var(--ink);
  background:var(--paper);min-height:100vh;padding-bottom:96px;
}
.mise *{box-sizing:border-box;}
.mise button{font-family:inherit;cursor:pointer;}
.mise button:focus-visible,.mise input:focus-visible,.mise textarea:focus-visible{outline:2px solid var(--hi);outline-offset:2px;}

.bar{border-bottom:1px solid rgba(var(--line),.18);padding:12px 16px;background:var(--chrome);position:sticky;top:0;z-index:5;}
.word{font-family:var(--font-cond);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:13px;color:var(--strong);}
.mono{font-family:var(--font-mono);}
.sub{font-family:var(--font-mono);font-size:10.5px;color:var(--muted);letter-spacing:.05em;}

.seg{display:inline-flex;border:1px solid rgba(var(--line),.28);border-radius:4px;overflow:hidden;}
.seg button{background:transparent;border:none;padding:5px 10px;font-family:var(--font-mono);font-size:11px;color:var(--muted);}
.seg button.on{background:var(--strong);color:var(--on-strong);}

.navrow{display:flex;align-items:center;gap:6px;margin-top:9px;flex-wrap:wrap;}
.up{border:1px solid rgba(var(--line),.3);background:var(--surface);border-radius:4px;padding:4px 9px;font-family:var(--font-mono);font-size:11px;color:var(--strong);}
.up:disabled{opacity:.3;cursor:default;}
.crumb{font-family:var(--font-mono);font-size:11px;background:none;border:none;padding:3px 5px;border-radius:3px;color:var(--muted);}
.crumb:hover{background:rgba(var(--line),.09);}
.crumb.here{color:var(--ink);background:var(--hi-soft);}
.sep{color:rgba(var(--line),.35);font-size:10px;}

.scroller{overflow-x:auto;padding:16px 16px 20px;}
.colhead{display:grid;gap:2px;margin-bottom:6px;font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.frame{background:var(--strong);padding:2px;border-radius:3px;display:grid;gap:2px;}

.cell{position:relative;display:flex;flex-direction:column;justify-content:center;
  padding:9px 10px 15px 14px;min-height:52px;background:var(--surface);text-align:left;
  border:none;width:100%;font-family:inherit;color:inherit;}
.cell .lab{font-family:var(--font-cond);font-size:14px;line-height:1.25;font-weight:500;}
.cell.d0{background:var(--strong);color:var(--on-strong);}
.cell.d0 .lab{font-size:17px;}
.cell.d1{background:var(--d1);}
.cell.d2{background:var(--d2);}
.cell.sel{box-shadow:inset 0 0 0 3px var(--hi);}
.cell.isdone .lab{opacity:.5;text-decoration:line-through;text-decoration-thickness:1px;}

.stripe{position:absolute;left:0;top:0;bottom:0;width:5px;display:flex;flex-direction:column;}
.meta{font-family:var(--font-mono);font-size:9px;color:var(--muted);margin-top:3px;letter-spacing:.04em;}
.cell.d0 .meta{color:var(--on-strong);opacity:.75;}
.badge{position:absolute;right:6px;top:6px;font-family:var(--font-mono);font-size:9.5px;background:var(--hi);color:var(--hi-ink);border-radius:2px;padding:1px 4px;}

.track{position:absolute;left:5px;right:0;bottom:0;height:6px;display:flex;gap:1px;padding:1px;}
.tick{flex:1 1 0;min-width:1px;background:rgba(var(--line),.16);}
.tick.on{background:var(--strong);}
.cell.d0 .tick{background:var(--on-strong);opacity:.22;}
.cell.d0 .tick.on{opacity:1;}

.dock{position:fixed;left:0;right:0;bottom:0;background:var(--chrome);border-top:2px solid var(--strong);
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));z-index:20;}
.dockname{font-family:var(--font-cond);font-size:15px;font-weight:600;margin-bottom:7px;
  display:flex;align-items:center;gap:8px;}
.acts{display:flex;gap:5px;flex-wrap:wrap;}
.act{border:1px solid rgba(var(--line),.3);background:var(--surface);border-radius:4px;padding:6px 10px;
  font-family:var(--font-mono);font-size:11px;color:var(--strong);}
.act:hover{border-color:var(--hi);}
.act.solid{background:var(--strong);color:var(--on-strong);border-color:var(--strong);}
.act.danger{color:var(--danger);}
.act:disabled{opacity:.35;cursor:default;}
.pill{font-family:var(--font-mono);font-size:9.5px;color:var(--pill-ink);border-radius:2px;padding:1px 5px;}
.edit{width:100%;font-family:var(--font-cond);font-size:14px;border:none;
  border-bottom:2px solid var(--hi);background:transparent;padding:1px 0;color:inherit;}

.legend{display:flex;gap:12px;flex-wrap:wrap;padding:0 16px 22px;font-family:var(--font-mono);font-size:10px;color:var(--muted);}
.swatch{display:inline-block;width:9px;height:9px;border-radius:1px;margin-right:4px;vertical-align:-1px;}

.plan{padding:18px 16px 40px;max-width:820px;}
.prow{display:flex;gap:9px;padding:5px 0;border-bottom:1px solid rgba(var(--line),.1);align-items:baseline;}
.wbs{font-family:var(--font-mono);font-size:10.5px;color:var(--muted);min-width:66px;flex-shrink:0;}
.pname{font-family:var(--font-cond);font-size:14px;}
.pmeta{font-family:var(--font-mono);font-size:9.5px;color:var(--muted);margin-left:auto;flex-shrink:0;}
.hint{font-family:var(--font-mono);font-size:10px;color:var(--muted);padding:0 16px 20px;line-height:1.7;}

/* ------------------------------ CHROME ----------------------------- */

.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;}
.sheet{width:100%;max-width:404px;background:var(--surface);border:1px solid rgba(var(--line),.18);border-radius:5px;
  padding:26px 24px 22px;box-shadow:0 1px 0 rgba(var(--line),.06);}
.sheet .word{font-size:15px;}
.tagline{font-family:var(--font-cond);font-size:19px;font-weight:500;line-height:1.3;margin:10px 0 4px;}

.field{display:block;margin-top:12px;}
.flabel{display:block;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);margin-bottom:4px;}
.input{width:100%;font-family:var(--font-sans);font-size:14px;padding:8px 10px;color:var(--ink);
  border:1px solid rgba(var(--line),.28);border-radius:4px;background:var(--paper);}

.btn{width:100%;margin-top:14px;border:1px solid var(--strong);background:var(--strong);color:var(--on-strong);
  border-radius:4px;padding:10px 12px;font-family:var(--font-mono);font-size:12px;letter-spacing:.03em;}
.btn:disabled{opacity:.5;cursor:default;}
.btn.ghost{background:var(--surface);color:var(--strong);}
.btn.ghost:hover{border-color:var(--hi);}
.linkish{background:none;border:none;padding:0;font-family:var(--font-mono);font-size:11px;
  color:var(--muted);text-decoration:underline;}
.linkish:hover{color:var(--ink);}

.rule{display:flex;align-items:center;gap:10px;margin:18px 0 4px;
  font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.rule:before,.rule:after{content:"";flex:1;height:1px;background:rgba(var(--line),.16);}

.err{margin-top:12px;padding:8px 10px;border-left:3px solid var(--danger);background:var(--danger-soft);
  font-family:var(--font-mono);font-size:11px;line-height:1.5;color:var(--danger-ink);}
.ok{margin-top:12px;padding:8px 10px;border-left:3px solid var(--strong);background:var(--d2);
  font-family:var(--font-mono);font-size:11px;line-height:1.5;color:var(--strong);}
.foot{margin-top:16px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;}

.who{display:flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:10.5px;color:var(--muted);}
.avatar{width:20px;height:20px;border-radius:50%;background:var(--strong);color:var(--on-strong);display:flex;
  align-items:center;justify-content:center;font-size:9.5px;font-weight:500;flex-shrink:0;overflow:hidden;}
.avatar img{width:100%;height:100%;object-fit:cover;}
.state{font-family:var(--font-mono);font-size:9.5px;color:var(--muted);letter-spacing:.05em;}
.state.dirty{color:var(--hi);}
.state.failed{color:var(--danger);}

.picker{max-width:760px;margin:0 auto;padding:26px 16px 60px;}
.pickhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px;}
.h1{font-family:var(--font-cond);font-size:23px;font-weight:600;}
.plans{margin-top:18px;display:grid;gap:8px;}
.planitem{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid rgba(var(--line),.18);
  border-radius:4px;padding:0;overflow:hidden;}
.planopen{flex:1;min-width:0;text-align:left;background:none;border:none;padding:12px 14px;color:inherit;font-family:inherit;}
.planopen:hover{background:var(--hover);}
.planname{font-family:var(--font-cond);font-size:16px;font-weight:500;}
.planbar{display:flex;height:5px;margin-top:7px;border-radius:2px;overflow:hidden;background:rgba(var(--line),.13);}
.planrm{border:none;background:none;padding:12px 14px;color:var(--danger);font-family:var(--font-mono);font-size:11px;align-self:stretch;}
.planrm:hover{background:var(--danger-soft);}

.tmpl{display:grid;gap:8px;margin-top:10px;}
.tmplbtn{text-align:left;background:var(--surface);border:1px solid rgba(var(--line),.22);border-radius:4px;padding:11px 13px;color:inherit;}
.tmplbtn.on{border-color:var(--strong);box-shadow:inset 0 0 0 2px var(--hi-soft);}
.tmplname{font-family:var(--font-cond);font-size:15px;font-weight:500;}
.tmplblurb{font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:3px;line-height:1.5;}

.empty{background:var(--surface);border:1px dashed rgba(var(--line),.3);border-radius:4px;padding:22px 18px;text-align:center;}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
  font-family:var(--font-mono);font-size:12px;color:var(--muted);}

/* ------------------------- THEMES + TRANSFER ----------------------- */

.planitem{color:var(--ink);}
.themes{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;}
.tsw{width:22px;height:22px;border-radius:50%;border:1px solid rgba(var(--line),.35);padding:0;
  display:inline-flex;overflow:hidden;background:none;transform:rotate(-45deg);}
.tsw span{flex:1;}
.tsw.on{box-shadow:0 0 0 2px var(--paper),0 0 0 4px var(--hi);}
.area{width:100%;min-height:200px;resize:vertical;font-family:var(--font-mono);font-size:12px;line-height:1.5;
  padding:9px 10px;color:var(--ink);border:1px solid rgba(var(--line),.28);border-radius:4px;background:var(--paper);}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.row .btn{width:auto;flex:1;}
.t-terminal .word,.t-terminal .h1{text-shadow:0 0 6px rgba(57,255,106,.55);}

${THEME_CSS}
`;

export default CSS;
