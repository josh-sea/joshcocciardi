/* Narrative Lab. A reading tool first: the text and its highlights get the
   room, scores sit beside them. One color per layer, used the same way in
   highlights, chips, and legends. Everything is scoped under .nl. Phone width
   works: one column, horizontally scrolling nav. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.nl{
  --bg:#F5F3EE; --card:#FFFFFF; --ink:#1B1D22; --soft:#555B66; --faint:#8A909B; --line:#E1DDD3; --line2:#ECE8DF;
  --accent:#1F4E79; --accent-soft:#E2EBF4;
  --l2:#2F5FA8; --l2-soft:#E1EAF7; --l3:#A7650C; --l3-soft:#FAEBD3; --l4:#6A4BB0; --l4-soft:#ECE5F9; --l5:#B03A2E; --l5-soft:#F8E0DC;
  --good:#2F7A4C; --good-soft:#DFF0E5; --mid:#A7650C; --mid-soft:#FAEBD3; --low:#B03A2E; --low-soft:#F8E0DC;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;font-size:14.5px;line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  .nl{
    --bg:#121418; --card:#1A1D23; --ink:#E7E9EE; --soft:#A4AAB6; --faint:#767D8A; --line:#2A2F38; --line2:#22262E;
    --accent:#8DB6E0; --accent-soft:#1C2A3A;
    --l2:#8DB0EA; --l2-soft:#1D2A40; --l3:#E6AE5C; --l3-soft:#3A2A14; --l4:#B9A2EE; --l4-soft:#2A2340; --l5:#EE8F84; --l5-soft:#3F201C;
    --good:#7FCB98; --good-soft:#18301F; --mid:#E6AE5C; --mid-soft:#3A2A14; --low:#EE8F84; --low-soft:#3F201C;
  }
}
.nl *{box-sizing:border-box;}
.nl button{font-family:inherit;cursor:pointer;color:inherit;}
.nl button:disabled{cursor:default;opacity:.5;}
.nl a{color:var(--accent);}
.nl :focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.nl h1,.nl h2,.nl h3{font-family:'Newsreader',Georgia,serif;font-weight:600;letter-spacing:-.01em;margin:0;}
.nl code,.nl .mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;}

.nl-top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);}
.nl-topin{max-width:1200px;margin:0 auto;padding:10px 16px 0;}
.nl-brandrow{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.nl-brand{font-family:'Newsreader',serif;font-weight:600;font-size:21px;color:var(--ink);display:flex;align-items:baseline;gap:8px;white-space:nowrap;}
.nl-brand small{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);}
.nl-who{font-size:12.5px;color:var(--soft);display:flex;gap:12px;align-items:center;min-width:0;}
.nl-who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
@media (max-width:640px){.nl-who .nl-email{display:none;}}
.nl-nav{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;margin-top:6px;}
.nl-nav::-webkit-scrollbar{display:none;}
.nl .nl-nav button{background:none;border:none;border-bottom:2.5px solid transparent;padding:8px 11px 9px;font-weight:600;font-size:13.5px;color:var(--soft);white-space:nowrap;}
.nl .nl-nav button.on{color:var(--ink);border-bottom-color:var(--accent);}
.nl-count{display:inline-block;margin-left:5px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--accent);color:var(--card);font-size:11px;line-height:18px;text-align:center;}

.nl-page{max-width:1200px;margin:0 auto;padding:20px 16px 90px;}
.nl-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
.nl-head h1{font-size:30px;line-height:1.1;}
.nl-sub{color:var(--soft);margin-top:4px;max-width:720px;}
.nl-back{background:none;border:none;color:var(--soft);font-size:13px;padding:0;margin-bottom:8px;}

.nl-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;}
.nl-card + .nl-card{margin-top:12px;}
.nl-card h2{font-size:19px;margin-bottom:8px;}
.nl-card h3{font-size:16px;margin:14px 0 6px;}
.nl-grid{display:grid;gap:12px;}
.nl-two{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start;}
@media (max-width:960px){.nl-two{grid-template-columns:1fr;}}
.nl-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}
.nl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.nl-between{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
.nl-soft{color:var(--soft);} .nl-faint{color:var(--faint);} .nl-small{font-size:12.5px;} .nl-tiny{font-size:11.5px;}
.nl-err{background:var(--low-soft);color:var(--low);border-radius:10px;padding:10px 12px;margin-bottom:12px;}
.nl-note{background:var(--accent-soft);border-radius:10px;padding:10px 12px;}
.nl-empty{color:var(--soft);text-align:center;padding:36px 12px;}

.nl-btn{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:7px 12px;font-weight:600;font-size:13px;}
.nl-btn:hover:not(:disabled){border-color:var(--soft);}
.nl-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--card);}
.nl-btn.danger{color:var(--low);}
.nl-btn.small{padding:4px 9px;font-size:12px;}
.nl-link{background:none;border:none;padding:0;color:var(--accent);font-weight:600;text-align:left;}
.nl-link:hover{text-decoration:underline;}

.nl-field{display:block;margin-bottom:10px;}
.nl-field > span{display:block;font-size:12px;font-weight:600;color:var(--soft);margin-bottom:4px;}
.nl input,.nl select,.nl textarea{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;}
.nl textarea{min-height:120px;resize:vertical;line-height:1.5;}
.nl-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 12px;}
.nl-tabs{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.nl .nl-tabs button{border:none;background:var(--card);padding:7px 12px;font-weight:600;font-size:13px;color:var(--soft);}
.nl .nl-tabs button.on{background:var(--accent-soft);color:var(--accent);}

.nl-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:600;background:var(--line2);color:var(--soft);white-space:nowrap;}
.nl-chip.l2{background:var(--l2-soft);color:var(--l2);} .nl-chip.l3{background:var(--l3-soft);color:var(--l3);}
.nl-chip.l4{background:var(--l4-soft);color:var(--l4);} .nl-chip.l5{background:var(--l5-soft);color:var(--l5);}
.nl-chip.good{background:var(--good-soft);color:var(--good);} .nl-chip.mid{background:var(--mid-soft);color:var(--mid);} .nl-chip.low{background:var(--low-soft);color:var(--low);}
.nl-chip.live{background:var(--accent-soft);color:var(--accent);}
.nl-dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block;}
.nl-dot.pulse{animation:nlpulse 1.2s ease-in-out infinite;}
@keyframes nlpulse{50%{opacity:.25;}}

.nl-tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;}
.nl-tile .k{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);}
.nl-tile .v{font-family:'Newsreader',serif;font-size:30px;line-height:1.1;margin-top:4px;font-variant-numeric:tabular-nums;}
.nl-tile .v small{font-family:'Inter',sans-serif;font-size:12px;color:var(--soft);margin-left:4px;font-weight:500;}
.nl-tile .n{font-size:12px;color:var(--soft);margin-top:4px;}
.nl-tile.good .v{color:var(--good);} .nl-tile.mid .v{color:var(--mid);} .nl-tile.low .v{color:var(--low);}

.nl-bars{display:grid;gap:7px;}
.nl-bar{display:grid;grid-template-columns:110px 1fr 22px;gap:8px;align-items:center;font-size:12.5px;}
.nl-bar .track{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;}
.nl-bar .track i{height:9px;border-radius:3px;background:var(--line2);}
.nl-bar .track i.on{background:var(--l5);}
.nl-bar .num{text-align:right;font-variant-numeric:tabular-nums;color:var(--soft);}

.nl-text{font-family:'Newsreader',Georgia,serif;font-size:17.5px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;}
.nl-text mark{background:none;color:inherit;border-radius:2px;cursor:pointer;padding:0 1px;}
.nl-text mark.l2{background:var(--l2-soft);box-shadow:inset 0 -2px 0 var(--l2);}
.nl-text mark.l3{background:var(--l3-soft);box-shadow:inset 0 -2px 0 var(--l3);}
.nl-text mark.l4{background:var(--l4-soft);box-shadow:inset 0 -2px 0 var(--l4);}
.nl-text mark.cl{background:none;box-shadow:inset 0 -1px 0 var(--faint);}
.nl-text mark.sel{outline:2px solid var(--ink);outline-offset:1px;}
.nl-text mark.multi{box-shadow:inset 0 -3px 0 var(--ink);}
.nl-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--soft);}
.nl-legend span{display:inline-flex;gap:5px;align-items:center;}
.nl-legend i{width:12px;height:12px;border-radius:3px;display:inline-block;}

.nl-finding{border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;background:var(--card);}
.nl-finding + .nl-finding{margin-top:8px;}
.nl-finding.sel{border-color:var(--ink);}
.nl-finding blockquote{margin:6px 0;padding:0 0 0 10px;border-left:3px solid var(--line);font-family:'Newsreader',serif;font-size:15.5px;}
.nl-finding.l2 blockquote{border-color:var(--l2);} .nl-finding.l3 blockquote{border-color:var(--l3);} .nl-finding.l4 blockquote{border-color:var(--l4);}
.nl-q{font-style:italic;color:var(--soft);margin-top:4px;}

.nl-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;}
@media (max-width:640px){.nl-compare{grid-template-columns:1fr;}}
.nl-compare > div{border-radius:8px;padding:8px 10px;background:var(--line2);font-family:'Newsreader',serif;font-size:15px;}
.nl-compare .lab{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);display:block;margin-bottom:3px;}

.nl-table{width:100%;border-collapse:collapse;font-size:13.5px;}
.nl-table th{text-align:left;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap;}
.nl-table td{padding:9px 8px;border-bottom:1px solid var(--line2);vertical-align:top;}
.nl-table tr.click{cursor:pointer;} .nl-table tr.click:hover td{background:var(--line2);}
.nl-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.nl-scroll{overflow-x:auto;}

.nl-progress{height:5px;border-radius:3px;background:var(--line2);overflow:hidden;margin-top:6px;}
.nl-progress i{display:block;height:100%;background:var(--accent);transition:width .4s;}

.nl-tree{font-size:13.5px;}
.nl-node{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line2);}
.nl-node .rail{display:flex;gap:0;}
.nl-node .rail i{width:18px;border-left:1px solid var(--line);height:22px;}
.nl-hops{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px;}
.nl-hop{border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-width:110px;background:var(--card);}
.nl-hop .h{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);}
.nl-hop .f{font-family:'Newsreader',serif;font-size:22px;}

.nl-lib dt{font-weight:600;margin-top:10px;}
.nl-lib dd{margin:2px 0 0;color:var(--soft);}
`;

export default CSS;
