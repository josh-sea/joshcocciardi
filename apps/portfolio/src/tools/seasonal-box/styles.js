/* Seasonal Box HQ. A working console, not a storefront: dense where it has to
   be (approval cards, run logs), calm everywhere else. Everything is scoped
   under .sb so none of it leaks into the rest of the portfolio. Phone width
   works: one column, horizontally scrolling nav, full-width cards. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.sb{
  --bg:#F6F2EA; --card:#FFFDF8; --ink:#1F2A24; --soft:#5F6B63; --faint:#8C968F; --line:#E2DACB; --line2:#EEE7DA;
  --pine:#2F5D4A; --pine-soft:#E2EDE6; --clay:#B4572E; --clay-soft:#F7E3D8; --honey:#C9962B; --honey-soft:#F8EDCF;
  --red:#B23A2B; --red-soft:#F8DEDA; --yellow:#A9760F; --yellow-soft:#FBF0D2; --green:#2F7A4C; --green-soft:#DDF0E3;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;font-size:14.5px;line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.sb *{box-sizing:border-box;}
.sb button{font-family:inherit;cursor:pointer;color:inherit;}
.sb button:disabled{cursor:default;opacity:.5;}
.sb a{color:var(--pine);}
.sb :focus-visible{outline:2px solid var(--honey);outline-offset:2px;}
.sb h1,.sb h2,.sb h3{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-.01em;margin:0;}
.sb code,.sb .mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;}

.sb-top{position:sticky;top:0;z-index:20;background:rgba(246,242,234,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);}
.sb-topin{max-width:1180px;margin:0 auto;padding:10px 16px 0;}
.sb-brandrow{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.sb-brand{font-family:'Fraunces',serif;font-weight:600;font-size:19px;color:var(--pine);display:flex;align-items:center;gap:8px;white-space:nowrap;}
.sb-brand small{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);}
.sb-who{font-size:12.5px;color:var(--soft);display:flex;gap:12px;align-items:center;min-width:0;}
.sb-who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
@media (max-width:600px){.sb-who .sb-email{display:none;}}
.sb-nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;margin-top:6px;}
.sb-nav::-webkit-scrollbar{display:none;}
.sb .sb-nav button{background:none;border:none;border-bottom:2.5px solid transparent;padding:8px 11px 9px;font-weight:600;font-size:13.5px;color:var(--soft);white-space:nowrap;}
.sb .sb-nav button.on{color:var(--ink);border-bottom-color:var(--clay);}
.sb-badge{display:inline-block;margin-left:5px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--clay);color:#fff;font-size:11px;line-height:18px;text-align:center;}

.sb-page{max-width:1180px;margin:0 auto;padding:18px 16px 80px;}
.sb-pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.sb-pagehead h1{font-size:28px;line-height:1.1;}
.sb-sub{color:var(--soft);margin-top:4px;}
.sb-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:start;}
@media (max-width:900px){.sb-grid{grid-template-columns:minmax(0,1fr);}}
.sb-cols2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.sb-cols3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
@media (max-width:720px){.sb-cols2,.sb-cols3{grid-template-columns:minmax(0,1fr);}}

.sb-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px;min-width:0;}
.sb-card.tight{padding:10px 12px;}
.sb-cardhead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;}
.sb-cardhead h2{font-size:18px;}
.sb-cardhead h3{font-size:15.5px;}
.sb-section{margin-top:18px;}
.sb-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:6px;}
.sb-muted{color:var(--soft);}
.sb-faint{color:var(--faint);}
.sb-small{font-size:12.5px;}
.sb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.sb-between{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.sb-stack{display:flex;flex-direction:column;gap:8px;}
.sb-empty{border:1.5px dashed var(--line);border-radius:12px;padding:22px 16px;text-align:center;color:var(--soft);}
.sb-pre{white-space:pre-wrap;word-break:break-word;}
.sb-divider{height:1px;background:var(--line2);margin:12px 0;}

.sb .sb-btn{border:none;background:var(--pine);color:#fff;border-radius:9px;padding:8px 14px;font-weight:600;font-size:13.5px;white-space:nowrap;}
.sb .sb-btn.clay{background:var(--clay);}
.sb .sb-btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);}
.sb .sb-btn.danger{background:transparent;border:1px solid #E4B6AE;color:var(--red);}
.sb .sb-btn.sm{padding:5px 10px;font-size:12.5px;border-radius:8px;}
.sb .sb-link{background:none;border:none;padding:0;color:var(--pine);font-weight:600;font-size:13px;text-decoration:underline;text-underline-offset:2px;}

.sb-input,.sb select.sb-input,.sb textarea.sb-input{width:100%;font:inherit;font-size:14.5px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:#FFFEFB;color:var(--ink);}
.sb textarea.sb-input{resize:vertical;min-height:70px;}
.sb textarea.sb-code{font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.45;}
.sb-field{display:block;margin-bottom:10px;}
.sb-field > span{display:block;font-size:12px;font-weight:600;color:var(--soft);margin-bottom:4px;}
.sb-check{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;margin:0 12px 6px 0;}
@media (max-width:720px){.sb-input,.sb select.sb-input,.sb textarea.sb-input{font-size:16px;}}

.sb-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--line2);color:var(--soft);white-space:nowrap;}
.sb-chip.red{background:var(--red-soft);color:var(--red);}
.sb-chip.yellow{background:var(--yellow-soft);color:var(--yellow);}
.sb-chip.green{background:var(--green-soft);color:var(--green);}
.sb-chip.pine{background:var(--pine-soft);color:var(--pine);}
.sb-chip.clay{background:var(--clay-soft);color:var(--clay);}
.sb-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--faint);}
.sb-dot.live{background:var(--green);box-shadow:0 0 0 0 rgba(47,122,76,.5);animation:sbpulse 1.6s infinite;}
@keyframes sbpulse{0%{box-shadow:0 0 0 0 rgba(47,122,76,.45);}70%{box-shadow:0 0 0 7px rgba(47,122,76,0);}100%{box-shadow:0 0 0 0 rgba(47,122,76,0);}}
@media (prefers-reduced-motion:reduce){.sb-dot.live{animation:none;}}

.sb-err{padding:9px 12px;border-radius:9px;background:var(--red-soft);color:var(--red);font-size:13.5px;margin:8px 0;}
.sb-ok{padding:9px 12px;border-radius:9px;background:var(--green-soft);color:var(--green);font-size:13.5px;margin:8px 0;}
.sb-banner{padding:12px 14px;border-radius:12px;background:var(--honey-soft);border:1px solid #EBD79F;margin-bottom:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;}

/* Approval cards */
.sb-appr{border-left:4px solid var(--line);}
.sb-appr.red{border-left-color:var(--red);}
.sb-appr.yellow{border-left-color:var(--honey);}
.sb-appr.green{border-left-color:var(--green);}
.sb-appr-title{font-weight:650;font-size:15px;line-height:1.35;}
.sb-appr-meta{font-size:12.5px;color:var(--soft);margin-top:3px;display:flex;flex-wrap:wrap;gap:4px 10px;}
.sb-appr-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;}

/* Stage tracker */
.sb-stages{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px;}
.sb-stage{height:8px;border-radius:4px;background:var(--line);}
.sb-stage.done{background:var(--pine);}
.sb-stage.cur{background:var(--clay);}
.sb-stagelist{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;}
.sb-stagecell{border:1px solid var(--line);border-radius:10px;padding:7px 9px;font-size:12.5px;background:#fff;}
.sb-stagecell.done{background:var(--pine-soft);border-color:#C7DCCF;}
.sb-stagecell.cur{background:var(--clay-soft);border-color:#EBC3AE;}
.sb-stagecell b{display:block;font-size:11px;color:var(--faint);font-weight:700;}

/* Timeline */
.sb-ms{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line2);font-size:13px;}
.sb-ms:last-child{border-bottom:none;}
.sb-ms .st-done{color:var(--green);} .sb-ms .st-at-risk{color:var(--yellow);font-weight:600;} .sb-ms .st-overdue{color:var(--red);font-weight:700;} .sb-ms .st-upcoming{color:var(--faint);}

/* Meters */
.sb-meter{height:8px;border-radius:4px;background:var(--line2);overflow:hidden;margin-top:6px;}
.sb-meter > div{height:100%;background:var(--pine);}
.sb-meter.warn > div{background:var(--honey);}
.sb-meter.over > div{background:var(--red);}
.sb-stat{font-family:'Fraunces',serif;font-size:24px;font-weight:600;line-height:1.1;}

/* Vision board */
.sb-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
.sb-theme{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column;}
.sb-theme.picked{outline:2.5px solid var(--clay);outline-offset:-1px;}
.sb-swatches{display:flex;height:54px;}
.sb-swatches > div{flex:1;position:relative;}
.sb-swatches > div span{position:absolute;bottom:3px;left:4px;font-size:9.5px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,.92);}
.sb-swatches > div.light span{color:rgba(31,42,36,.75);}
.sb-moods{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--line2);}
.sb-moods img,.sb-moods .ph{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--line2);}
.sb-theme-body{padding:12px 14px;flex:1;}
.sb-theme-body h3{font-size:18px;margin-bottom:4px;}
.sb-taglist{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}

/* Tables */
.sb-table{width:100%;border-collapse:collapse;font-size:13px;}
.sb-table th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:6px 8px;border-bottom:1px solid var(--line);}
.sb-table td{padding:7px 8px;border-bottom:1px solid var(--line2);vertical-align:top;}
.sb-table tr:last-child td{border-bottom:none;}
.sb-tablewrap{overflow-x:auto;}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}

/* Run log */
.sb-step{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px;background:#fff;}
.sb-step-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--soft);}
.sb-call{border-radius:8px;background:var(--bg);padding:6px 9px;margin-top:6px;font-size:12.5px;}
.sb-call b{font-family:'JetBrains Mono',monospace;font-weight:500;color:var(--pine);}
.sb-call.err b{color:var(--red);}
.sb-kv{display:grid;grid-template-columns:minmax(110px,max-content) minmax(0,1fr);gap:4px 12px;font-size:13px;}
.sb-kv > div:nth-child(odd){color:var(--faint);}

.sb-list-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line2);}
.sb-list-item:last-child{border-bottom:none;}
.sb-clickable{cursor:pointer;}
.sb-clickable:hover{background:rgba(47,93,74,.03);}

.sb-modal-back{position:fixed;inset:0;background:rgba(31,42,36,.38);z-index:50;display:flex;align-items:flex-end;justify-content:center;padding:0;}
@media (min-width:720px){.sb-modal-back{align-items:center;padding:24px;}}
.sb-modal{background:var(--card);width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:16px 16px 0 0;padding:18px;}
@media (min-width:720px){.sb-modal{border-radius:16px;}}
`;

export default CSS;
