/* Palette and layout for the Family Meal Planner. Phone first: one column,
   big tap targets, a bottom sheet for every choice. Everything is scoped
   under .mp so none of it leaks into the rest of the portfolio. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=DM+Sans:wght@400;500;700&display=swap');

.mp{
  --cream:#FBF7F0; --card:#FFFFFF; --ink:#2A2320; --soft:#6E625A; --line:#E7DDD1;
  --tomato:#C4492B; --tomato-soft:#FBE6DF; --basil:#3E7B4F; --basil-soft:#E3F0E5;
  --butter:#F2C14E; --butter-soft:#FDF3D9;
  font-family:'DM Sans',system-ui,sans-serif;color:var(--ink);background:var(--cream);
  min-height:100vh;padding-bottom:64px;font-size:15px;line-height:1.45;
}
.mp *{box-sizing:border-box;}
.mp button{font-family:inherit;cursor:pointer;color:inherit;}
.mp button:disabled{cursor:default;opacity:.5;}
.mp button:focus-visible,.mp input:focus-visible,.mp textarea:focus-visible,.mp select:focus-visible{
  outline:2px solid var(--butter);outline-offset:2px;}
.mp a{color:var(--tomato);}

.top{position:sticky;top:0;z-index:10;background:var(--cream);border-bottom:1px solid var(--line);
  padding:10px 16px 0;padding-top:calc(10px + env(safe-area-inset-top));}
.topline{display:flex;justify-content:space-between;align-items:baseline;gap:12px;max-width:720px;margin:0 auto;}
.brand{font-family:'Fraunces',serif;font-weight:600;font-size:17px;color:var(--tomato);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.acct{display:flex;gap:14px;flex-shrink:0;}
.tabs{display:flex;gap:4px;max-width:720px;margin:8px auto 0;}
.tabs button{flex:1;background:none;border:none;border-bottom:3px solid transparent;padding:8px 2px 9px;
  font-weight:500;font-size:14px;color:var(--soft);white-space:nowrap;}
@media (max-width:420px){.tabs button{font-size:13.5px;}}
.tabs button.on{color:var(--ink);border-bottom-color:var(--tomato);}
.badge{display:inline-block;margin-left:4px;min-width:18px;padding:0 5px;text-align:center;border-radius:999px;background:var(--tomato);
  color:#fff;font-size:11px;font-weight:700;line-height:18px;}

.page{max-width:720px;margin:0 auto;padding:16px;}
.page.narrow{max-width:460px;}
.pagehead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;}
.h1{font-family:'Fraunces',serif;font-weight:600;font-size:28px;margin:6px 0 4px;line-height:1.15;}
.h2{font-family:'Fraunces',serif;font-weight:600;font-size:22px;margin:0;}
.muted{color:var(--soft);}
.small{font-size:13px;}
.pad{padding:10px 2px;}
.row{display:flex;align-items:center;flex-wrap:wrap;}
.gap{gap:8px;}

.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:12px;}
.form .btn{margin-top:14px;}
.empty{border:1.5px dashed var(--line);border-radius:12px;padding:22px 18px;text-align:center;color:var(--soft);}

.field{display:block;margin-top:12px;}
.flabel{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);margin-bottom:5px;}
.input{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;
  background:#FFFDF9;color:var(--ink);}
textarea.input{resize:vertical;}
.filters{display:flex;gap:8px;margin-bottom:12px;}
.filters select{width:auto;flex-shrink:0;}

.btn{border:none;background:var(--tomato);color:#fff !important;border-radius:9px;padding:11px 16px;font-weight:700;font-size:15px;}
.btn.small{padding:8px 12px;font-size:14px;}
.btn.ghost{background:none;border:1px solid var(--line);color:var(--ink) !important;}
.linkish{background:none;border:none;padding:0;font-size:13px;color:var(--soft);text-decoration:underline;}
.iconbtn{background:none;border:1px solid var(--line);border-radius:8px;width:34px;height:34px;flex-shrink:0;
  display:inline-flex;align-items:center;justify-content:center;font-size:15px;color:var(--soft);}
.chipbtn{white-space:nowrap;background:var(--cream);border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:14px;}
.chipbtn.quiet{background:none;color:var(--soft);}
.chipbtn.danger{color:var(--tomato);}
.chipbtn.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.iconbtn.quiet{border-color:transparent;}
.stack{display:flex;flex-direction:column;gap:8px;}
.stack .btn{margin:0;}

.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.seg button{background:#fff;border:none;padding:8px 14px;font-size:14px;color:var(--soft);}
.seg button.on{background:var(--ink);color:#fff;}

.err{margin-top:12px;padding:9px 12px;border-radius:8px;background:var(--tomato-soft);color:#8A2C16;font-size:14px;}
.ok{margin-top:12px;padding:9px 12px;border-radius:8px;background:var(--basil-soft);color:var(--basil);font-size:14px;}
.banner{max-width:720px;margin:12px auto 0;padding:10px 12px;border-radius:10px;background:var(--tomato-soft);color:#8A2C16;
  display:flex;gap:10px;align-items:center;justify-content:space-between;font-size:14px;}
.center{min-height:70vh;display:flex;align-items:center;justify-content:center;color:var(--soft);}
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;}
.gate .card{width:100%;}

/* ---------------------------- weekly plan ---------------------------- */

.weeknav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
.weeklabel{font-weight:700;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;justify-content:center;}
.strip{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:14px;}
.daybtn{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 0 6px;
  display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;}
.daybtn .dname{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);}
.daybtn .dnum{font-family:'Fraunces',serif;font-size:18px;font-weight:600;}
.daybtn .dprog{font-size:10px;color:var(--soft);}
.daybtn .dprog.full{color:var(--basil);font-weight:700;}
.daybtn.today{border-color:var(--butter);box-shadow:inset 0 0 0 1px var(--butter);}
.daybtn.on{background:var(--ink);border-color:var(--ink);}
.daybtn.on .dname,.daybtn.on .dnum,.daybtn.on .dprog{color:#fff;}
.dayhead{font-family:'Fraunces',serif;font-weight:600;font-size:22px;margin:4px 0 10px;}
.dayhead .muted{font-family:'DM Sans',sans-serif;font-size:15px;font-weight:400;}

.sechead{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);margin:0 0 6px;}
.slot{display:flex;align-items:center;gap:8px;border-top:1px solid var(--line);min-height:48px;}
.sechead + .slot{border-top:none;}
.slotmain{flex:1;min-width:0;display:flex;align-items:center;gap:12px;text-align:left;background:none;border:none;padding:11px 2px;}
.slot .who{width:70px;flex-shrink:0;font-weight:700;font-size:14px;}
.slot .placeholder{color:#B3A79D;}
.slot .none{color:var(--soft);text-decoration:line-through;}
.slot.eaten .picked{color:var(--basil);}
.pill{flex-shrink:0;background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px;min-width:58px;
  font-size:13px;font-weight:700;color:var(--soft);}
.pill.skip.on{background:var(--ink);border-color:var(--ink);color:#fff;}
.pill.ate{border-color:#CFE3D4;color:var(--basil);}
.pill.ate.on{background:var(--basil);border-color:var(--basil);color:#fff;}
.slot.meal .picked{font-weight:500;}
.picked{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tag{display:inline-block;white-space:nowrap;text-decoration:none;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:1px 6px;}
.tag.recipe{background:var(--tomato-soft);color:var(--tomato);}
.tag.inventory{background:var(--basil-soft);color:var(--basil);}
.tag.list{background:var(--butter-soft);color:#8A6A12;margin-left:8px;}
.tag.new{background:var(--butter-soft);color:#8A6A12;margin-left:8px;}

.scrim{position:fixed;inset:0;background:rgba(42,35,32,.38);z-index:50;display:flex;align-items:flex-end;justify-content:center;}
.sheetx{background:var(--card);width:100%;max-width:560px;max-height:82vh;display:flex;flex-direction:column;gap:10px;
  border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));}
@media (min-width:700px){.scrim{align-items:center;}.sheetx{border-radius:16px;}}
.sheethead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.sheettitle{font-family:'Fraunces',serif;font-weight:600;font-size:20px;}
.optlist{overflow-y:auto;min-height:60px;border:1px solid var(--line);border-radius:10px;}
.opt{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;
  background:none;border:none;border-bottom:1px solid var(--line);padding:11px 12px;font-size:15px;}
.opt:last-child{border-bottom:none;}
.opt.on{background:var(--butter-soft);font-weight:700;}
.sheetacts,.sheetfoot{display:flex;gap:8px;flex-wrap:wrap;}

/* ------------------------------ recipes ------------------------------ */

.recipe .rhead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.rname{background:none;border:none;padding:0;text-align:left;font-family:'Fraunces',serif;font-weight:600;font-size:18px;line-height:1.25;}
.made{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--soft);
  border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 8px;flex-shrink:0;cursor:pointer;}
.made.on{background:var(--basil-soft);border-color:var(--basil);color:var(--basil);}
.made input{accent-color:var(--basil);margin:0;}
.rmeta{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px;color:var(--soft);margin-top:4px;}
.ratings{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 14px;margin-top:10px;}
@media (min-width:600px){.ratings{grid-template-columns:repeat(4,1fr);}}
.rate{display:flex;align-items:center;justify-content:space-between;gap:6px;}
.rate .who{font-size:13px;font-weight:700;}
.thumbs{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;}
.thumbs button{background:#fff;border:none;padding:4px 7px;font-size:15px;filter:grayscale(1);opacity:.45;}
.thumbs button.on{filter:none;opacity:1;background:var(--butter-soft);}
.thumbs.big button{padding:8px 12px;font-size:20px;}
.ratings.follow{grid-template-columns:1fr;gap:10px;margin:4px 0 6px;}
.ratings.follow .who{font-size:15px;}
.rbody{margin-top:10px;border-top:1px solid var(--line);padding-top:10px;}
.ingredients{white-space:pre-wrap;margin:0 0 10px;}

/* ----------------------------- inventory ----------------------------- */

.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}
.chip{background:var(--basil-soft);color:var(--basil);border-radius:999px;padding:4px 10px;font-size:13px;font-weight:500;}
.list{padding:0 14px;}
.table{padding:4px 12px;}
.thead,.trow{display:flex;align-items:center;gap:10px;}
.thead{border-bottom:1px solid var(--line);padding:6px 0;}
.th{background:none;border:none;padding:4px 0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--soft);text-align:left;flex:1;}
.th.right{flex:0 0 92px;text-align:right;}
.tcheck{width:26px;flex-shrink:0;}
.tx{width:34px;flex-shrink:0;}
.trow{border-bottom:1px solid var(--line);padding:6px 0;min-height:48px;}
.trow:last-child{border-bottom:none;}
.trow .iname{flex:1;min-width:0;}
.tdate{flex:0 0 92px;text-align:right;font-size:13px;display:flex;flex-direction:column;line-height:1.25;}
.tdate .muted{font-size:11.5px;}
.tick{width:26px;height:26px;flex-shrink:0;border-radius:50%;border:2px solid var(--line);background:#fff;
  color:#fff;font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;padding:0;}
.tick.on{background:var(--basil);border-color:var(--basil);color:#fff;}
.trow.used .iname,.trow.carted .iname{text-decoration:line-through;color:#A89C92;}
.trow.used .tdate{opacity:.55;}
.relist{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:none;text-align:left;padding:6px 0;}
.relist .plus{width:26px;height:26px;border-radius:50%;background:var(--tomato-soft);color:var(--tomato);font-weight:700;
  display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);}
.item:last-child{border-bottom:none;}
.iname{font-weight:500;}
`;

export default CSS;
