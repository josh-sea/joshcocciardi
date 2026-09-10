// Scoped under `.sd` so the portfolio's global Semantic UI stylesheet can't
// restyle the inputs and buttons. Shares Draft Night's palette on purpose:
// same league, same season, same pair of eyes at 7am on a Sunday.
const css = `
.sd{
  --pitch:#0C1A13; --panel:#152720; --panel2:#1C332A; --line:#2A4739;
  --chalk:#ECE7DA; --muted:#8CA595; --signal:#F0A63C; --go:#7FC98A; --alert:#E2635A;
  background:var(--pitch); color:var(--chalk); min-height:100vh; padding-bottom:40px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:15px; line-height:1.45; -webkit-text-size-adjust:100%;
}
.sd *{box-sizing:border-box;}
.sd .wrap{max-width:720px;margin:0 auto;padding:0 12px;}
.sd header{padding:16px 0 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.sd h1{font-size:22px;margin:0;font-weight:800;letter-spacing:-.02em;}
.sd h3{font-size:15px;margin:0 0 6px;font-weight:700;}
.sd h4.sub{font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.06em;
  text-transform:uppercase;margin:18px 0 6px;}
.sd .muted{color:var(--muted);font-size:13px;margin:0;}
.sd .pad{padding:14px 2px;}
.sd .grow{flex:1;}
.sd code{background:var(--panel2);padding:1px 4px;border-radius:3px;font-size:12px;}

.sd nav{position:sticky;top:0;z-index:20;background:var(--pitch);border-bottom:1px solid var(--line);
  display:flex;overflow-x:auto;}
.sd nav button{flex:1 0 auto;background:none;border:none;border-bottom:2px solid transparent;
  color:var(--muted);font:inherit;font-size:13px;font-weight:600;padding:11px 12px;cursor:pointer;border-radius:0;}
.sd nav button[aria-selected="true"]{color:var(--chalk);border-bottom-color:var(--signal);}

.sd .card{background:var(--panel);border:1px solid var(--line);border-radius:11px;
  padding:14px;margin:12px 0;}
.sd .card.tight{padding:11px 13px;}
.sd .card.bad{border-color:var(--alert);}
.sd .btn{background:var(--signal);border:none;color:#161007;font:inherit;font-size:14px;
  font-weight:800;padding:10px 14px;border-radius:9px;cursor:pointer;margin-top:10px;}
.sd .btn.ghost{background:var(--panel2);color:var(--chalk);border:1px solid var(--line);}
.sd .btn.danger{background:#3A2320;color:#F0A9A2;border:1px solid #5A3330;}
.sd .btn:disabled{opacity:.45;cursor:default;}
.sd .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.sd .linkish{background:none;border:none;padding:0;color:var(--signal);font:inherit;
  font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:underline;}

.sd .field{display:block;margin-top:12px;}
.sd .flabel{display:block;font-size:10.5px;font-weight:800;color:var(--muted);
  letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px;}
.sd .input{width:100%;background:#20372C;border:1px solid var(--line);border-radius:8px;
  color:var(--chalk);font:inherit;font-size:16px;padding:9px 11px;}
.sd .input.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
  word-break:break-all;}
.sd .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:6px;}
.sd .grid3 .field{margin-top:6px;}
.sd .check{display:flex;gap:9px;align-items:flex-start;margin-top:14px;font-size:12.5px;
  color:#C9D6CD;line-height:1.5;}
.sd .check input{margin-top:3px;flex:0 0 auto;}
.sd .err{margin-top:10px;font-size:13px;color:var(--alert);}
.sd .ok{margin-top:10px;font-size:13px;color:var(--go);}

.sd .weekbar{display:flex;align-items:center;gap:9px;padding:10px 2px;border-bottom:1px solid var(--line);}
.sd .weekbar b{font-size:14px;}
.sd .wbtn{background:var(--panel2);border:1px solid var(--line);color:var(--chalk);font:inherit;
  font-size:12.5px;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer;}
.sd .wbtn:disabled{opacity:.5;}

.sd .score{display:flex;align-items:stretch;gap:10px;padding:14px 0;border-bottom:1px solid var(--line);}
.sd .score .side{flex:1;min-width:0;text-align:center;}
.sd .score .tname{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;}
.sd .score .tpts{font-size:30px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;}
.sd .score .tproj{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
.sd .score .vs{align-self:center;font-size:11px;color:var(--muted);font-weight:700;}

.sd .prow{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #1E362B;}
.sd .prow.bench{opacity:.62;}
.sd .prow.mine{background:#22190B;}
.sd .prow .slot{width:44px;flex:0 0 44px;font-size:10.5px;font-weight:800;color:var(--muted);
  letter-spacing:.04em;}
.sd .prow .pinfo{flex:1;min-width:0;}
.sd .prow .pname{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;}
.sd .prow .pmeta{font-size:11.5px;color:var(--muted);}
.sd .prow .inj{color:var(--alert);font-weight:700;font-size:11px;text-transform:uppercase;}
.sd .prow .pts{text-align:right;flex:0 0 auto;font-variant-numeric:tabular-nums;}
.sd .prow .actual{font-size:15px;font-weight:700;}
.sd .prow .proj{font-size:11px;color:var(--muted);}
.sd .up{color:var(--go);font-weight:700;} .sd .down{color:var(--alert);font-weight:700;}

.sd .chips{display:flex;flex-wrap:wrap;gap:5px;padding:10px 0 4px;}
.sd .chips button{background:var(--panel);border:1px solid var(--line);color:var(--muted);
  font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:999px;cursor:pointer;}
.sd .chips button[aria-pressed="true"]{background:var(--signal);border-color:var(--signal);color:#161007;}

.sd .howto h4{margin:0 0 6px;font-size:14px;}
.sd .howto ol{margin:10px 0 0;padding-left:20px;}
.sd .howto li{font-size:13px;color:#C9D6CD;margin-bottom:9px;line-height:1.5;}
.sd .howto .warn{margin-top:12px;padding:10px 11px;background:#2A1A17;border-left:3px solid var(--alert);
  border-radius:6px;font-size:12.5px;color:#F0C9C4;}
.sd footer{padding:24px 0 8px;font-size:11.5px;color:var(--muted);}
`;

export default css;
