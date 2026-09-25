/* Palette and layout for My Reading Buddy. Storybook paper for the shelf
   and the grown-up screens; a dark, cozy room for reading so the pages
   glow. Tablet first, with tap targets sized for small hands. Everything
   is scoped under .rb so none of it leaks into the rest of the portfolio. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;600;700;800&display=swap');

.rb{
  --paper:#FFF8EC; --card:#FFFFFF; --ink:#2B2A4C; --soft:#6D6A8A; --line:#EDE2CF;
  --berry:#E4572E; --berry-soft:#FCE3DB; --sky:#3A7CA5; --sun:#F6AE2D; --leaf:#5DA271;
  --night:#1B1E3A; --night-2:#262A4F;
  font-family:'Nunito',system-ui,sans-serif;color:var(--ink);background:var(--paper);
  min-height:100vh;padding-bottom:48px;font-size:16px;line-height:1.45;
  -webkit-tap-highlight-color:transparent;
}
.rb.bare{padding-bottom:0;background:var(--night);}
.rb *{box-sizing:border-box;}
.rb button{font-family:inherit;cursor:pointer;color:inherit;}
.rb button:disabled{cursor:default;opacity:.4;}
.rb button:focus-visible,.rb input:focus-visible{outline:3px solid var(--sun);outline-offset:2px;}
.rb svg{display:block;}

.top{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:12px;
  background:var(--paper);border-bottom:2px solid var(--line);
  padding:10px 16px;padding-top:calc(10px + env(safe-area-inset-top));}
.brand{display:flex;align-items:center;gap:8px;background:none;border:none;padding:0;min-width:0;
  font-family:'Fredoka',sans-serif;font-weight:600;font-size:20px;color:var(--berry) !important;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.acct{display:flex;align-items:center;gap:14px;flex-shrink:0;}
.toggle{border:2px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px;font-weight:700;font-size:14px;color:var(--soft) !important;}
.toggle.on{background:var(--ink);border-color:var(--ink);color:#fff !important;}
.linkish{background:none;border:none;padding:0;font-size:14px;color:var(--soft) !important;text-decoration:underline;}

.page{max-width:760px;margin:0 auto;padding:16px;}
.page.narrow{max-width:480px;}
.page.wide{max-width:1100px;}
.pagehead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;}
.h1{font-family:'Fredoka',sans-serif;font-weight:600;font-size:32px;margin:6px 0 4px;line-height:1.15;}
.h2{font-family:'Fredoka',sans-serif;font-weight:600;font-size:23px;margin:0;}
.muted{color:var(--soft);}
.small{font-size:14px;}
.center{text-align:center;padding:60px 16px;color:var(--soft);}
.row{display:flex;align-items:center;flex-wrap:wrap;}
.row.center{justify-content:center;padding:0;}
.nowrap{flex-wrap:nowrap;}
.gap{gap:10px;}
.spacer{flex:1;}

.card{background:var(--card);border:2px solid var(--line);border-radius:18px;padding:14px 16px;margin-bottom:14px;}
.form .btn{margin-top:14px;}
.sechead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.empty{border:2px dashed var(--line);border-radius:18px;padding:34px 18px;text-align:center;color:var(--soft);font-size:17px;}
.field{display:block;margin-bottom:12px;}
.flabel{display:block;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--soft);margin:0 0 5px;}
.input{width:100%;font:inherit;font-size:16px;padding:11px 13px;border:2px solid var(--line);border-radius:12px;background:#FFFDF8;color:var(--ink);}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;background:var(--ink);color:#fff !important;
  border-radius:999px;padding:12px 20px;font-weight:800;font-size:16px;box-shadow:0 3px 0 rgba(0,0,0,.18);}
.btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.18);}
.btn svg{font-size:18px;}
.btn.small{padding:8px 14px;font-size:14px;}
.btn.berry{background:var(--berry);}
.btn.sky{background:var(--sky);}
.btn.sun{background:var(--sun);color:var(--ink) !important;}
.btn.ghost{background:transparent;color:var(--ink) !important;box-shadow:inset 0 0 0 2px var(--line);}
.chipbtn{display:inline-flex;align-items:center;gap:5px;border:2px solid var(--line);background:var(--card);border-radius:999px;
  padding:6px 12px;font-weight:700;font-size:14px;}
.chipbtn svg{font-size:14px;}
.iconbtn{border:none;background:none;min-width:36px;min-height:36px;border-radius:10px;font-size:17px;color:var(--soft) !important;}
.iconbtn:hover:not(:disabled){background:var(--line);}

.banner{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px auto 0;max-width:760px;
  background:var(--berry-soft);color:#8A2A10;border-radius:14px;padding:10px 14px;font-weight:600;position:relative;z-index:30;}
.rb.bare .banner{position:fixed;left:16px;right:16px;top:calc(12px + env(safe-area-inset-top));margin:0;}
.err{margin-top:12px;color:#8A2A10;font-weight:600;}

.gate{min-height:90vh;display:flex;align-items:center;justify-content:center;padding:16px;}
.gatecard{max-width:420px;text-align:center;padding:28px 24px;}
.logo{font-size:56px;line-height:1;}
.members{list-style:none;padding:0;margin:0 0 10px;}
.members li{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);word-break:break-all;}

/* ---------------------------- the shelf ---------------------------- */
.shelf{list-style:none;padding:0;margin:4px 0 0;display:grid;gap:26px 20px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));}
@media (max-width:480px){.shelf{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 14px;}}
.bookitem{display:flex;flex-direction:column;min-width:0;}
.cover{position:relative;display:block;width:100%;aspect-ratio:4/3;padding:0;border:none;border-radius:8px 16px 16px 8px;overflow:hidden;
  background:var(--spine);box-shadow:inset 10px 0 0 rgba(0,0,0,.14),0 6px 0 rgba(43,42,76,.12),0 12px 24px rgba(43,42,76,.16);
  transition:transform .15s ease;}
.cover:hover{transform:translateY(-3px) rotate(-.6deg);}
.cover:active{transform:scale(.97);}
.cover img{width:100%;height:100%;object-fit:cover;display:block;}
.nocover{display:flex;align-items:center;justify-content:center;height:100%;padding:14px 14px 14px 22px;text-align:center;
  font-family:'Fredoka',sans-serif;font-weight:600;font-size:22px;color:#fff;line-height:1.15;}
.booktitle{font-family:'Fredoka',sans-serif;font-weight:600;font-size:19px;margin-top:10px;line-height:1.2;}
.bookby{color:var(--soft);font-size:14px;}
.bookmeta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;}
.newbook{max-width:480px;}

/* ---------------------------- the editor --------------------------- */
.pagelist{list-style:none;padding:0;margin:0;display:grid;gap:12px;}
.pagecard{display:flex;gap:12px;align-items:center;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:10px;}
.thumb{width:128px;aspect-ratio:4/3;object-fit:cover;border-radius:8px;flex-shrink:0;background:var(--line);}
@media (max-width:480px){.thumb{width:92px;}}
.pageinfo{flex:1;min-width:0;}
.pagetop{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tag{font-size:12px;font-weight:800;padding:2px 9px;border-radius:999px;background:var(--line);color:var(--soft);}
.tag.ok{background:#E2F2E6;color:#2F6B3D;}
.pageacts{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap;}
.danger{text-align:center;margin-top:28px;}

/* ------------------------ reading / recording ---------------------- */
.reader{position:fixed;inset:0;display:flex;flex-direction:column;color:#fff;
  background:radial-gradient(120% 80% at 50% 40%,var(--night-2),var(--night));
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  user-select:none;-webkit-user-select:none;touch-action:manipulation;}
.rtop{display:flex;align-items:center;gap:12px;padding:10px 16px;}
.rtitle{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center;}
.rname{font-family:'Fredoka',sans-serif;font-weight:600;font-size:20px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rby{font-size:13px;opacity:.7;}
.rcount{min-width:56px;text-align:right;font-weight:800;opacity:.75;}
.reader .btn.ghost{color:#fff !important;box-shadow:inset 0 0 0 2px rgba(255,255,255,.3);}

.stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:6px 16px;touch-action:pan-y;}
.spread{position:relative;perspective:2400px;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.45);}
.half{position:absolute;top:0;height:100%;width:50%;background-repeat:no-repeat;background-size:200% 100%;background-color:#fff;}
.half.whole{left:0;width:100%;background-size:100% 100%;border-radius:6px;}
.half.still.l{left:0;border-radius:6px 0 0 6px;}
.half.still.r{right:0;border-radius:0 6px 6px 0;}
.gutter{position:absolute;top:0;bottom:0;left:50%;width:36px;transform:translateX(-50%);pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(0,0,0,.10) 45%,rgba(0,0,0,.16) 50%,rgba(0,0,0,.10) 55%,transparent);}

.leaf{position:absolute;top:0;height:100%;width:50%;transform-style:preserve-3d;z-index:2;
  animation-duration:.95s;animation-timing-function:cubic-bezier(.45,.05,.35,1);animation-fill-mode:forwards;}
.leaf.fwd{left:50%;transform-origin:left center;animation-name:rbTurnFwd;}
.leaf.bwd{left:0;transform-origin:right center;animation-name:rbTurnBwd;}
.leaf .face{left:0;width:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;}
.leaf .face.back{transform:rotateY(180deg);}
.leaf .face::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  animation:rbShade .95s cubic-bezier(.45,.05,.35,1) both;}
.leaf.fwd .face.front::after{background:linear-gradient(90deg,rgba(0,0,0,.25),transparent 60%);}
.leaf.fwd .face.back::after{background:linear-gradient(270deg,rgba(0,0,0,.25),transparent 60%);}
.leaf.bwd .face.front::after{background:linear-gradient(270deg,rgba(0,0,0,.25),transparent 60%);}
.leaf.bwd .face.back::after{background:linear-gradient(90deg,rgba(0,0,0,.25),transparent 60%);}
@keyframes rbTurnFwd{
  0%{transform:rotateY(0deg);}
  50%{transform:rotateY(-90deg) translateZ(8px);}
  100%{transform:rotateY(-180deg);}
}
@keyframes rbTurnBwd{
  0%{transform:rotateY(0deg);}
  50%{transform:rotateY(90deg) translateZ(8px);}
  100%{transform:rotateY(180deg);}
}
@keyframes rbShade{0%{opacity:0;}50%{opacity:1;}100%{opacity:0;}}
@media (prefers-reduced-motion:reduce){.leaf,.leaf .face::after{animation-duration:.25s;}}

.bigplay{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:120px;height:120px;border-radius:50%;
  border:none;background:var(--sun);color:var(--ink) !important;font-size:60px;display:flex;align-items:center;justify-content:center;
  padding-left:10px;box-shadow:0 8px 0 #C9861A,0 18px 40px rgba(0,0,0,.4);animation:rbBob 2.2s ease-in-out infinite;}
.bigplay:active{transform:translate(-50%,-46%);box-shadow:0 4px 0 #C9861A;}
@keyframes rbBob{0%,100%{margin-top:0;}50%{margin-top:-8px;}}
@media (prefers-reduced-motion:reduce){.bigplay{animation:none;}}

.theend{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;background:rgba(27,30,58,.55);border-radius:6px;}
.endcard{background:var(--paper);color:var(--ink);border-radius:22px;padding:24px 26px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.4);margin:12px;}
.endcard .btn.ghost{color:var(--ink) !important;box-shadow:inset 0 0 0 2px var(--line);}
.endword{font-family:'Fredoka',sans-serif;font-weight:600;font-size:44px;color:var(--berry);margin-bottom:14px;}

.rbar{display:flex;align-items:center;justify-content:center;gap:28px;padding:10px 16px 16px;}
.roundbtn{width:52px;height:52px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff !important;
  display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;}
.roundbtn.big{width:68px;height:68px;font-size:32px;}
.playbtn{width:88px;height:88px;border-radius:50%;border:none;background:var(--sun);color:var(--ink) !important;font-size:42px;
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 #C9861A;}
.playbtn:not(.on) svg{margin-left:6px;}
.playbtn:active{transform:translateY(3px);box-shadow:0 3px 0 #C9861A;}
.rotatehint{display:none;text-align:center;font-size:13px;opacity:.6;padding:0 16px 4px;}
@media (orientation:portrait) and (max-width:600px){.rotatehint{display:block;}}
.quiet{position:absolute;left:50%;bottom:calc(122px + env(safe-area-inset-bottom));transform:translateX(-50%);font-size:13px;opacity:.6;white-space:nowrap;pointer-events:none;}

.reccol{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:150px;}
.recbtn{width:88px;height:88px;border-radius:50%;border:4px solid #fff;background:var(--berry);color:#fff !important;font-size:40px;
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.35);}
.recbtn.live{animation:rbPulse 1.4s ease-out infinite;}
@keyframes rbPulse{0%{box-shadow:0 0 0 0 rgba(228,87,46,.7);}100%{box-shadow:0 0 0 22px rgba(228,87,46,0);}}
.reclabel{font-size:14px;font-weight:700;opacity:.85;min-height:20px;text-align:center;}
.onair{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:8px;
  background:rgba(0,0,0,.65);color:#fff;border-radius:999px;padding:6px 14px;font-weight:800;font-variant-numeric:tabular-nums;}
.onair .dot{width:11px;height:11px;border-radius:50%;background:#FF4B3A;animation:rbBlink 1s steps(2) infinite;}
@keyframes rbBlink{50%{opacity:.2;}}
.micerr{margin:0 16px;padding:10px 14px;border-radius:12px;background:rgba(228,87,46,.2);color:#FFD9CE;text-align:center;font-weight:600;}
.listenrow{display:flex;justify-content:center;padding:0 16px 14px;margin-top:-4px;}
.chipbtn.light{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff !important;padding:8px 16px;}

@media (max-height:520px){
  .rtop{padding:4px 12px;}
  .rbar{padding:4px 12px 8px;gap:20px;}
  .roundbtn.big{width:52px;height:52px;font-size:26px;}
  .playbtn,.recbtn{width:64px;height:64px;font-size:30px;}
  .bigplay{width:96px;height:96px;font-size:46px;}
  .rotatehint{display:none;text-align:center;font-size:13px;opacity:.6;padding:0 16px 4px;}
@media (orientation:portrait) and (max-width:600px){.rotatehint{display:block;}}
.quiet{display:none;}
}
`;

export default CSS;
