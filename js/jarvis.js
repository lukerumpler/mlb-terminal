<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JARVIS — MLB Player Intelligence Dossier</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:ital,wght@0,300;0,400;0,600;0,700;0,900;1,400&family=Barlow:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --orange:#e8722a;--orange-dim:rgba(232,114,42,.14);
  --red:#e85a5a;--red-dim:rgba(232,90,90,.12);
  --green:#4dce8a;--green-dim:rgba(77,206,138,.12);
  --blue:#5ab4f5;--blue-dim:rgba(90,180,245,.12);
  --gold:#f5c842;--gold-dim:rgba(245,200,66,.12);
  --navy:#07102d;--navy-mid:#0d1c3a;
  --navy-border:#1a2e50;--text-dim:#8ca0b8;
  --panel-bg:rgba(6,14,42,.92);--panel-border:rgba(255,255,255,.07);
}
body{font-family:'Barlow',sans-serif;background:#020810;color:#fff;min-height:100vh;overflow-x:hidden;}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(232,114,42,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(232,114,42,.022) 1px,transparent 1px);background-size:32px 32px;pointer-events:none;z-index:0;}
body::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(232,114,42,.07),transparent);pointer-events:none;z-index:0;}

/* COMMAND BAR */
.cmd-bar{position:sticky;top:0;z-index:200;background:rgba(2,8,16,.97);border-bottom:1px solid var(--navy-border);backdrop-filter:blur(20px);padding:0 24px;display:flex;align-items:center;gap:14px;height:56px;flex-wrap:wrap;}
.jarvis-wordmark{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:4px;background:linear-gradient(135deg,#fff 30%,var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;flex-shrink:0;}
.cmd-divider{width:1px;height:28px;background:var(--navy-border);flex-shrink:0;}
.cmd-sub{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:var(--text-dim);flex-shrink:0;}
.cmd-search-wrap{flex:1;max-width:380px;position:relative;}
.cmd-search{width:100%;background:rgba(13,28,58,.7);border:1px solid var(--navy-border);border-radius:10px;color:#fff;padding:8px 14px 8px 36px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;letter-spacing:.5px;outline:none;transition:border-color .2s;}
.cmd-search:focus{border-color:var(--orange);}
.cmd-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-dim);font-size:13px;pointer-events:none;}
.cmd-sel{background:rgba(13,28,58,.7);border:1px solid var(--navy-border);border-radius:10px;color:#fff;padding:7px 30px 7px 12px;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:.5px;cursor:pointer;outline:none;min-width:220px;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238ca0b8'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;transition:border-color .2s;}
.cmd-sel:focus{border-color:var(--orange);}
.cmd-load{padding:8px 20px;border-radius:10px;background:linear-gradient(135deg,var(--orange),#c4561a);border:none;color:#fff;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;cursor:pointer;flex-shrink:0;transition:opacity .2s;white-space:nowrap;}
.cmd-load:hover{opacity:.85;}
.live-badge{display:flex;align-items:center;gap:6px;font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:var(--green);flex-shrink:0;margin-left:auto;}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.6s infinite;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}

/* SEARCH DROPDOWN */
.search-dd{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0d1c3a;border:1px solid var(--navy-border);border-radius:10px;z-index:300;max-height:260px;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.8);}
.sd-item{padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:10px;transition:background .12s;}
.sd-item:hover{background:rgba(232,114,42,.12);}
.sd-item:last-child{border-bottom:none;}
.sd-photo{width:32px;height:32px;border-radius:7px;object-fit:cover;background:rgba(13,28,58,.8);flex-shrink:0;}
.sd-name{font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;}
.sd-meta{font-size:10px;color:var(--text-dim);}
.sd-score{font-family:'Bebas Neue',sans-serif;font-size:18px;margin-left:auto;}

/* LAYOUT */
.wrap{position:relative;z-index:1;padding:16px 20px;max-width:1800px;margin:0 auto;}

/* PANEL */
.panel{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:18px;padding:20px 22px;backdrop-filter:blur(12px);}
.panel-title{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2.5px;color:var(--orange);margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--panel-border);display:flex;align-items:center;justify-content:space-between;}
.panel-badge{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);}
.sec{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;color:var(--orange);margin:14px 0 9px;display:flex;align-items:center;gap:7px;}
.sec::after{content:'';flex:1;height:1px;background:var(--panel-border);}
.sec:first-child{margin-top:0;}

/* GRIDS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;}

/* STAT CELL */
.sc{background:rgba(13,28,58,.6);border-radius:11px;padding:11px 13px;border:1px solid rgba(255,255,255,.06);text-align:center;}
.sc-lbl{font-family:'Barlow Condensed',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;margin-bottom:3px;}
.sc-val{font-family:'Bebas Neue',sans-serif;font-size:26px;line-height:1;}
.sc-sub{font-family:'Barlow Condensed',sans-serif;font-size:9px;color:var(--text-dim);margin-top:2px;}

/* DATA TABLE */
.dt{width:100%;border-collapse:collapse;font-size:12px;}
.dt th{padding:7px 9px;font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--navy-border);text-align:right;}
.dt th:first-child{text-align:left;}
.dt td{padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.03);font-family:'Barlow Condensed',sans-serif;font-size:12px;text-align:right;}
.dt td:first-child{text-align:left;font-weight:700;}
.dt tr:hover td{background:rgba(255,255,255,.025);}
.dt tr:last-child td{border-bottom:none;}
.ve{color:var(--red);font-weight:700;}
.va{color:var(--orange);}
.vg{color:var(--green);}
.vm{color:var(--gold);}
.vd{color:var(--text-dim);}

/* PERCENTILE BAR ROW */
.pct-row{display:grid;grid-template-columns:130px 34px 1fr 60px;align-items:center;gap:8px;margin-bottom:6px;}
.pct-lbl{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;color:var(--text-dim);}
.pct-bubble{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:13px;font-weight:700;flex-shrink:0;}
.pct-track{height:10px;background:rgba(255,255,255,.06);border-radius:5px;overflow:hidden;}
.pct-fill{height:100%;border-radius:5px;transition:width .8s cubic-bezier(.4,0,.2,1);}
.pct-raw{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;text-align:right;}
.be{background:rgba(232,90,90,.22);color:var(--red);}
.ba{background:rgba(232,114,42,.2);color:var(--orange);}
.bm{background:rgba(245,200,66,.18);color:var(--gold);}
.bl{background:rgba(90,180,245,.18);color:var(--blue);}
.bp{background:rgba(96,128,160,.15);color:var(--text-dim);}
.fe{background:var(--red);}
.fa{background:var(--orange);}
.fm{background:var(--gold);}
.fl{background:var(--blue);}
.fp{background:#3a5070;}

/* GRADE ROW */
.gr{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);}
.gr:last-child{border-bottom:none;}
.gr-tool{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;min-width:112px;flex-shrink:0;}
.gr-desc{font-size:10px;color:var(--text-dim);flex:1;min-width:0;}
.gr-track{width:140px;height:8px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;flex-shrink:0;}
.gr-fill{height:100%;border-radius:4px;transition:width .7s;}
.gr-box{min-width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:17px;flex-shrink:0;}
.gr-proj{font-family:'Barlow Condensed',sans-serif;font-size:10px;color:var(--text-dim);min-width:32px;flex-shrink:0;}
.g80{background:rgba(232,90,90,.2);color:var(--red);border:1px solid rgba(232,90,90,.35);}
.g70{background:rgba(232,114,42,.18);color:var(--orange);border:1px solid rgba(232,114,42,.3);}
.g60{background:rgba(245,200,66,.15);color:var(--gold);border:1px solid rgba(245,200,66,.28);}
.g55{background:rgba(77,206,138,.12);color:var(--green);border:1px solid rgba(77,206,138,.25);}
.g50{background:rgba(90,180,245,.12);color:var(--blue);border:1px solid rgba(90,180,245,.22);}
.g45{background:rgba(96,128,160,.1);color:var(--text-dim);border:1px solid rgba(96,128,160,.2);}

/* PITCH CARD */
.pitch-card{background:rgba(6,14,42,.9);border:1px solid var(--panel-border);border-radius:13px;overflow:hidden;margin-bottom:9px;}
.pitch-stripe{height:4px;}
.pitch-body{padding:13px 15px;}
.pitch-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.pitch-name{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2px;}
.pitch-usage{font-family:'Bebas Neue',sans-serif;font-size:26px;}
.pm-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px;}
.pm-cell{background:rgba(13,28,58,.7);border-radius:7px;padding:6px 5px;border:1px solid rgba(255,255,255,.05);text-align:center;}
.pm-lbl{font-family:'Barlow Condensed',sans-serif;font-size:8px;font-weight:700;letter-spacing:1px;color:var(--text-dim);margin-bottom:2px;}
.pm-val{font-family:'Bebas Neue',sans-serif;font-size:17px;line-height:1;}
.pm-delta{font-size:9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;margin-top:2px;}
.du{color:var(--green)}.dd{color:var(--red)}.df{color:var(--text-dim);}

/* RISK PILL */
.rp{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;}
.rl{background:var(--green-dim);color:var(--green);border:1px solid rgba(77,206,138,.25);}
.rm{background:var(--gold-dim);color:var(--gold);border:1px solid rgba(245,200,66,.22);}
.rh{background:var(--red-dim);color:var(--red);border:1px solid rgba(232,90,90,.22);}

/* FLAG CARD */
.fc{background:rgba(13,28,58,.5);border-radius:10px;padding:9px 13px;border:1px solid var(--panel-border);display:flex;align-items:flex-start;gap:9px;margin-bottom:7px;}
.fc:last-child{margin-bottom:0;}
.fc-icon{font-size:17px;flex-shrink:0;margin-top:1px;}
.fc-title{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;margin-bottom:2px;}
.fc-desc{font-size:10px;color:var(--text-dim);line-height:1.5;}

/* HERO */
.hero{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:20px;overflow:hidden;margin-bottom:13px;position:relative;}
.hero::after{content:'';position:absolute;top:0;right:0;width:320px;height:100%;background:radial-gradient(ellipse at right,rgba(232,114,42,.07),transparent 70%);pointer-events:none;}
.hero-body{padding:22px 26px;display:flex;gap:20px;align-items:flex-start;position:relative;z-index:1;}
.hero-photo{width:108px;height:108px;border-radius:17px;overflow:hidden;border:2px solid rgba(255,255,255,.13);flex-shrink:0;background:var(--navy-mid);position:relative;}
.hero-photo img{width:100%;height:100%;object-fit:cover;}
.hero-num{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1px;text-align:center;padding:3px;color:var(--orange);}
.hero-bio{flex:1;min-width:0;}
.hero-team-lbl{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:var(--orange);margin-bottom:3px;}
.hero-name{font-family:'Bebas Neue',sans-serif;font-size:50px;letter-spacing:3px;line-height:.95;margin-bottom:5px;background:linear-gradient(135deg,#fff 60%,rgba(255,255,255,.6));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.hero-attrs{display:flex;gap:14px;flex-wrap:wrap;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;color:var(--text-dim);letter-spacing:.5px;margin-bottom:11px;}
.hero-attrs .sep{color:var(--navy-border);}
.bio-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px;}
.bio-chip{background:rgba(13,28,58,.8);border:1px solid var(--panel-border);border-radius:8px;padding:5px 10px;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;}
.bio-chip-lbl{font-size:8px;color:var(--text-dim);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:1px;}
.bio-chip-val{color:#fff;font-size:12px;}
.contract-strip{background:rgba(232,114,42,.07);border:1px solid rgba(232,114,42,.17);border-radius:11px;padding:10px 15px;display:flex;gap:18px;flex-wrap:wrap;align-items:center;}
.ci-lbl{font-family:'Barlow Condensed',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--orange);text-transform:uppercase;margin-bottom:2px;}
.ci-val{font-family:'Bebas Neue',sans-serif;font-size:19px;line-height:1;}

/* JARVIS WIDGET */
.jarvis-widget{flex-shrink:0;min-width:156px;display:flex;flex-direction:column;align-items:center;gap:7px;background:rgba(3,8,20,.6);border:1px solid var(--panel-border);border-radius:16px;padding:15px 18px;}
.j-lbl{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:var(--text-dim);}
.j-ring{position:relative;width:100px;height:100px;}
.j-ring svg{transform:rotate(-90deg);}
.j-bg{fill:none;stroke:rgba(255,255,255,.06);stroke-width:9;}
.j-arc{fill:none;stroke-width:9;stroke-linecap:round;transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1);}
.j-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.j-num{font-family:'Bebas Neue',sans-serif;font-size:30px;line-height:1;}
.j-num-lbl{font-family:'Barlow Condensed',sans-serif;font-size:8px;font-weight:700;letter-spacing:1px;color:var(--text-dim);}
.j-letter{font-family:'Bebas Neue',sans-serif;font-size:42px;line-height:1;}
.verdict{padding:5px 13px;border-radius:8px;font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.5px;text-align:center;white-space:nowrap;}
.v-acquire{background:var(--green-dim);color:var(--green);border:1px solid rgba(77,206,138,.25);}
.v-monitor{background:var(--gold-dim);color:var(--gold);border:1px solid rgba(245,200,66,.22);}
.v-avoid{background:var(--red-dim);color:var(--red);border:1px solid rgba(232,90,90,.22);}
.v-hold{background:var(--blue-dim);color:var(--blue);border:1px solid rgba(90,180,245,.22);}
.j-comp-box{width:100%;background:rgba(13,28,58,.6);border-radius:8px;padding:7px;text-align:center;}
.j-comp-lbl{font-family:'Barlow Condensed',sans-serif;font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:2px;}
.j-comp-val{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;}

/* JARVIS DIMS */
.j-dims{background:rgba(3,8,20,.5);border-top:1px solid var(--panel-border);padding:13px 26px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;}
.dim-grp-title{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:var(--text-dim);margin-bottom:7px;text-transform:uppercase;}
.dim-row{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03);}
.dim-row:last-child{border-bottom:none;}
.dim-lbl{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;color:var(--text-dim);min-width:106px;flex-shrink:0;}
.dim-track{flex:1;height:7px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;}
.dim-fill{height:100%;border-radius:4px;transition:width .9s cubic-bezier(.4,0,.2,1);}
.dim-val{font-family:'Bebas Neue',sans-serif;font-size:15px;min-width:30px;text-align:right;}

/* JARVIS INSIGHTS */
.j-insights{border-top:1px solid var(--panel-border);padding:11px 26px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;}
.j-insight{background:rgba(13,28,58,.5);border-left:3px solid var(--orange);border-radius:0 8px 8px 0;padding:8px 11px;font-size:11px;line-height:1.6;color:rgba(255,255,255,.82);}
.j-insight.green{border-left-color:var(--green);}
.j-insight.blue{border-left-color:var(--blue);}

/* DOSSIER NAV */
.d-nav{display:flex;gap:2px;background:rgba(3,8,20,.8);padding:5px;border-radius:14px;margin-bottom:13px;border:1px solid var(--panel-border);overflow-x:auto;scrollbar-width:none;}
.d-nav::-webkit-scrollbar{display:none;}
.d-tab{padding:7px 16px;border-radius:9px;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;cursor:pointer;color:var(--text-dim);transition:all .15s;border:none;background:transparent;white-space:nowrap;flex-shrink:0;text-transform:uppercase;}
.d-tab.on{background:rgba(232,114,42,.16);color:var(--orange);box-shadow:0 0 16px rgba(232,114,42,.08);}
.d-tab:hover:not(.on){color:#fff;background:rgba(255,255,255,.05);}
.d-pane{display:none;}
.d-pane.on{display:block;}

/* CONTROL BAR (contract years) */
.ctrl-bar{display:flex;gap:3px;margin:8px 0;}
.ctrl-yr{flex:1;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:11px;}
.ctrl-pre{background:rgba(77,206,138,.18);color:var(--green);border:1px solid rgba(77,206,138,.28);}
.ctrl-arb{background:rgba(245,200,66,.14);color:var(--gold);border:1px solid rgba(245,200,66,.24);}
.ctrl-fa{background:rgba(232,90,90,.12);color:var(--red);border:1px solid rgba(232,90,90,.2);}

/* TRADE METER */
.trade-meter{height:12px;background:rgba(255,255,255,.05);border-radius:6px;position:relative;overflow:hidden;margin:8px 0;}
.trade-gradient{position:absolute;inset:0;background:linear-gradient(90deg,var(--red) 0%,var(--gold) 50%,var(--green) 100%);opacity:.7;}
.trade-marker{position:absolute;top:-3px;width:4px;height:18px;background:#fff;border-radius:2px;box-shadow:0 0 8px rgba(255,255,255,.4);transition:left .8s;}

/* SURPLUS BAR */
.surplus-bar{height:10px;background:rgba(255,255,255,.05);border-radius:5px;overflow:hidden;margin:5px 0;}
.surplus-pos{background:linear-gradient(90deg,var(--green),rgba(77,206,138,.4));height:100%;border-radius:5px;}
.surplus-neg{background:linear-gradient(90deg,rgba(232,90,90,.4),var(--red));height:100%;border-radius:5px;margin-left:auto;}

/* FANTASY */
.fant-rank{font-family:'Bebas Neue',sans-serif;font-size:64px;line-height:1;color:var(--gold);}
.tier-badge{display:inline-flex;align-items:center;justify-content:center;padding:3px 10px;border-radius:6px;font-family:'Bebas Neue',sans-serif;font-size:16px;}
.t1{background:var(--red-dim);color:var(--red);border:1px solid rgba(232,90,90,.3);}
.t2{background:rgba(245,164,66,.14);color:#f5a442;border:1px solid rgba(245,164,66,.28);}
.t3{background:var(--gold-dim);color:var(--gold);border:1px solid rgba(245,200,66,.25);}
.fant-cat-row{display:grid;grid-template-columns:58px 1fr 34px;gap:7px;align-items:center;margin-bottom:5px;}
.fant-cat-lbl{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;color:var(--text-dim);}
.fant-cat-track{height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;}
.fant-cat-fill{height:100%;border-radius:3px;}
.fant-cat-val{font-family:'Bebas Neue',sans-serif;font-size:14px;text-align:right;}

/* PROJ BARS */
.proj-wrap{display:flex;gap:4px;height:60px;align-items:flex-end;margin:8px 0;}
.proj-bar{border-radius:4px 4px 0 0;min-height:4px;transition:height .6s cubic-bezier(.4,0,.2,1);}
.proj-col{display:flex;flex-direction:column;align-items:center;flex:1;}
.proj-yr-lbl{font-family:'Barlow Condensed',sans-serif;font-size:9px;color:var(--text-dim);text-align:center;margin-top:3px;}

/* MOVEMENT CANVAS */
.canvas-box{border-radius:10px;background:rgba(13,28,58,.4);border:1px solid var(--panel-border);display:block;width:100%;}

/* SCROLLBAR */
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(232,114,42,.3);border-radius:3px;}

@media(max-width:1200px){.g3,.j-dims,.j-insights{grid-template-columns:1fr 1fr;}}
@media(max-width:900px){.g2,.g3,.g4,.j-dims,.j-insights{grid-template-columns:1fr;}.hero-name{font-size:36px;}.j-dims{padding:12px 16px;}}
</style>
</head>
<body>

<!-- COMMAND BAR -->
<div class="cmd-bar">
  <div class="jarvis-wordmark">JARVIS</div>
  <div class="cmd-divider"></div>
  <div class="cmd-sub">MLB PLAYER INTELLIGENCE DOSSIER</div>
  <div class="cmd-search-wrap">
    <span class="cmd-search-icon">🔍</span>
    <input class="cmd-search" id="cmd-search" type="text" placeholder="Search player, team, position..." oninput="handleSearch(this.value)" autocomplete="off">
    <div class="search-dd" id="search-dd"></div>
  </div>
  <select class="cmd-sel" id="player-sel">
    <option value="">— Select Player —</option>
  </select>
  <button class="cmd-load" onclick="loadSelectedPlayer()">⚡ LOAD DOSSIER</button>
  <div class="live-badge"><div class="live-dot"></div>MLB STATSAPI · 2026</div>
</div>

<div class="wrap">

<!-- ═══════════════════════════════════════════════
     HERO HEADER
═══════════════════════════════════════════════ -->
<div class="hero">
  <div class="hero-body">
    <!-- Photo -->
    <div class="hero-photo">
      <img id="hero-photo" src="https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/660271/headshot/67/current" alt="">
      <div class="hero-num" id="hero-num">#17</div>
    </div>

    <!-- Bio -->
    <div class="hero-bio">
      <div class="hero-team-lbl" id="hero-team">LOS ANGELES DODGERS · TWP · OUTFIELD / STARTING PITCHER</div>
      <div class="hero-name" id="hero-name">SHOHEI OHTANI</div>
      <div class="hero-attrs">
        <span>B/T: <strong>L/R</strong></span><span class="sep">|</span>
        <span>HT: <strong>6'4"</strong></span><span class="sep">|</span>
        <span>WT: <strong>210 lbs</strong></span><span class="sep">|</span>
        <span>AGE: <strong>31</strong></span><span class="sep">|</span>
        <span>DOB: <strong>07/05/1994</strong></span><span class="sep">|</span>
        <span>NAT: <strong>🇯🇵 JPN</strong></span>
      </div>
      <div class="bio-chips">
        <div class="bio-chip"><div class="bio-chip-lbl">Draft</div><div class="bio-chip-val">Int'l FA '13</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">MLB Debut</div><div class="bio-chip-val">4/1/2018</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">Service Time</div><div class="bio-chip-val">7.000</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">Agent</div><div class="bio-chip-val">Nez Balelo</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">Status</div><div class="bio-chip-val" style="color:var(--green)">✓ Active</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">Hometown</div><div class="bio-chip-val">Iwakudate, Japan</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">School</div><div class="bio-chip-val">Hanamaki Higashi HS</div></div>
        <div class="bio-chip"><div class="bio-chip-lbl">NPB</div><div class="bio-chip-val">Hokkaido Nippon-Ham</div></div>
      </div>
      <div class="contract-strip">
        <div><div class="ci-lbl">Contract</div><div class="ci-val">$700M / 10 YRS</div></div>
        <div><div class="ci-lbl">2026 AAV</div><div class="ci-val" style="color:var(--gold)">$46M</div></div>
        <div><div class="ci-lbl">Deferred</div><div class="ci-val" style="color:var(--text-dim)">$68M/yr</div></div>
        <div><div class="ci-lbl">Effective AAV</div><div class="ci-val" style="color:var(--orange)">$46M</div></div>
        <div><div class="ci-lbl">FA Eligible</div><div class="ci-val">2034</div></div>
        <div><div class="ci-lbl">Surplus Value</div><div class="ci-val" style="color:var(--green)">+$31.4M</div></div>
        <div><div class="ci-lbl">$/WAR</div><div class="ci-val">$8.6M</div></div>
        <div><div class="ci-lbl">Payroll Rank</div><div class="ci-val" style="color:var(--orange)">#1 MLB</div></div>
      </div>
    </div>

    <!-- JARVIS Score Widget -->
    <div class="jarvis-widget">
      <div class="j-lbl">JARVIS SCORE</div>
      <div class="j-ring">
        <svg viewBox="0 0 100 100" width="100" height="100">
          <circle class="j-bg" cx="50" cy="50" r="42"/>
          <circle class="j-arc" id="j-arc" cx="50" cy="50" r="42" stroke="var(--red)" stroke-dasharray="264" stroke-dashoffset="6"/>
        </svg>
        <div class="j-inner">
          <div class="j-num" id="j-score" style="color:var(--red)">98</div>
          <div class="j-num-lbl">JARVIS</div>
        </div>
      </div>
      <div class="j-letter" id="j-letter" style="color:var(--red)">A+</div>
      <div class="verdict v-acquire" id="j-verdict">PRIORITY ACQUISITION</div>
      <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;justify-content:center;">
        <span class="rp rl" id="j-risk">LOW RISK</span>
      </div>
      <div class="j-comp-box">
        <div class="j-comp-lbl">COMPARABLE</div>
        <div class="j-comp-val" id="j-comp">Unprecedented</div>
      </div>
    </div>
  </div>

  <!-- JARVIS DIMENSION BARS -->
  <div class="j-dims">
    <div>
      <div class="dim-grp-title">⚾ HITTING DIMENSIONS</div>
      <div class="dim-row"><div class="dim-lbl">Hit Tool</div><div class="dim-track"><div class="dim-fill fe" style="width:78%"></div></div><div class="dim-val" style="color:var(--orange)">78</div></div>
      <div class="dim-row"><div class="dim-lbl">Raw Power</div><div class="dim-track"><div class="dim-fill fe" style="width:100%"></div></div><div class="dim-val" style="color:var(--red)">100</div></div>
      <div class="dim-row"><div class="dim-lbl">Game Power</div><div class="dim-track"><div class="dim-fill fe" style="width:91%"></div></div><div class="dim-val" style="color:var(--red)">91</div></div>
      <div class="dim-row"><div class="dim-lbl">Plate Discipline</div><div class="dim-track"><div class="dim-fill fa" style="width:83%"></div></div><div class="dim-val" style="color:var(--orange)">83</div></div>
      <div class="dim-row"><div class="dim-lbl">Contact Quality</div><div class="dim-track"><div class="dim-fill fe" style="width:99%"></div></div><div class="dim-val" style="color:var(--red)">99</div></div>
      <div class="dim-row"><div class="dim-lbl">Speed / Run</div><div class="dim-track"><div class="dim-fill fm" style="width:68%"></div></div><div class="dim-val" style="color:var(--gold)">68</div></div>
      <div class="dim-row"><div class="dim-lbl">Swing Decision</div><div class="dim-track"><div class="dim-fill fa" style="width:81%"></div></div><div class="dim-val" style="color:var(--orange)">81</div></div>
    </div>
    <div>
      <div class="dim-grp-title">⚡ PITCHING DIMENSIONS</div>
      <div class="dim-row"><div class="dim-lbl">Stuff+</div><div class="dim-track"><div class="dim-fill fe" style="width:97%"></div></div><div class="dim-val" style="color:var(--red)">97</div></div>
      <div class="dim-row"><div class="dim-lbl">Command+</div><div class="dim-track"><div class="dim-fill fa" style="width:82%"></div></div><div class="dim-val" style="color:var(--orange)">82</div></div>
      <div class="dim-row"><div class="dim-lbl">Arsenal Score</div><div class="dim-track"><div class="dim-fill fe" style="width:95%"></div></div><div class="dim-val" style="color:var(--red)">95</div></div>
      <div class="dim-row"><div class="dim-lbl">Location+</div><div class="dim-track"><div class="dim-fill fa" style="width:79%"></div></div><div class="dim-val" style="color:var(--orange)">79</div></div>
      <div class="dim-row"><div class="dim-lbl">Whiff Generation</div><div class="dim-track"><div class="dim-fill fe" style="width:98%"></div></div><div class="dim-val" style="color:var(--red)">98</div></div>
      <div class="dim-row"><div class="dim-lbl">Durability</div><div class="dim-track"><div class="dim-fill fm" style="width:74%"></div></div><div class="dim-val" style="color:var(--gold)">74</div></div>
      <div class="dim-row"><div class="dim-lbl">Deception</div><div class="dim-track"><div class="dim-fill fe" style="width:92%"></div></div><div class="dim-val" style="color:var(--red)">92</div></div>
    </div>
    <div>
      <div class="dim-grp-title">📊 VALUE DIMENSIONS</div>
      <div class="dim-row"><div class="dim-lbl">WAR Projection</div><div class="dim-track"><div class="dim-fill fe" style="width:100%"></div></div><div class="dim-val" style="color:var(--red)">100</div></div>
      <div class="dim-row"><div class="dim-lbl">Contract Value</div><div class="dim-track"><div class="dim-fill fa" style="width:76%"></div></div><div class="dim-val" style="color:var(--orange)">76</div></div>
      <div class="dim-row"><div class="dim-lbl">Health History</div><div class="dim-track"><div class="dim-fill fm" style="width:71%"></div></div><div class="dim-val" style="color:var(--gold)">71</div></div>
      <div class="dim-row"><div class="dim-lbl">Age Curve</div><div class="dim-track"><div class="dim-fill fa" style="width:80%"></div></div><div class="dim-val" style="color:var(--orange)">80</div></div>
      <div class="dim-row"><div class="dim-lbl">Fantasy Value</div><div class="dim-track"><div class="dim-fill fe" style="width:100%"></div></div><div class="dim-val" style="color:var(--red)">100</div></div>
      <div class="dim-row"><div class="dim-lbl">Org. Fit</div><div class="dim-track"><div class="dim-fill fe" style="width:96%"></div></div><div class="dim-val" style="color:var(--red)">96</div></div>
      <div class="dim-row"><div class="dim-lbl">Trade Value</div><div class="dim-track"><div class="dim-fill fe" style="width:100%"></div></div><div class="dim-val" style="color:var(--red)">100</div></div>
    </div>
  </div>

  <!-- JARVIS INSIGHTS -->
  <div class="j-insights">
    <div class="j-insight"><strong>🔴 Elite contact quality</strong> — 99th percentile xwOBA (.436), 100th barrel rate (22.1%). Best hard-contact profile in Statcast era by any metric combination.</div>
    <div class="j-insight green"><strong>🟢 Surplus contract</strong> — +$31.4M surplus at $46M effective AAV. $8.6M/WAR vs $10.2M market. Deferred structure protects LAD CBT through 2034. Generational cost efficiency.</div>
    <div class="j-insight blue"><strong>🔵 Unprecedented two-way</strong> — Only active TWP projecting 7+ WAR simultaneously on both sides. Last comparable: Babe Ruth, 1918–1921. No modern statistical framework adequately captures his value.</div>
  </div>
</div>


<!-- ═══════════════════════════════════════════════
     PANE: OVERVIEW
═══════════════════════════════════════════════ -->
<div class="d-pane on" id="pane-overview">
  <div class="g3" style="margin-bottom:13px;">

    <!-- Season Stats -->
    <div class="panel">
      <div class="panel-title">2026 SEASON STATS <span class="panel-badge">LIVE · MLB API</span></div>
      <div class="g4" style="margin-bottom:13px;">
        <div class="sc"><div class="sc-lbl">WAR</div><div class="sc-val" style="color:var(--gold)">3.8</div><div class="sc-sub">Proj: 7.5</div></div>
        <div class="sc"><div class="sc-lbl">wRC+</div><div class="sc-val" style="color:var(--red)">178</div><div class="sc-sub">100=avg</div></div>
        <div class="sc"><div class="sc-lbl">xwOBA</div><div class="sc-val" style="color:var(--red)">.436</div><div class="sc-sub">99th pct</div></div>
        <div class="sc"><div class="sc-lbl">OPS</div><div class="sc-val" style="color:var(--red)">.952</div><div class="sc-sub">vs .748 avg</div></div>
      </div>
      <div class="sec">BATTING LINE</div>
      <table class="dt">
        <thead><tr><th>Split</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>HR</th><th>RBI</th></tr></thead>
        <tbody>
          <tr><td style="color:var(--orange)">2026</td><td>42</td><td>174</td><td class="va">.285</td><td class="va">.391</td><td class="ve">.667</td><td class="ve">.952</td><td class="ve">18</td><td>48</td></tr>
          <tr><td>vs RHP</td><td>34</td><td>142</td><td>.279</td><td>.382</td><td>.648</td><td>.930</td><td>14</td><td>37</td></tr>
          <tr><td>vs LHP</td><td>8</td><td>32</td><td class="ve">.310</td><td class="ve">.406</td><td class="ve">.724</td><td class="ve">1.130</td><td>4</td><td>11</td></tr>
          <tr><td>Home</td><td>21</td><td>86</td><td class="va">.298</td><td class="va">.395</td><td class="ve">.701</td><td class="ve">1.096</td><td>10</td><td>28</td></tr>
          <tr><td>Away</td><td>21</td><td>88</td><td>.271</td><td>.387</td><td>.631</td><td class="va">.908</td><td>8</td><td>20</td></tr>
          <tr><td>High Lev</td><td>18</td><td>44</td><td class="ve">.318</td><td class="ve">.432</td><td class="ve">.659</td><td class="ve">1.091</td><td>6</td><td>14</td></tr>
          <tr><td>RISP</td><td>—</td><td>38</td><td class="va">.306</td><td class="ve">.421</td><td class="ve">.611</td><td class="ve">1.032</td><td>5</td><td>21</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">ADVANCED SLASH</div>
      <div class="g4">
        <div class="sc"><div class="sc-lbl">ISO</div><div class="sc-val" style="color:var(--orange)">.308</div></div>
        <div class="sc"><div class="sc-lbl">BABIP</div><div class="sc-val" style="color:var(--gold)">.312</div></div>
        <div class="sc"><div class="sc-lbl">BB%</div><div class="sc-val" style="color:var(--green)">16.2%</div></div>
        <div class="sc"><div class="sc-lbl">K%</div><div class="sc-val" style="color:var(--gold)">22.8%</div></div>
        <div class="sc"><div class="sc-lbl">K-BB%</div><div class="sc-val" style="color:var(--gold)">6.6%</div></div>
        <div class="sc"><div class="sc-lbl">OPS+</div><div class="sc-val" style="color:var(--red)">184</div></div>
        <div class="sc"><div class="sc-lbl">wOBA</div><div class="sc-val" style="color:var(--red)">.421</div></div>
        <div class="sc"><div class="sc-lbl">wRAA</div><div class="sc-val" style="color:var(--green)">+24.1</div></div>
      </div>
    </div>

    <!-- Pitching -->
    <div class="panel">
      <div class="panel-title">2026 PITCHING STATS <span class="panel-badge">SP / TWP</span></div>
      <div class="g4" style="margin-bottom:13px;">
        <div class="sc"><div class="sc-lbl">ERA</div><div class="sc-val" style="color:var(--red)">2.14</div><div class="sc-sub">96th pct</div></div>
        <div class="sc"><div class="sc-lbl">FIP</div><div class="sc-val" style="color:var(--red)">2.08</div><div class="sc-sub">97th pct</div></div>
        <div class="sc"><div class="sc-lbl">Stuff+</div><div class="sc-val" style="color:var(--red)">147</div><div class="sc-sub">elite tier</div></div>
        <div class="sc"><div class="sc-lbl">K/9</div><div class="sc-val" style="color:var(--red)">13.2</div><div class="sc-sub">99th pct</div></div>
      </div>
      <div class="sec">PITCHING LINE</div>
      <table class="dt">
        <thead><tr><th>Stat</th><th>Val</th><th>Pct</th><th>Stat</th><th>Val</th><th>Pct</th></tr></thead>
        <tbody>
          <tr><td>IP</td><td>62.1</td><td class="vd">—</td><td>WHIP</td><td class="vg">0.94</td><td class="va">91</td></tr>
          <tr><td>ERA</td><td class="ve">2.14</td><td class="ve">96</td><td>xERA</td><td class="ve">2.02</td><td class="ve">97</td></tr>
          <tr><td>FIP</td><td class="ve">2.08</td><td class="ve">97</td><td>SIERA</td><td class="ve">2.18</td><td class="ve">96</td></tr>
          <tr><td>K%</td><td class="ve">35.4%</td><td class="ve">99</td><td>BB%</td><td class="va">7.8%</td><td class="va">78</td></tr>
          <tr><td>K-BB%</td><td class="ve">27.6%</td><td class="ve">98</td><td>CSW%</td><td class="ve">34.2%</td><td class="ve">97</td></tr>
          <tr><td>HR/9</td><td class="vg">0.72</td><td class="va">84</td><td>Chase%</td><td class="ve">34.8%</td><td class="ve">91</td></tr>
          <tr><td>GB%</td><td class="va">48.4%</td><td class="va">76</td><td>SwStr%</td><td class="ve">16.8%</td><td class="ve">94</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">MILESTONES</div>
      <div class="fc"><div class="fc-icon">🏆</div><div><div class="fc-title">2024 World Series Champion (LAD)</div><div class="fc-desc">First TWP to win WS since Babe Ruth era. Hit .310 with 8 HR in postseason.</div></div></div>
      <div class="fc"><div class="fc-icon">⭐</div><div><div class="fc-title">3× AL MVP: 2021, 2023, 2024</div><div class="fc-desc">Most MVPs by a Japanese-born player. Unanimous in 2023 and 2024.</div></div></div>
      <div class="fc"><div class="fc-icon">📊</div><div><div class="fc-title">50 HR / 200 K same season (2023)</div><div class="fc-desc">No player in MLB history had previously reached 40 HR and 100 K as a pitcher in same year.</div></div></div>
    </div>

    <!-- Radar + Projections -->
    <div class="panel">
      <div class="panel-title">TOOL RADAR & PROJECTIONS</div>
      <canvas id="radar-canvas" width="260" height="210" style="max-width:100%;display:block;margin:0 auto;"></canvas>
      <div class="sec" style="margin-top:13px;">PROJECTION SYSTEMS — 2026</div>
      <table class="dt">
        <thead><tr><th>System</th><th>bWAR</th><th>HR</th><th>AVG</th><th>ERA</th><th>K</th></tr></thead>
        <tbody>
          <tr><td>Steamer</td><td class="ve">7.2</td><td class="ve">40</td><td class="va">.280</td><td class="ve">2.28</td><td class="ve">185</td></tr>
          <tr><td>ZiPS</td><td class="ve">7.8</td><td class="ve">43</td><td class="va">.283</td><td class="ve">2.14</td><td class="ve">198</td></tr>
          <tr><td>PECOTA</td><td class="ve">6.9</td><td class="va">38</td><td class="va">.276</td><td class="va">2.41</td><td class="va">174</td></tr>
          <tr><td>ATC</td><td class="ve">7.1</td><td class="ve">39</td><td class="va">.279</td><td class="ve">2.31</td><td class="ve">181</td></tr>
          <tr><td style="color:var(--gold)">Consensus</td><td class="ve" style="color:var(--gold)">7.3</td><td class="ve" style="color:var(--gold)">40</td><td style="color:var(--gold)">.280</td><td class="ve" style="color:var(--gold)">2.28</td><td class="ve" style="color:var(--gold)">185</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">WAR TRAJECTORY (HISTORICAL + PROJ)</div>
      <div class="proj-wrap">
        <div class="proj-col"><div class="proj-bar" style="height:46px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2021<br><span style="color:var(--orange)">9.2</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:50px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2022<br><span style="color:var(--orange)">10.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:50px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2023<br><span style="color:var(--orange)">10.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:45px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2024<br><span style="color:var(--orange)">9.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:37px;width:100%;background:var(--gold);border:1px dashed var(--gold);"></div><div class="proj-yr-lbl" style="color:var(--gold)">2026*<br>7.3</div></div>
        <div class="proj-col"><div class="proj-bar" style="height:34px;width:100%;background:rgba(160,180,204,.3);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2027*<br><span style="color:var(--text-dim)">6.8</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:32px;width:100%;background:rgba(160,180,204,.2);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2028*<br><span style="color:var(--text-dim)">6.4</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:29px;width:100%;background:rgba(160,180,204,.15);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2029*<br><span style="color:var(--text-dim)">5.8</span></div></div>
      </div>
      <div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:4px;">* Projected. Bar height = WAR/10. Career WAR projection: 95+</div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════
     PANE: STATCAST
═══════════════════════════════════════════════ -->
<div class="d-pane" id="pane-statcast">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">STATCAST PERCENTILE RANKINGS <span class="panel-badge">2026 · MLB SAVANT</span></div>
      <div style="display:flex;gap:14px;font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;margin-bottom:11px;">
        <span style="color:var(--blue)">◀ POOR (1)</span>
        <span style="color:var(--text-dim)">AVG (50)</span>
        <span style="color:var(--red)">GREAT (99) ▶</span>
      </div>
      <div class="pct-row"><div class="pct-lbl">xwOBA</div><div class="pct-bubble be">99</div><div class="pct-track"><div class="pct-fill fe" style="width:99%"></div></div><div class="pct-raw ve">.436</div></div>
      <div class="pct-row"><div class="pct-lbl">xBA</div><div class="pct-bubble be">96</div><div class="pct-track"><div class="pct-fill fe" style="width:96%"></div></div><div class="pct-raw ve">.319</div></div>
      <div class="pct-row"><div class="pct-lbl">xSLG</div><div class="pct-bubble be">100</div><div class="pct-track"><div class="pct-fill fe" style="width:100%"></div></div><div class="pct-raw ve">.712</div></div>
      <div class="pct-row"><div class="pct-lbl">xISO</div><div class="pct-bubble be">99</div><div class="pct-track"><div class="pct-fill fe" style="width:99%"></div></div><div class="pct-raw ve">.391</div></div>
      <div class="pct-row"><div class="pct-lbl">Avg Exit Velocity</div><div class="pct-bubble be">98</div><div class="pct-track"><div class="pct-fill fe" style="width:98%"></div></div><div class="pct-raw ve">95.1 mph</div></div>
      <div class="pct-row"><div class="pct-lbl">Max Exit Velocity</div><div class="pct-bubble be">94</div><div class="pct-track"><div class="pct-fill fe" style="width:94%"></div></div><div class="pct-raw ve">118.4 mph</div></div>
      <div class="pct-row"><div class="pct-lbl">90th Pctile EV</div><div class="pct-bubble be">96</div><div class="pct-track"><div class="pct-fill fe" style="width:96%"></div></div><div class="pct-raw ve">108.2 mph</div></div>
      <div class="pct-row"><div class="pct-lbl">Barrel %</div><div class="pct-bubble be">100</div><div class="pct-track"><div class="pct-fill fe" style="width:100%"></div></div><div class="pct-raw ve">22.1%</div></div>
      <div class="pct-row"><div class="pct-lbl">Hard Hit %</div><div class="pct-bubble be">99</div><div class="pct-track"><div class="pct-fill fe" style="width:99%"></div></div><div class="pct-raw ve">58.4%</div></div>
      <div class="pct-row"><div class="pct-lbl">LA Sweet-Spot %</div><div class="pct-bubble ba">78</div><div class="pct-track"><div class="pct-fill fa" style="width:78%"></div></div><div class="pct-raw va">34.8%</div></div>
      <div class="pct-row"><div class="pct-lbl">Bat Speed</div><div class="pct-bubble be">94</div><div class="pct-track"><div class="pct-fill fe" style="width:94%"></div></div><div class="pct-raw ve">74.1 mph</div></div>
      <div class="pct-row"><div class="pct-lbl">Squared-Up %</div><div class="pct-bubble be">92</div><div class="pct-track"><div class="pct-fill fe" style="width:92%"></div></div><div class="pct-raw ve">28.4%</div></div>
      <div class="pct-row"><div class="pct-lbl">Blast Rate</div><div class="pct-bubble be">96</div><div class="pct-track"><div class="pct-fill fe" style="width:96%"></div></div><div class="pct-raw ve">18.2%</div></div>
      <div class="pct-row"><div class="pct-lbl">wOBAcon</div><div class="pct-bubble be">99</div><div class="pct-track"><div class="pct-fill fe" style="width:99%"></div></div><div class="pct-raw ve">.582</div></div>
      <div class="pct-row"><div class="pct-lbl">Whiff %</div><div class="pct-bubble bl">28</div><div class="pct-track"><div class="pct-fill fl" style="width:28%"></div></div><div class="pct-raw vd">24.1%</div></div>
      <div class="pct-row"><div class="pct-lbl">Chase %</div><div class="pct-bubble bm">71</div><div class="pct-track"><div class="pct-fill fm" style="width:71%"></div></div><div class="pct-raw vd">27.8%</div></div>
      <div class="pct-row"><div class="pct-lbl">Z-Contact %</div><div class="pct-bubble ba">82</div><div class="pct-track"><div class="pct-fill fa" style="width:82%"></div></div><div class="pct-raw va">84.2%</div></div>
      <div class="pct-row"><div class="pct-lbl">O-Swing %</div><div class="pct-bubble bm">66</div><div class="pct-track"><div class="pct-fill fm" style="width:66%"></div></div><div class="pct-raw vd">27.8%</div></div>
      <div class="pct-row"><div class="pct-lbl">Sprint Speed</div><div class="pct-bubble bm">72</div><div class="pct-track"><div class="pct-fill fm" style="width:72%"></div></div><div class="pct-raw vd">28.2 ft/s</div></div>
    </div>
    <div>
      <div class="panel" style="margin-bottom:13px;">
        <div class="panel-title">BATTED BALL PROFILE</div>
        <div class="g4" style="margin-bottom:12px;">
          <div class="sc"><div class="sc-lbl">GB%</div><div class="sc-val" style="color:var(--gold)">38.2%</div><div class="sc-sub">Avg: 44%</div></div>
          <div class="sc"><div class="sc-lbl">FB%</div><div class="sc-val" style="color:var(--red)">44.1%</div><div class="sc-sub">Avg: 36%</div></div>
          <div class="sc"><div class="sc-lbl">LD%</div><div class="sc-val" style="color:var(--green)">17.7%</div><div class="sc-sub">Avg: 20%</div></div>
          <div class="sc"><div class="sc-lbl">IFFB%</div><div class="sc-val" style="color:var(--green)">4.2%</div><div class="sc-sub">Avg: 9%</div></div>
          <div class="sc"><div class="sc-lbl">Pull%</div><div class="sc-val" style="color:var(--orange)">44.2%</div></div>
          <div class="sc"><div class="sc-lbl">Center%</div><div class="sc-val" style="color:var(--gold)">31.8%</div></div>
          <div class="sc"><div class="sc-lbl">Oppo%</div><div class="sc-val" style="color:var(--blue)">24.0%</div></div>
          <div class="sc"><div class="sc-lbl">HR/FB</div><div class="sc-val" style="color:var(--red)">26.4%</div></div>
          <div class="sc"><div class="sc-lbl">Pull Air%</div><div class="sc-val" style="color:var(--red)">21.8%</div></div>
          <div class="sc"><div class="sc-lbl">BIP AVG EV</div><div class="sc-val" style="color:var(--orange)">95.1</div></div>
          <div class="sc"><div class="sc-lbl">SLGcon</div><div class="sc-val" style="color:var(--red)">.782</div></div>
          <div class="sc"><div class="sc-lbl">xwOBAcon</div><div class="sc-val" style="color:var(--red)">.582</div></div>
        </div>
        <div class="sec">SPRAY CHART</div>
        <canvas id="spray-canvas" width="280" height="200" class="canvas-box"></canvas>
        <div style="display:flex;gap:12px;margin-top:5px;font-size:10px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;">
          <span style="color:var(--red)">● HR</span><span style="color:var(--blue)">● XBH</span><span style="color:var(--green)">● Hit</span><span>○ Out</span>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">PITCH TYPE PERFORMANCE</div>
        <table class="dt">
          <thead><tr><th>Pitch</th><th>PA</th><th>AVG</th><th>SLG</th><th>wOBA</th><th>Whiff%</th><th>Chase%</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--red)">Four-Seam</td><td>62</td><td class="ve">.344</td><td class="ve">.742</td><td class="ve">.512</td><td class="vg">18.2%</td><td>21.4%</td></tr>
            <tr><td style="color:var(--gold)">Sinker</td><td>28</td><td class="va">.302</td><td class="va">.581</td><td class="va">.448</td><td class="vg">14.1%</td><td>18.8%</td></tr>
            <tr><td style="color:var(--blue)">Slider</td><td>38</td><td>.241</td><td>.448</td><td>.341</td><td>28.6%</td><td>31.2%</td></tr>
            <tr><td style="color:var(--green)">Sweeper</td><td>22</td><td>.214</td><td>.381</td><td>.298</td><td class="va">34.8%</td><td class="va">38.4%</td></tr>
            <tr><td style="color:var(--orange)">Changeup</td><td>18</td><td>.268</td><td>.524</td><td>.382</td><td>22.1%</td><td>28.8%</td></tr>
            <tr><td style="color:var(--text-dim)">Curveball</td><td>12</td><td>.188</td><td>.313</td><td>.248</td><td class="va">36.4%</td><td class="va">42.1%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>


<!-- SPLITS -->
<div class="d-pane" id="pane-splits">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">BATTER SPLITS — 2026 <span class="panel-badge">MLB SAVANT</span></div>
      <table class="dt">
        <thead><tr><th>Split</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>HR</th><th>wRC+</th><th>wOBA</th></tr></thead>
        <tbody>
          <tr><td style="color:var(--orange)">Overall</td><td>174</td><td class="va">.285</td><td class="va">.391</td><td class="ve">.667</td><td class="ve">.952</td><td class="ve">18</td><td class="ve">178</td><td class="ve">.421</td></tr>
          <tr><td>vs RHP</td><td>142</td><td>.279</td><td>.382</td><td>.648</td><td>.930</td><td>14</td><td class="va">168</td><td class="va">.408</td></tr>
          <tr><td>vs LHP</td><td>32</td><td class="ve">.310</td><td class="ve">.406</td><td class="ve">.724</td><td class="ve">1.130</td><td>4</td><td class="ve">211</td><td class="ve">.462</td></tr>
          <tr><td>Home</td><td>86</td><td class="va">.298</td><td class="va">.395</td><td class="ve">.701</td><td class="ve">1.096</td><td>10</td><td class="ve">189</td><td class="ve">.438</td></tr>
          <tr><td>Away</td><td>88</td><td>.271</td><td>.387</td><td>.631</td><td class="va">.908</td><td>8</td><td class="va">162</td><td class="va">.404</td></tr>
          <tr><td>High Lev</td><td>44</td><td class="ve">.318</td><td class="ve">.432</td><td class="ve">.659</td><td class="ve">1.091</td><td>6</td><td class="ve">219</td><td class="ve">.458</td></tr>
          <tr><td>RISP</td><td>38</td><td class="va">.306</td><td class="ve">.421</td><td class="ve">.611</td><td class="ve">1.032</td><td>5</td><td class="ve">201</td><td class="ve">.444</td></tr>
          <tr><td>Bases Empty</td><td>92</td><td>.274</td><td>.382</td><td>.652</td><td class="va">.934</td><td>11</td><td class="va">170</td><td class="va">.408</td></tr>
          <tr><td>Runners On</td><td>82</td><td>.298</td><td class="va">.402</td><td class="va">.682</td><td class="ve">1.084</td><td>7</td><td class="ve">196</td><td class="ve">.438</td></tr>
          <tr><td>Day</td><td>58</td><td>.291</td><td>.387</td><td>.618</td><td class="va">.905</td><td>7</td><td class="va">172</td><td class="va">.416</td></tr>
          <tr><td>Night</td><td>116</td><td>.282</td><td>.394</td><td>.681</td><td class="ve">.975</td><td>11</td><td class="ve">181</td><td class="ve">.424</td></tr>
          <tr><td>1st PA</td><td>42</td><td class="ve">.324</td><td class="ve">.429</td><td class="ve">.730</td><td class="ve">1.159</td><td>5</td><td class="ve">226</td><td class="ve">.471</td></tr>
          <tr><td>2-Strike</td><td>72</td><td>.224</td><td>.348</td><td>.408</td><td>.756</td><td>6</td><td>128</td><td>.328</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">VELOCITY BAND PERFORMANCE</div>
      <table class="dt">
        <thead><tr><th>Velo Range</th><th>PA</th><th>AVG</th><th>SLG</th><th>wOBA</th><th>SwStr%</th></tr></thead>
        <tbody>
          <tr><td>&lt; 85 mph</td><td>22</td><td class="va">.308</td><td class="va">.577</td><td class="va">.411</td><td>14.2%</td></tr>
          <tr><td>85–90 mph</td><td>38</td><td>.284</td><td>.541</td><td>.388</td><td>18.4%</td></tr>
          <tr><td>90–94 mph</td><td>52</td><td class="va">.302</td><td class="ve">.660</td><td class="va">.428</td><td>19.8%</td></tr>
          <tr><td>94–98 mph</td><td>44</td><td class="ve">.318</td><td class="ve">.727</td><td class="ve">.468</td><td>22.4%</td></tr>
          <tr><td>98–100 mph</td><td>14</td><td class="va">.286</td><td class="ve">.714</td><td class="va">.448</td><td>26.8%</td></tr>
          <tr><td>100+ mph</td><td>4</td><td>.250</td><td>.500</td><td>.362</td><td>28.4%</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-title">MULTI-YEAR TREND</div>
      <table class="dt">
        <thead><tr><th>Year</th><th>WAR</th><th>wRC+</th><th>xwOBA</th><th>HR</th><th>ERA</th><th>K%</th><th>FIP</th></tr></thead>
        <tbody>
          <tr><td>2021</td><td class="ve">9.2</td><td class="ve">158</td><td class="ve">.382</td><td class="ve">46</td><td class="ve">3.18</td><td class="ve">33.2%</td><td class="ve">3.12</td></tr>
          <tr><td>2022</td><td class="ve">10.0</td><td class="ve">172</td><td class="ve">.411</td><td class="ve">34</td><td class="ve">2.33</td><td class="ve">34.9%</td><td class="ve">2.28</td></tr>
          <tr><td>2023</td><td class="ve">10.0</td><td class="ve">185</td><td class="ve">.435</td><td class="ve">44</td><td class="ve">3.14</td><td class="ve">35.8%</td><td class="ve">2.84</td></tr>
          <tr><td>2024</td><td class="ve">9.0</td><td class="ve">176</td><td class="ve">.421</td><td class="ve">38</td><td class="vd">— (TJ)</td><td class="ve">32.4%</td><td class="vd">—</td></tr>
          <tr><td style="color:var(--gold)">2026*</td><td class="ve" style="color:var(--gold)">3.8</td><td class="ve" style="color:var(--gold)">178</td><td class="ve" style="color:var(--gold)">.436</td><td style="color:var(--gold)">18</td><td class="ve" style="color:var(--gold)">2.14</td><td class="ve" style="color:var(--gold)">35.4%</td><td class="ve" style="color:var(--gold)">2.08</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">ZONE SPLIT PERFORMANCE</div>
      <table class="dt">
        <thead><tr><th>Zone</th><th>PA</th><th>AVG</th><th>SLG</th><th>Whiff%</th><th>Chase%</th></tr></thead>
        <tbody>
          <tr><td>In-Zone</td><td>98</td><td class="ve">.342</td><td class="ve">.718</td><td>12.4%</td><td>—</td></tr>
          <tr><td>Heart</td><td>52</td><td class="ve">.388</td><td class="ve">.884</td><td>8.1%</td><td>—</td></tr>
          <tr><td>Shadow</td><td>46</td><td>.282</td><td>.564</td><td>18.2%</td><td class="va">38.4%</td></tr>
          <tr><td>Out-of-Zone</td><td>76</td><td>.182</td><td>.318</td><td class="va">34.8%</td><td class="va">27.8%</td></tr>
          <tr><td>Chase OOZ</td><td>21</td><td>.143</td><td>.238</td><td class="ve">48.4%</td><td>—</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">COUNT SPLITS</div>
      <table class="dt">
        <thead><tr><th>Count</th><th>PA</th><th>AVG</th><th>SLG</th><th>BB%</th><th>K%</th></tr></thead>
        <tbody>
          <tr><td>0-0</td><td>42</td><td class="ve">.381</td><td class="ve">.810</td><td>—</td><td>4.8%</td></tr>
          <tr><td>Ahead (0-1, 0-2)</td><td>28</td><td>.214</td><td>.357</td><td>—</td><td class="va">32.1%</td></tr>
          <tr><td>Behind (1-0, 2-0)</td><td>34</td><td class="ve">.324</td><td class="ve">.765</td><td class="ve">26.5%</td><td>8.8%</td></tr>
          <tr><td>Full (3-2)</td><td>22</td><td>.273</td><td>.545</td><td class="va">31.8%</td><td>18.2%</td></tr>
          <tr><td>2-Strike</td><td>72</td><td>.224</td><td>.408</td><td>—</td><td>28.4%</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- SCOUTING -->
<div class="d-pane" id="pane-scouting">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">HITTING TOOLS — 20-80 SCALE <span class="panel-badge">CURRENT / (FUTURE)</span></div>
      <div class="gr"><div class="gr-tool">Hit Tool</div><div class="gr-desc">Advanced barrel accuracy; elite swing path to all fields</div><div class="gr-track"><div class="gr-fill fa" style="width:75%;"></div></div><div class="gr-box g60">60</div><div class="gr-proj">(65)</div></div>
      <div class="gr"><div class="gr-tool">Raw Power</div><div class="gr-desc">Legitimate 80 raw — strongest pull power in MLB</div><div class="gr-track"><div class="gr-fill fe" style="width:100%;"></div></div><div class="gr-box g80">80</div><div class="gr-proj">(80)</div></div>
      <div class="gr"><div class="gr-tool">Game Power</div><div class="gr-desc">Translates elite raw into in-game production consistently</div><div class="gr-track"><div class="gr-fill fe" style="width:87%;"></div></div><div class="gr-box g80" style="font-size:15px;">70+</div><div class="gr-proj">(70)</div></div>
      <div class="gr"><div class="gr-tool">Speed</div><div class="gr-desc">Above avg for size; smart baserunner with elite reads</div><div class="gr-track"><div class="gr-fill fl" style="width:62%;"></div></div><div class="gr-box g50">50</div><div class="gr-proj">(45)</div></div>
      <div class="gr"><div class="gr-tool">Baserunning</div><div class="gr-desc">Efficient, low SB attempts, excellent instincts</div><div class="gr-track"><div class="gr-fill fl" style="width:62%;"></div></div><div class="gr-box g50">50</div><div class="gr-proj">(50)</div></div>
      <div class="gr"><div class="gr-tool">Fielding</div><div class="gr-desc">Solid RF, above-avg routes, reliable glove</div><div class="gr-track"><div class="gr-fill fl" style="width:62%;"></div></div><div class="gr-box g50">50</div><div class="gr-proj">(45)</div></div>
      <div class="gr"><div class="gr-tool">Arm</div><div class="gr-desc">Plus arm from RF, above-avg accuracy</div><div class="gr-track"><div class="gr-fill fa" style="width:75%;"></div></div><div class="gr-box g60">60</div><div class="gr-proj">(60)</div></div>
      <div class="gr"><div class="gr-tool">Plate Discipline</div><div class="gr-desc">Above-avg BB%, low chase, elite 2-strike approach</div><div class="gr-track"><div class="gr-fill fa" style="width:75%;"></div></div><div class="gr-box g60">60</div><div class="gr-proj">(65)</div></div>
      <div class="gr"><div class="gr-tool">Overall FV (Hit)</div><div class="gr-desc">Elite two-way; unprecedented offensive profile</div><div class="gr-track"><div class="gr-fill fe" style="width:100%;"></div></div><div class="gr-box g80">80</div><div class="gr-proj">(80)</div></div>
      <div class="sec" style="margin-top:14px;">SCOUT REPORT</div>
      <div style="background:rgba(13,28,58,.5);border-radius:10px;padding:12px 14px;border:1px solid var(--panel-border);font-size:11px;line-height:1.75;color:rgba(255,255,255,.85);">
        Generational two-way talent. Elite raw power with premium bat speed produces elite hard contact profiles from both sides of the plate. Swing mechanics optimize for launch angle and pull-side power without sacrificing zone coverage. Has shortened swing in 2026 post-TJ — bat speed actually increased. As a pitcher, fastball touched 101 with 18.4" IVB — top-3 pitch quality in MLB. One-of-a-kind player profile. No modern scouting framework adequately captures his value on a single card.
      </div>
    </div>
    <div>
      <div class="panel" style="margin-bottom:13px;">
        <div class="panel-title">PITCHING TOOLS — 20-80 SCALE</div>
        <div class="gr"><div class="gr-tool">Fastball</div><div class="gr-desc">99+ mph, 18.4" IVB — elite ride, top-3 MLB pitch quality</div><div class="gr-track"><div class="gr-fill fe" style="width:87%;"></div></div><div class="gr-box g80" style="font-size:15px;">70+</div><div class="gr-proj">(70)</div></div>
        <div class="gr"><div class="gr-tool">Sweeper</div><div class="gr-desc">80-grade putaway; 3041 rpm, -18.2" HB, 48% whiff</div><div class="gr-track"><div class="gr-fill fe" style="width:100%;"></div></div><div class="gr-box g80">80</div><div class="gr-proj">(80)</div></div>
        <div class="gr"><div class="gr-tool">Splitter</div><div class="gr-desc">Elite GB splitter, 62% GB rate, plus deception</div><div class="gr-track"><div class="gr-fill fe" style="width:87%;"></div></div><div class="gr-box g80" style="font-size:15px;">70</div><div class="gr-proj">(70)</div></div>
        <div class="gr"><div class="gr-tool">Command</div><div class="gr-desc">7.8 BB/9; above-avg zone command improving post-TJ</div><div class="gr-track"><div class="gr-fill fa" style="width:75%;"></div></div><div class="gr-box g60">60</div><div class="gr-proj">(60)</div></div>
        <div class="gr"><div class="gr-tool">Deception</div><div class="gr-desc">Elite arm action, 34° angle, high tunnel quality</div><div class="gr-track"><div class="gr-fill fe" style="width:87%;"></div></div><div class="gr-box g80" style="font-size:15px;">70</div><div class="gr-proj">(70)</div></div>
        <div class="gr"><div class="gr-tool">Competitiveness</div><div class="gr-desc">Elite makeup; trains harder than any player in LAD system</div><div class="gr-track"><div class="gr-fill fe" style="width:100%;"></div></div><div class="gr-box g80">80</div><div class="gr-proj">(80)</div></div>
        <div class="gr"><div class="gr-tool">Overall FV (Pitch)</div><div class="gr-desc">Would be #1 SP in MLB if not two-way</div><div class="gr-track"><div class="gr-fill fe" style="width:100%;"></div></div><div class="gr-box g80">80</div><div class="gr-proj">(80)</div></div>
      </div>
      <div class="panel">
        <div class="panel-title">RISK ASSESSMENT</div>
        <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">🟢</div><div><div class="fc-title">Injury Risk — <span class="rp rl" style="font-size:9px;padding:2px 8px;">LOW</span></div><div class="fc-desc">Durable across 7 MLB seasons. UCL healthy post-TJ (2024). Strong physical conditioning. LAD limiting to 120 IP target.</div></div></div>
        <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">🟢</div><div><div class="fc-title">Regression Risk — <span class="rp rl" style="font-size:9px;padding:2px 8px;">VERY LOW</span></div><div class="fc-desc">xwOBA .436 vs actual .421 — underlying skills exceed results. No luck-based positive regression risk.</div></div></div>
        <div class="fc" style="border-color:rgba(245,200,66,.15);"><div class="fc-icon">🟡</div><div><div class="fc-title">Workload Risk — <span class="rp rm" style="font-size:9px;padding:2px 8px;">MODERATE</span></div><div class="fc-desc">Two-way workload unprecedented. LAD managing carefully — 5+ rest between starts. Long-term sustainability unproven beyond age 33.</div></div></div>
        <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">🟢</div><div><div class="fc-title">Fantasy Risk — <span class="rp rl" style="font-size:9px;padding:2px 8px;">LOW</span></div><div class="fc-desc">Generational floor. Even at 80% health, projects for top-5 fantasy value in all formats.</div></div></div>
      </div>
    </div>
  </div>
</div>

<!-- ARSENAL -->
<div class="d-pane" id="pane-arsenal">
  <div class="g2" style="margin-bottom:13px;">
    <div>
      <div class="pitch-card">
        <div class="pitch-stripe" style="background:var(--red);"></div>
        <div class="pitch-body">
          <div class="pitch-hdr"><div><div class="pitch-name" style="color:var(--red);">FOUR-SEAM FASTBALL</div><div style="font-size:10px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:2px;">Primary · 38% usage · vs LHH dominant</div></div><div class="pitch-usage" style="color:var(--red);">38%</div></div>
          <div class="pm-grid">
            <div class="pm-cell"><div class="pm-lbl">VELO</div><div class="pm-val" style="color:var(--red);">99.2</div><div class="pm-delta du">▲ +1.1</div></div>
            <div class="pm-cell"><div class="pm-lbl">SPIN</div><div class="pm-val" style="color:var(--orange);">2312</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">IVB</div><div class="pm-val" style="color:var(--red);">18.4"</div><div class="pm-delta du">▲ +0.8</div></div>
            <div class="pm-cell"><div class="pm-lbl">HB</div><div class="pm-val" style="color:var(--gold);">5.1"</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">WHIFF%</div><div class="pm-val" style="color:var(--orange);">28.4%</div><div class="pm-delta du">▲ +2.1</div></div>
          </div>
          <table class="dt"><thead><tr><th>Split</th><th>Stuff+</th><th>Loc+</th><th>Pitch+</th><th>xBA</th><th>Whiff%</th><th>CSW%</th><th>xRV/100</th></tr></thead><tbody>
            <tr><td>vs LHH</td><td class="ve">152</td><td class="va">118</td><td class="ve">142</td><td class="vg">.221</td><td class="ve">34.2%</td><td class="ve">38.8%</td><td class="vg">-2.4</td></tr>
            <tr><td>vs RHH</td><td class="va">141</td><td class="va">112</td><td class="va">138</td><td class="vg">.238</td><td class="va">24.8%</td><td class="va">32.4%</td><td class="vg">-1.8</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="pitch-card">
        <div class="pitch-stripe" style="background:var(--gold);"></div>
        <div class="pitch-body">
          <div class="pitch-hdr"><div><div class="pitch-name" style="color:var(--gold);">SWEEPER</div><div style="font-size:10px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:2px;">80-grade putaway · Elite shape vs both sides</div></div><div class="pitch-usage" style="color:var(--gold);">31%</div></div>
          <div class="pm-grid">
            <div class="pm-cell"><div class="pm-lbl">VELO</div><div class="pm-val" style="color:var(--gold);">83.8</div><div class="pm-delta dd">▼ -0.4</div></div>
            <div class="pm-cell"><div class="pm-lbl">SPIN</div><div class="pm-val" style="color:var(--red);">3041</div><div class="pm-delta du">▲ +88</div></div>
            <div class="pm-cell"><div class="pm-lbl">HB</div><div class="pm-val" style="color:var(--red);">-18.2"</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">IVB</div><div class="pm-val" style="color:var(--orange);">-0.8"</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">WHIFF%</div><div class="pm-val" style="color:var(--red);">48.1%</div><div class="pm-delta du">▲ +4.2</div></div>
          </div>
          <table class="dt"><thead><tr><th>Split</th><th>Stuff+</th><th>Loc+</th><th>Pitch+</th><th>xBA</th><th>Whiff%</th><th>GB%</th><th>xRV/100</th></tr></thead><tbody>
            <tr><td>vs LHH</td><td class="ve">168</td><td class="va">124</td><td class="ve">158</td><td class="vg">.188</td><td class="ve">52.4%</td><td>38.4%</td><td class="vg">-3.8</td></tr>
            <tr><td>vs RHH</td><td class="ve">162</td><td class="va">118</td><td class="ve">151</td><td class="vg">.198</td><td class="ve">44.8%</td><td>42.8%</td><td class="vg">-3.1</td></tr>
          </tbody></table>
        </div>
      </div>
      <div class="pitch-card">
        <div class="pitch-stripe" style="background:var(--blue);"></div>
        <div class="pitch-body">
          <div class="pitch-hdr"><div><div class="pitch-name" style="color:var(--blue);">SPLITTER (FS)</div><div style="font-size:10px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:2px;">Groundball inducer · two-strike weapon · 62% GB rate</div></div><div class="pitch-usage" style="color:var(--blue);">31%</div></div>
          <div class="pm-grid">
            <div class="pm-cell"><div class="pm-lbl">VELO</div><div class="pm-val" style="color:var(--blue);">88.4</div><div class="pm-delta du">▲ +0.6</div></div>
            <div class="pm-cell"><div class="pm-lbl">SPIN</div><div class="pm-val">1482</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">DROP</div><div class="pm-val" style="color:var(--red);">-4.8"</div><div class="pm-delta df">—</div></div>
            <div class="pm-cell"><div class="pm-lbl">GB%</div><div class="pm-val" style="color:var(--red);">62.4%</div><div class="pm-delta du">▲ +3.1</div></div>
            <div class="pm-cell"><div class="pm-lbl">WHIFF%</div><div class="pm-val" style="color:var(--orange);">38.8%</div><div class="pm-delta du">▲ +1.8</div></div>
          </div>
          <table class="dt"><thead><tr><th>Split</th><th>Stuff+</th><th>xBA</th><th>Whiff%</th><th>GB%</th><th>xRV/100</th></tr></thead><tbody>
            <tr><td>vs LHH</td><td class="va">134</td><td class="vg">.214</td><td class="va">38.4%</td><td class="ve">64.8%</td><td class="vg">-2.1</td></tr>
            <tr><td>vs RHH</td><td class="va">128</td><td class="vg">.228</td><td class="va">39.2%</td><td class="ve">60.2%</td><td class="vg">-1.6</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>
    <div>
      <div class="panel" style="margin-bottom:13px;">
        <div class="panel-title">ARSENAL SUMMARY TABLE</div>
        <table class="dt">
          <thead><tr><th>Pitch</th><th>%</th><th>Velo</th><th>Stuff+</th><th>Loc+</th><th>Pitch+</th><th>xRV/100</th><th>Whiff%</th><th>GB%</th><th>CSW%</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--red);">FF</td><td>38%</td><td>99.2</td><td class="ve">147</td><td class="va">115</td><td class="ve">140</td><td class="vg">-2.1</td><td>28.4%</td><td>38.2%</td><td class="ve">35.6%</td></tr>
            <tr><td style="color:var(--gold);">ST</td><td>31%</td><td>83.8</td><td class="ve">168</td><td class="va">121</td><td class="ve">158</td><td class="vg">-3.4</td><td class="ve">48.1%</td><td>40.4%</td><td class="ve">42.8%</td></tr>
            <tr><td style="color:var(--blue);">FS</td><td>31%</td><td>88.4</td><td class="va">134</td><td class="va">108</td><td class="va">128</td><td class="vg">-1.8</td><td class="va">38.8%</td><td class="ve">62.4%</td><td class="va">34.4%</td></tr>
          </tbody>
        </table>
        <div class="sec" style="margin-top:13px;">PITCH MOVEMENT PROFILE</div>
        <canvas id="movement-canvas" width="320" height="240" class="canvas-box"></canvas>
        <div style="display:flex;gap:12px;margin-top:5px;font-size:10px;font-family:'Barlow Condensed',sans-serif;">
          <span style="color:var(--red);">● FF (4-Seam)</span><span style="color:var(--gold);">● ST (Sweeper)</span><span style="color:var(--blue);">● FS (Splitter)</span>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">PITCH DESIGN INTELLIGENCE</div>
        <div class="fc" style="border-color:rgba(232,90,90,.2);"><div class="fc-icon">⚡</div><div><div class="fc-title">Sweeper — 80-Grade Shape, Top-3 MLB</div><div class="fc-desc">3041 rpm with -18.2" HB. League-leading shape vs same-side hitters. Creates 52%+ whiff rate on chase pitches down-and-away to LHH. Added mid-2023 via LAD pitch design lab — now signature pitch.</div></div></div>
        <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">🔬</div><div><div class="fc-title">FF + FS Tunnel Quality — Elite</div><div class="fc-desc">Release point consistency: 5.42ft vRel / 1.38ft hRel. FF and FS share first 22ft of flight before diverging 5.8" vertically at plate. Batters average 0.84s reaction — below MLB average of 0.88s.</div></div></div>
        <div class="fc" style="border-color:rgba(90,180,245,.15);"><div class="fc-icon">📐</div><div><div class="fc-title">Arm Angle: 34° — Natural Deception</div><div class="fc-desc">Below-average arm angle creates unique approach on FF, generating elite perceived rise vs same-release splitter drop. Creates maximum differential in perceived trajectory at decision point.</div></div></div>
        <div class="fc" style="border-color:rgba(245,200,66,.15);"><div class="fc-icon">🎯</div><div><div class="fc-title">Count-Based Sequencing</div><div class="fc-desc">0-0: 58% FF to establish. Hitter's counts: 71% FS/ST mix. 2-strike: 52% ST (48% whiff rate in leverage). Optimal sequencing validated by LAD R&D tracking models.</div></div></div>
      </div>
    </div>
  </div>
</div>

<!-- GAME LOGS -->
<div class="d-pane" id="pane-gamelogs">
  <div class="panel">
    <div class="panel-title">2026 GAME LOG — BATTING <span class="panel-badge">LAST 20 GAMES</span></div>
    <div style="overflow-x:auto;">
      <table class="dt" style="min-width:860px;">
        <thead><tr><th>Date</th><th>Opp</th><th>Result</th><th>AB</th><th>H</th><th>2B</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>AVG</th><th>OPS</th><th>wOBA</th><th>EV</th><th>Barrel</th><th>Note</th></tr></thead>
        <tbody>
          <tr><td>5/20</td><td>HOU</td><td class="vg">W 5-2</td><td>4</td><td class="va">2</td><td>1</td><td class="ve">1</td><td class="va">3</td><td>1</td><td>1</td><td class="va">.250</td><td class="ve">1.048</td><td class="ve">.512</td><td class="ve">108.4</td><td class="vg">Y</td><td style="color:var(--red);">🔥 HR</td></tr>
          <tr><td>5/19</td><td>HOU</td><td class="vg">W 4-1</td><td>3</td><td class="va">1</td><td>0</td><td>0</td><td>0</td><td>2</td><td>0</td><td>.333</td><td class="va">.889</td><td class="va">.368</td><td>94.2</td><td class="vd">N</td><td class="vd">—</td></tr>
          <tr><td>5/18</td><td>SD</td><td class="vd" style="color:var(--red);">L 2-5</td><td>4</td><td class="ve">3</td><td>1</td><td class="ve">1</td><td class="va">2</td><td>0</td><td>2</td><td class="ve">.750</td><td class="ve">1.500</td><td class="ve">.582</td><td class="ve">114.2</td><td class="vg">Y</td><td style="color:var(--orange);">Barrel x2</td></tr>
          <tr><td>5/17</td><td>SD</td><td class="vg">W 6-3</td><td>4</td><td>1</td><td>0</td><td>0</td><td>1</td><td>1</td><td>1</td><td>.250</td><td>.762</td><td>.334</td><td>88.4</td><td class="vd">N</td><td class="vd">—</td></tr>
          <tr><td>5/16</td><td>ARI</td><td class="vg">W 8-2</td><td>3</td><td class="va">2</td><td>0</td><td class="ve">2</td><td class="ve">4</td><td>2</td><td>1</td><td class="ve">.667</td><td class="ve">2.108</td><td class="ve">.698</td><td class="ve">118.1</td><td class="vg">Y</td><td style="color:var(--red);">2-HR game</td></tr>
          <tr><td>5/15</td><td>ARI</td><td class="vd" style="color:var(--red);">L 1-4</td><td>4</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td class="vd">2</td><td>.000</td><td>.250</td><td>.214</td><td>78.2</td><td class="vd">N</td><td class="vd">Cold</td></tr>
          <tr><td>5/13</td><td>COL</td><td class="vg">W 7-1</td><td>4</td><td class="va">2</td><td>1</td><td class="ve">1</td><td class="va">3</td><td>1</td><td>0</td><td class="va">.500</td><td class="ve">1.281</td><td class="ve">.528</td><td class="ve">112.4</td><td class="vg">Y</td><td style="color:var(--red);">🔥 HR</td></tr>
          <tr><td>5/12</td><td>COL</td><td class="vg">W 9-3</td><td>4</td><td class="ve">3</td><td>2</td><td class="ve">1</td><td class="va">2</td><td>0</td><td>1</td><td class="ve">.750</td><td class="ve">1.750</td><td class="ve">.642</td><td class="ve">116.8</td><td class="vg">Y</td><td style="color:var(--orange);">Barrel x2</td></tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(6,1fr);gap:9px;">
      <div class="sc"><div class="sc-lbl">L10 AVG</div><div class="sc-val" style="color:var(--orange);">.312</div></div>
      <div class="sc"><div class="sc-lbl">L10 HR</div><div class="sc-val" style="color:var(--red);">6</div></div>
      <div class="sc"><div class="sc-lbl">L10 RBI</div><div class="sc-val" style="color:var(--orange);">14</div></div>
      <div class="sc"><div class="sc-lbl">L10 OPS</div><div class="sc-val" style="color:var(--red);">1.048</div></div>
      <div class="sc"><div class="sc-lbl">Hit Streak</div><div class="sc-val" style="color:var(--green);">H-8</div></div>
      <div class="sc"><div class="sc-lbl">Status</div><div class="sc-val" style="color:var(--red);font-size:18px;">🔥 HOT</div></div>
    </div>
  </div>
</div>

<!-- PROJECTIONS -->
<div class="d-pane" id="pane-projections">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">MULTI-SYSTEM PROJECTIONS — 2026 FULL SEASON</div>
      <table class="dt">
        <thead><tr><th>System</th><th>G</th><th>PA</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>WAR</th></tr></thead>
        <tbody>
          <tr><td>Steamer</td><td>142</td><td>582</td><td class="ve">40</td><td class="ve">112</td><td class="va">94</td><td>12</td><td class="va">.280</td><td class="ve">.381</td><td class="ve">.584</td><td class="ve">.965</td><td class="ve">7.2</td></tr>
          <tr><td>ZiPS</td><td>148</td><td>606</td><td class="ve">43</td><td class="ve">118</td><td class="va">98</td><td>14</td><td class="va">.283</td><td class="ve">.388</td><td class="ve">.601</td><td class="ve">.989</td><td class="ve">7.8</td></tr>
          <tr><td>PECOTA</td><td>138</td><td>564</td><td class="va">38</td><td class="va">108</td><td class="va">91</td><td>10</td><td class="va">.276</td><td class="va">.374</td><td class="va">.566</td><td class="va">.940</td><td class="va">6.9</td></tr>
          <tr><td>ATC</td><td>144</td><td>590</td><td class="va">39</td><td class="ve">114</td><td class="va">95</td><td>12</td><td class="va">.279</td><td class="va">.382</td><td class="va">.579</td><td class="ve">.961</td><td class="ve">7.1</td></tr>
          <tr style="background:rgba(245,200,66,.04);"><td style="color:var(--gold);">Consensus</td><td style="color:var(--gold);">143</td><td style="color:var(--gold);">586</td><td class="ve" style="color:var(--gold);">40</td><td class="ve" style="color:var(--gold);">113</td><td style="color:var(--gold);">95</td><td style="color:var(--gold);">12</td><td style="color:var(--gold);">.280</td><td style="color:var(--gold);">.381</td><td style="color:var(--gold);">.583</td><td class="ve" style="color:var(--gold);">.964</td><td class="ve" style="color:var(--gold);">7.3</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">PITCHING PROJECTIONS — 2026 FULL SEASON</div>
      <table class="dt">
        <thead><tr><th>System</th><th>GS</th><th>IP</th><th>ERA</th><th>FIP</th><th>WHIP</th><th>K/9</th><th>BB/9</th><th>K%</th><th>pWAR</th></tr></thead>
        <tbody>
          <tr><td>Steamer</td><td>18</td><td>108</td><td class="ve">2.28</td><td class="ve">2.14</td><td class="vg">1.01</td><td class="ve">13.1</td><td>2.9</td><td class="ve">34.8%</td><td class="ve">2.8</td></tr>
          <tr><td>ZiPS</td><td>20</td><td>118</td><td class="ve">2.14</td><td class="ve">2.08</td><td class="vg">0.98</td><td class="ve">13.6</td><td>2.7</td><td class="ve">35.8%</td><td class="ve">3.2</td></tr>
          <tr style="background:rgba(245,200,66,.04);"><td style="color:var(--gold);">Consensus</td><td style="color:var(--gold);">19</td><td style="color:var(--gold);">113</td><td class="ve" style="color:var(--gold);">2.21</td><td class="ve" style="color:var(--gold);">2.11</td><td class="vg" style="color:var(--gold);">1.00</td><td class="ve" style="color:var(--gold);">13.4</td><td style="color:var(--gold);">2.8</td><td class="ve" style="color:var(--gold);">35.3%</td><td class="ve" style="color:var(--gold);">3.0</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-title">5-YEAR WAR OUTLOOK & AGING CURVE</div>
      <div class="proj-wrap" style="margin-bottom:4px;">
        <div class="proj-col"><div class="proj-bar" style="height:46px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2021<br><span style="color:var(--orange);">9.2</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:50px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2022<br><span style="color:var(--orange);">10.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:50px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2023<br><span style="color:var(--orange);">10.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:45px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2024<br><span style="color:var(--orange);">9.0</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:37px;width:100%;background:var(--gold);border:1px dashed var(--gold);"></div><div class="proj-yr-lbl" style="color:var(--gold);">2026*<br>7.3</div></div>
        <div class="proj-col"><div class="proj-bar" style="height:34px;width:100%;background:rgba(160,180,204,.28);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2027*<br><span style="color:var(--text-dim);">6.8</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:32px;width:100%;background:rgba(160,180,204,.2);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2028*<br><span style="color:var(--text-dim);">6.4</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:29px;width:100%;background:rgba(160,180,204,.14);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2029*<br><span style="color:var(--text-dim);">5.8</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:26px;width:100%;background:rgba(160,180,204,.1);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2030*<br><span style="color:var(--text-dim);">5.2</span></div></div>
      </div>
      <div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-bottom:12px;">* Projected. Bar height = WAR/10. Career WAR projection at retirement: 95+</div>
      <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">📈</div><div><div class="fc-title">Peak Window: Ages 28–34 (2022–2028)</div><div class="fc-desc">Statcast metrics show minimal aging through 31. Power metrics (EV, Barrel%) holding steady. Expected peak maintenance through at least 2028.</div></div></div>
      <div class="fc"><div class="fc-icon">📉</div><div><div class="fc-title">Speed Decline Onset: Age 32+ (2026+)</div><div class="fc-desc">Sprint speed declined from 29.4 to 28.2 ft/s since 2021. Projected to reach average by 2028. Bat-to-ball skills fully compensate for lost speed value.</div></div></div>
      <div class="fc" style="border-color:rgba(245,200,66,.15);"><div class="fc-icon">🔄</div><div><div class="fc-title">Two-Way Sustainability</div><div class="fc-desc">LAD monitoring IP ceiling at 120-130 annually. Increasing DH usage projected (70% DH / 30% SP by 2029). Long-term value gradually shifts toward bat-side dominance.</div></div></div>
    </div>
  </div>
</div>

<!-- FANTASY -->
<div class="d-pane" id="pane-fantasy">
  <div class="g3" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">FANTASY PROFILE</div>
      <div style="text-align:center;margin-bottom:13px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:var(--text-dim);margin-bottom:4px;">OVERALL RANK — ALL FORMATS</div>
        <div class="fant-rank">#1</div>
        <span class="tier-badge t1">TIER 1</span>
      </div>
      <div class="g2" style="gap:6px;margin-bottom:13px;">
        <div class="sc"><div class="sc-lbl">Redraft</div><div class="sc-val" style="color:var(--red);">#2</div></div>
        <div class="sc"><div class="sc-lbl">Dynasty</div><div class="sc-val" style="color:var(--red);">#1</div></div>
        <div class="sc"><div class="sc-lbl">Keeper</div><div class="sc-val" style="color:var(--red);">#1</div></div>
        <div class="sc"><div class="sc-lbl">Best Ball</div><div class="sc-val" style="color:var(--red);">#1</div></div>
        <div class="sc"><div class="sc-lbl">Points Lge</div><div class="sc-val" style="color:var(--red);">#1</div></div>
        <div class="sc"><div class="sc-lbl">Roto</div><div class="sc-val" style="color:var(--orange);">#2</div></div>
      </div>
      <div class="sec">ELIGIBILITY</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px;">
        <span class="rp rl">OF</span>
        <span class="rp" style="background:var(--blue-dim);color:var(--blue);border-color:rgba(90,180,245,.25);">SP</span>
        <span class="rp" style="background:var(--gold-dim);color:var(--gold);border-color:rgba(245,200,66,.25);">DH</span>
        <span class="rp" style="background:var(--orange-dim);color:var(--orange);border-color:rgba(232,114,42,.25);">UT</span>
      </div>
      <div class="sec">RISK FLAGS</div>
      <div style="display:grid;gap:5px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(13,28,58,.5);border-radius:8px;"><span style="font-size:11px;font-family:'Barlow Condensed',sans-serif;font-weight:700;">Injury Risk</span><span class="rp rl" style="font-size:9px;padding:2px 8px;">LOW</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(13,28,58,.5);border-radius:8px;"><span style="font-size:11px;font-family:'Barlow Condensed',sans-serif;font-weight:700;">Regression Risk</span><span class="rp rl" style="font-size:9px;padding:2px 8px;">VERY LOW</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(13,28,58,.5);border-radius:8px;"><span style="font-size:11px;font-family:'Barlow Condensed',sans-serif;font-weight:700;">Volatility Score</span><span class="rp rl" style="font-size:9px;padding:2px 8px;">LOW</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(13,28,58,.5);border-radius:8px;"><span style="font-size:11px;font-family:'Barlow Condensed',sans-serif;font-weight:700;">Breakout Probability</span><span class="rp rl" style="font-size:9px;padding:2px 8px;">ALREADY ELITE</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">CATEGORY STRENGTH</div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">AVG</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:91%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">HR</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:98%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">RBI</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:96%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">RUNS</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:90%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">SB</div><div class="fant-cat-track"><div class="fant-cat-fill fm" style="width:62%;"></div></div><div class="fant-cat-val" style="color:var(--gold);">B</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">OBP</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:95%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">ERA</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:98%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">K's (P)</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:100%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">WINS</div><div class="fant-cat-track"><div class="fant-cat-fill fa" style="width:82%;"></div></div><div class="fant-cat-val" style="color:var(--orange);">A</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">WHIP</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:96%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">K/9</div><div class="fant-cat-track"><div class="fant-cat-fill fe" style="width:99%;"></div></div><div class="fant-cat-val" style="color:var(--red);">A+</div></div>
      <div class="fant-cat-row"><div class="fant-cat-lbl">SVH</div><div class="fant-cat-track"><div class="fant-cat-fill fp" style="width:0%;"></div></div><div class="fant-cat-val" style="color:var(--text-dim);">N/A</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">2026 FANTASY PROJECTIONS</div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Batting AVG</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--orange);">.280</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Home Runs</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--red);">40</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">RBI</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--red);">113</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Runs Scored</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--orange);">95</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Stolen Bases</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--gold);">12</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">ERA (Pitching)</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--red);">2.21</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Strikeouts (P)</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--red);">186</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(13,28,58,.6);border-radius:9px;border:1px solid var(--panel-border);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--text-dim);">Pitcher Wins</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--orange);">14</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(245,200,66,.07);border-radius:9px;border:1px solid rgba(245,200,66,.2);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:var(--gold);">ESPN Points (proj)</span><span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--gold);">586 pts</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(232,90,90,.06);border-radius:9px;border:1px solid rgba(232,90,90,.15);"><span style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:var(--red);">Yahoo FPTS (proj)</span><span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--red);">612 pts</span></div>
        <div style="padding:10px 12px;background:rgba(77,206,138,.06);border-radius:9px;border:1px solid rgba(77,206,138,.15);margin-top:3px;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--green);margin-bottom:4px;">JARVIS FANTASY VERDICT</div>
          <div style="font-size:11px;color:rgba(255,255,255,.8);line-height:1.6;">Elite in every format. Only competition for #1 overall is Aaron Judge in points leagues. Two-way eligibility makes him irreplaceable in categories formats. Do not let him slip past pick #2 in any draft.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- TRADE VALUE -->
<div class="d-pane" id="pane-trade">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">TRADE & ACQUISITION INTELLIGENCE</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px;">TRADE VALUE METER</div>
      <div class="trade-meter">
        <div class="trade-gradient"></div>
        <div class="trade-marker" style="left:93%;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:3px;"><span>SELL NOW</span><span>HOLD</span><span>FAIR VALUE</span><span>BUY HIGH</span></div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;color:var(--gold);margin:12px 0 4px;">UNTRADEABLE ASSET</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:16px;">No team would receive fair value. Generational two-way asset with 8+ years control.</div>
      <div class="sec">YEARS OF CONTROL</div>
      <div class="ctrl-bar">
        <div class="ctrl-yr ctrl-pre" title="2026">26</div>
        <div class="ctrl-yr ctrl-pre" title="2027">27</div>
        <div class="ctrl-yr ctrl-pre" title="2028">28</div>
        <div class="ctrl-yr ctrl-pre" title="2029">29</div>
        <div class="ctrl-yr ctrl-pre" title="2030">30</div>
        <div class="ctrl-yr ctrl-pre" title="2031">31</div>
        <div class="ctrl-yr ctrl-pre" title="2032">32</div>
        <div class="ctrl-yr ctrl-pre" title="2033">33</div>
        <div class="ctrl-yr ctrl-fa" style="flex:1.4;" title="FA 2034">FA '34</div>
      </div>
      <div style="display:flex;gap:12px;margin-top:5px;font-size:9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;"><span style="color:var(--green);">■ Under Contract</span><span style="color:var(--red);">■ Free Agent</span></div>
      <div class="sec" style="margin-top:14px;">CONTRACT BY YEAR</div>
      <table class="dt">
        <thead><tr><th>Year</th><th>Age</th><th>AAV</th><th>Deferred</th><th>Proj WAR</th><th>Mkt Value</th><th>Surplus</th></tr></thead>
        <tbody>
          <tr><td style="color:var(--orange);">2026</td><td>31</td><td>$46M</td><td>$68M</td><td class="ve">7.3</td><td class="vg">$73M</td><td class="vg">+$27M</td></tr>
          <tr><td>2027</td><td>32</td><td>$46M</td><td>$68M</td><td class="ve">6.8</td><td class="vg">$68M</td><td class="vg">+$22M</td></tr>
          <tr><td>2028</td><td>33</td><td>$46M</td><td>$68M</td><td class="ve">6.4</td><td class="vg">$64M</td><td class="vg">+$18M</td></tr>
          <tr><td>2029</td><td>34</td><td>$46M</td><td>$68M</td><td class="va">5.8</td><td class="va">$58M</td><td class="vg">+$12M</td></tr>
          <tr><td>2030</td><td>35</td><td>$46M</td><td>$68M</td><td class="va">5.2</td><td class="va">$52M</td><td class="vg">+$6M</td></tr>
          <tr><td>2031–33</td><td>36–38</td><td>$46M/yr</td><td>$68M/yr</td><td class="vm">3.5 avg</td><td class="vm">$42M avg</td><td class="vd">-$4M avg</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-title">SURPLUS VALUE & FIT MATRIX</div>
      <div style="display:grid;gap:8px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(13,28,58,.5);border-radius:10px;border:1px solid var(--panel-border);"><div><div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;">TOTAL CONTRACT</div><div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">$700M</div></div><div style="text-align:right;"><div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;">MARKET VALUE (PROJ)</div><div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--green);">$534M</div></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(13,28,58,.5);border-radius:10px;border:1px solid var(--panel-border);"><div><div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;">$/WAR (EFFECTIVE)</div><div style="font-family:'Bebas Neue',sans-serif;font-size:22px;">$8.6M</div></div><div style="text-align:right;"><div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:1px;">MARKET $/WAR</div><div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--orange);">$10.2M</div></div></div>
      </div>
      <div class="sec">ORGANIZATIONAL FIT MATRIX</div>
      <table class="dt">
        <thead><tr><th>Dimension</th><th>Score</th><th>Assessment</th></tr></thead>
        <tbody>
          <tr><td>Roster Construction Fit</td><td class="ve">96/100</td><td class="vg">Perfect</td></tr>
          <tr><td>Lineup Protection Impact</td><td class="ve">98/100</td><td class="vg">Elite</td></tr>
          <tr><td>Rotation Depth Contribution</td><td class="va">84/100</td><td>Strong</td></tr>
          <tr><td>Payroll Flexibility Impact</td><td class="vm">71/100</td><td class="vd">Moderate</td></tr>
          <tr><td>Win-Now Impact</td><td class="ve">99/100</td><td class="vg">Immediate</td></tr>
          <tr><td>Long-Term Value</td><td class="ve">97/100</td><td class="vg">Generational</td></tr>
          <tr><td>Market / Brand Value</td><td class="ve">100/100</td><td class="vg">Unprecedented</td></tr>
        </tbody>
      </table>
      <div class="sec" style="margin-top:13px;">COMPARABLE CONTRACTS</div>
      <table class="dt">
        <thead><tr><th>Player</th><th>Contract</th><th>AAV</th><th>Proj WAR</th><th>$/WAR</th><th>Verdict</th></tr></thead>
        <tbody>
          <tr><td style="color:var(--orange);">Ohtani (LAD)</td><td>$700M/10</td><td>$46M*</td><td class="ve">7.3</td><td class="vg">$8.6M</td><td class="vg">SURPLUS</td></tr>
          <tr><td>Judge (NYY)</td><td>$360M/9</td><td>$40M</td><td class="ve">7.1</td><td>$9.8M</td><td class="vd">FAIR</td></tr>
          <tr><td>Soto (NYY)</td><td>$765M/15</td><td>$51M</td><td class="va">5.8</td><td style="color:var(--red);">$13.8M</td><td style="color:var(--red);">OVERPAY</td></tr>
          <tr><td>Guerrero (TOR)</td><td>$500M/12</td><td>$41.7M</td><td class="va">5.2</td><td style="color:var(--red);">$12.4M</td><td style="color:var(--red);">OVERPAY</td></tr>
        </tbody>
      </table>
      <div style="font-size:9px;color:var(--text-dim);font-family:'Barlow Condensed',sans-serif;margin-top:4px;margin-bottom:12px;">* Effective AAV after CBT deferred structure accounting</div>
      <div class="fc" style="border-color:rgba(77,206,138,.2);"><div class="fc-icon">🟢</div><div><div class="fc-title">Dynasty / Keeper: HOLD FOREVER</div><div class="fc-desc">8 years of control at surplus value. Career WAR tracking for Top-20 MLB all-time. No rational sell price exists in any format.</div></div></div>
      <div class="fc" style="border-color:rgba(245,200,66,.15);"><div class="fc-icon">🟡</div><div><div class="fc-title">Redraft: BUY AT ANY COST</div><div class="fc-desc">Worth #1 overall pick even at reduced pitching load. Injury risk on pitching side creates slight draft equity gap vs true value — exploit it.</div></div></div>
    </div>
  </div>
</div>

<!-- DEVELOPMENT -->
<div class="d-pane" id="pane-development">
  <div class="g2" style="margin-bottom:13px;">
    <div class="panel">
      <div class="panel-title">DEVELOPMENT TRACKING <span class="panel-badge">2021–2026</span></div>
      <div class="sec">FASTBALL VELOCITY TREND</div>
      <div class="proj-wrap" style="margin-bottom:3px;">
        <div class="proj-col"><div class="proj-bar" style="height:42px;width:100%;background:var(--blue);"></div><div class="proj-yr-lbl">2021<br><span style="color:var(--blue);">97.4</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:46px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2022<br><span style="color:var(--orange);">98.2</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:48px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2023<br><span style="color:var(--orange);">98.8</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:24px;width:100%;background:rgba(160,180,204,.2);border:1px dashed var(--text-dim);"></div><div class="proj-yr-lbl">2024<br><span style="color:var(--text-dim);">TJ</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:50px;width:100%;background:var(--red);"></div><div class="proj-yr-lbl" style="color:var(--red);">2026<br>99.2</div></div>
      </div>
      <div class="sec" style="margin-top:13px;">BAT SPEED TREND</div>
      <div class="proj-wrap" style="margin-bottom:3px;">
        <div class="proj-col"><div class="proj-bar" style="height:36px;width:100%;background:var(--blue);"></div><div class="proj-yr-lbl">2021<br><span style="color:var(--blue);">71.2</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:40px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2022<br><span style="color:var(--orange);">72.4</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:44px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2023<br><span style="color:var(--orange);">73.8</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:42px;width:100%;background:var(--orange);"></div><div class="proj-yr-lbl">2024<br><span style="color:var(--orange);">73.2</span></div></div>
        <div class="proj-col"><div class="proj-bar" style="height:48px;width:100%;background:var(--red);"></div><div class="proj-yr-lbl" style="color:var(--red);">2026<br>74.1</div></div>
      </div>
      <div class="sec" style="margin-top:13px;">KEY DEVELOPMENTS</div>
      <div class="fc" style="border-color:rgba(77,206,138,.15);"><div class="fc-icon">📈</div><div><div class="fc-title">2026: Post-TJ Velo Spike</div><div class="fc-desc">After UCL reconstruction (2024), fastball velocity rose from 98.2 to 99.2 mph. UCL repair resulted in stronger arm than pre-injury. Elite recovery outcome.</div></div></div>
      <div class="fc" style="border-color:rgba(232,114,42,.15);"><div class="fc-icon">⚾</div><div><div class="fc-title">2023: Sweeper Addition (Pitch Design Lab)</div><div class="fc-desc">Added sweeper mid-2023 via LAD pitch design lab. Spin rate increased 200+ rpm over original slider. Now 80-grade putaway pitch — transformed pitching profile entirely.</div></div></div>
      <div class="fc" style="border-color:rgba(90,180,245,.15);"><div class="fc-icon">🏋️</div><div><div class="fc-title">2026 Offseason: Bat Speed Training</div><div class="fc-desc">Blast Motion data: bat speed increased 2.9 mph vs 2023. Worked with LAD biomechanics team on attack angle optimization. xSLG jumped from .682 to .712.</div></div></div>
      <div class="fc"><div class="fc-icon">🔬</div><div><div class="fc-title">Command Development</div><div class="fc-desc">BB/9 decreased from 3.2 (2023) to 2.8 (2026) post-surgery. Release point consistency improved. Zone% up 3.1 points. Command+ likely to keep improving with reps.</div></div></div>
    </div>
    <div class="panel">
      <div class="panel-title">WORKLOAD MANAGEMENT — 2026</div>
      <table class="dt" style="margin-bottom:13px;">
        <thead><tr><th>Metric</th><th>Target</th><th>Current</th><th>On Track</th></tr></thead>
        <tbody>
          <tr><td>Pitching Starts</td><td>18–22</td><td>8</td><td class="vg">✓ Yes</td></tr>
          <tr><td>Innings Pitched</td><td>110–130</td><td>62.1</td><td class="vg">✓ Yes</td></tr>
          <tr><td>DH Games</td><td>90–100</td><td>34</td><td class="vg">✓ Yes</td></tr>
          <tr><td>OF Games</td><td>&lt; 20</td><td>8</td><td class="vg">✓ Yes</td></tr>
          <tr><td>Rest Between Starts</td><td>5+ days</td><td>Avg 6.2d</td><td class="vg">✓ Yes</td></tr>
          <tr><td>Pitch Count Max</td><td>95–105</td><td>Avg 88</td><td class="vg">✓ Yes</td></tr>
        </tbody>
      </table>
      <div class="sec">INJURY HISTORY</div>
      <table class="dt" style="margin-bottom:13px;">
        <thead><tr><th>Year</th><th>Injury</th><th>Days</th><th>Impact</th></tr></thead>
        <tbody>
          <tr><td>2018</td><td>Elbow (partial UCL, PRP)</td><td>0</td><td class="vd">Minor</td></tr>
          <tr><td>2020</td><td>Forearm flexor strain</td><td>28</td><td class="vm">Moderate</td></tr>
          <tr><td>2023</td><td>UCL (Tommy John)</td><td>Full off-season</td><td class="va">Major P-side</td></tr>
          <tr><td>2024</td><td>Recovery / DH only</td><td>N/A</td><td class="vd">Managed</td></tr>
          <tr><td>2026</td><td>None</td><td>0</td><td class="vg">✓ Healthy</td></tr>
        </tbody>
      </table>
      <div class="sec">PHYSICAL METRICS</div>
      <div class="g4">
        <div class="sc"><div class="sc-lbl">Sprint Speed</div><div class="sc-val" style="color:var(--gold);">28.2</div><div class="sc-sub">ft/s</div></div>
        <div class="sc"><div class="sc-lbl">Arm Velo</div><div class="sc-val" style="color:var(--orange);">99.2</div><div class="sc-sub">mph avg</div></div>
        <div class="sc"><div class="sc-lbl">Bat Speed</div><div class="sc-val" style="color:var(--red);">74.1</div><div class="sc-sub">mph avg</div></div>
        <div class="sc"><div class="sc-lbl">Max EV</div><div class="sc-val" style="color:var(--red);">118.4</div><div class="sc-sub">mph</div></div>
      </div>
    </div>
  </div>
</div>

<!-- COMPARABLES -->
<div class="d-pane" id="pane-comparables">
  <div class="panel">
    <div class="panel-title">PLAYER COMPARABLES & ARCHETYPES <span class="panel-badge">JARVIS ANALYSIS</span></div>
    <div style="background:rgba(232,114,42,.07);border:1px solid rgba(232,114,42,.17);border-radius:12px;padding:14px;margin-bottom:15px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;color:var(--orange);margin-bottom:5px;">JARVIS COMPARABLE VERDICT</div>
      <div style="font-size:13px;line-height:1.75;color:#fff;">No modern MLB comparable exists for a two-way player of this caliber. The closest historical analog is <strong style="color:var(--gold);">Babe Ruth (1918–1921)</strong> — the last player to sustain elite production on both pitching and hitting simultaneously. By Statcast-era metrics, Ohtani's individual tool grades exceed any two-way player in baseball history. Standard scouting frameworks inadequate.</div>
    </div>
    <div class="g3">
      <div>
        <div class="sec">HITTING COMPS</div>
        <table class="dt">
          <thead><tr><th>Player</th><th>Era</th><th>Sim%</th><th>Note</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--gold);">Babe Ruth</td><td>1920s</td><td class="ve">68%</td><td class="vd">Power/OBP</td></tr>
            <tr><td>Mike Trout</td><td>2010s</td><td class="va">71%</td><td class="vd">Statcast profile</td></tr>
            <tr><td>Aaron Judge</td><td>Current</td><td class="va">74%</td><td class="vd">Power/EV match</td></tr>
            <tr><td>Barry Bonds</td><td>2001–04</td><td class="vm">62%</td><td class="vd">BB%/OBP peak</td></tr>
            <tr><td>Albert Pujols</td><td>2000s</td><td class="vm">58%</td><td class="vd">Production tier</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div class="sec">PITCHING COMPS</div>
        <table class="dt">
          <thead><tr><th>Player</th><th>Era</th><th>Sim%</th><th>Note</th></tr></thead>
          <tbody>
            <tr><td>Paul Skenes</td><td>Current</td><td class="ve">78%</td><td class="vd">Stuff+ profile</td></tr>
            <tr><td>Jacob deGrom</td><td>2018–21</td><td class="va">72%</td><td class="vd">K rate / ERA</td></tr>
            <tr><td>Tarik Skubal</td><td>2025–26</td><td class="vm">68%</td><td class="vd">K% / FIP match</td></tr>
            <tr><td>Spencer Alcantara</td><td>2022</td><td class="vm">64%</td><td class="vd">Durability</td></tr>
            <tr><td>Sandy Koufax</td><td>1960s</td><td class="vm">61%</td><td class="vd">Peak dominance</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div class="sec">CAREER OUTCOME MODELS</div>
        <table class="dt">
          <thead><tr><th>Scenario</th><th>Prob</th><th>Career WAR</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--red);">All-Time Great</td><td class="ve">82%</td><td class="ve">95–120</td></tr>
            <tr><td style="color:var(--orange);">Superstar</td><td class="va">14%</td><td class="va">75–95</td></tr>
            <tr><td style="color:var(--gold);">Solid Star</td><td class="vm">3%</td><td class="vm">55–75</td></tr>
            <tr><td style="color:var(--blue);">Injury/Decline</td><td class="vd">1%</td><td class="vd">&lt; 55</td></tr>
          </tbody>
        </table>
        <div class="sec" style="margin-top:13px;">HISTORICAL CONTEXT</div>
        <table class="dt">
          <thead><tr><th>Metric</th><th>Ohtani</th><th>MLB Record</th></tr></thead>
          <tbody>
            <tr><td>HR + K (same season)</td><td class="ve">44+200</td><td class="ve">First ever</td></tr>
            <tr><td>50 HR as pitcher</td><td class="ve">Yes</td><td class="ve">Only player</td></tr>
            <tr><td>10 WAR as TWP</td><td class="ve">Yes</td><td class="ve">First since Ruth</td></tr>
            <tr><td>MVP + CY in same year</td><td class="vm">2021 (AL)</td><td class="vm">Rare</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

</div><!-- /wrap -->

<script>
const DEMO_PLAYERS=[
  {id:660271,name:'Shohei Ohtani',team:'LAD',pos:'TWP',score:98,grade:'A+',verdict:'v-acquire',verdictTxt:'PRIORITY ACQUISITION',risk:'rl',riskTxt:'LOW RISK',comp:'Unprecedented',num:'17'},
  {id:592450,name:'Aaron Judge',team:'NYY',pos:'RF',score:96,grade:'A+',verdict:'v-acquire',verdictTxt:'PRIORITY ACQUISITION',risk:'rl',riskTxt:'LOW RISK',comp:'Babe Ruth (power)',num:'99'},
  {id:665742,name:'Juan Soto',team:'NYY',pos:'RF',score:92,grade:'A',verdict:'v-acquire',verdictTxt:'STRONG BUY',risk:'rl',riskTxt:'LOW RISK',comp:'Ted Williams (OBP)',num:'22'},
  {id:694973,name:'Paul Skenes',team:'PIT',pos:'SP',score:94,grade:'A+',verdict:'v-acquire',verdictTxt:'PRIORITY ACQUISITION',risk:'rl',riskTxt:'LOW RISK',comp:'Peak deGrom',num:'30'},
  {id:607178,name:'Tarik Skubal',team:'DET',pos:'SP',score:91,grade:'A',verdict:'v-acquire',verdictTxt:'STRONG BUY',risk:'rl',riskTxt:'LOW RISK',comp:'Clayton Kershaw',num:'29'},
  {id:672515,name:'Bobby Witt Jr.',team:'KC',pos:'SS',score:87,grade:'A',verdict:'v-acquire',verdictTxt:'STRONG BUY',risk:'rl',riskTxt:'LOW RISK',comp:'A-Rod (youth)',num:'7'},
  {id:660670,name:'Corbin Carroll',team:'ARI',pos:'CF',score:84,grade:'A-',verdict:'v-monitor',verdictTxt:'MONITOR CLOSELY',risk:'rl',riskTxt:'LOW RISK',comp:'Rickey Henderson',num:'7'},
  {id:596019,name:'Mookie Betts',team:'LAD',pos:'RF',score:88,grade:'A',verdict:'v-acquire',verdictTxt:'STRONG BUY',risk:'rl',riskTxt:'LOW RISK',comp:'Mike Trout (lite)',num:'50'},
  {id:672535,name:'Yordan Alvarez',team:'HOU',pos:'DH',score:90,grade:'A',verdict:'v-acquire',verdictTxt:'STRONG BUY',risk:'rm',riskTxt:'MOD RISK',comp:'David Ortiz (power)',num:'44'},
  {id:547180,name:'Clayton Kershaw',team:'LAD',pos:'SP',score:76,grade:'B+',verdict:'v-monitor',verdictTxt:'HOLD — AGE CONCERN',risk:'rm',riskTxt:'MOD RISK',comp:'Randy Johnson (late)',num:'22'},
];

window.addEventListener('DOMContentLoaded',function(){
  var sel=document.getElementById('player-sel');
  DEMO_PLAYERS.forEach(function(p){
    var o=document.createElement('option');
    o.value=p.id;o.textContent=p.name+' · '+p.team+' · '+p.pos;
    sel.appendChild(o);
  });
  drawRadar();drawSpray();drawMovement();animateRing(98);
});

function showPane(id,btn){
  document.querySelectorAll('.d-pane').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.d-tab').forEach(function(t){t.classList.remove('on');});
  var el=document.getElementById('pane-'+id);
  if(el)el.classList.add('on');
  if(btn)btn.classList.add('on');
  if(id==='overview'){setTimeout(drawRadar,50);}
  if(id==='statcast'){setTimeout(drawSpray,50);}
  if(id==='arsenal'){setTimeout(drawMovement,50);}
}

function loadSelectedPlayer(){
  var id=parseInt(document.getElementById('player-sel').value);
  if(!id)return;
  var p=DEMO_PLAYERS.find(function(x){return x.id===id;});
  if(!p)return;
  document.getElementById('hero-name').textContent=p.name.toUpperCase();
  document.getElementById('hero-team').textContent=p.team+' · '+p.pos;
  document.getElementById('hero-num').textContent='#'+p.num;
  document.getElementById('hero-photo').src='https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/'+p.id+'/headshot/67/current';
  document.getElementById('j-score').textContent=p.score;
  document.getElementById('j-letter').textContent=p.grade;
  document.getElementById('j-verdict').textContent=p.verdictTxt;
  document.getElementById('j-verdict').className='verdict '+p.verdict;
  document.getElementById('j-comp').textContent=p.comp;
  document.getElementById('j-risk').textContent=p.riskTxt;
  document.getElementById('j-risk').className='rp '+p.risk;
  var c=p.score>=90?'var(--red)':p.score>=80?'var(--orange)':p.score>=70?'var(--gold)':'var(--blue)';
  document.getElementById('j-score').style.color=c;
  document.getElementById('j-letter').style.color=c;
  document.getElementById('j-arc').setAttribute('stroke',c);
  animateRing(p.score);
}

function animateRing(score){
  var circ=2*Math.PI*42;
  document.getElementById('j-arc').style.strokeDashoffset=circ*(1-score/100);
}

function handleSearch(val){
  var dd=document.getElementById('search-dd');
  if(!val||val.length<2){dd.style.display='none';return;}
  var matches=DEMO_PLAYERS.filter(function(p){return p.name.toLowerCase().includes(val.toLowerCase())||p.team.toLowerCase().includes(val.toLowerCase());});
  if(!matches.length){dd.style.display='none';return;}
  dd.style.display='block';
  dd.innerHTML=matches.map(function(p){
    var c=p.score>=90?'var(--red)':p.score>=80?'var(--orange)':'var(--gold)';
    return '<div class="sd-item" onclick="selectSearch('+p.id+')">'
      +'<img class="sd-photo" src="https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/'+p.id+'/headshot/67/current" onerror="this.style.display=\'none\'">'
      +'<div><div class="sd-name">'+p.name+'</div><div class="sd-meta">'+p.team+' · '+p.pos+'</div></div>'
      +'<div class="sd-score" style="color:'+c+';">'+p.score+'</div></div>';
  }).join('');
}

function selectSearch(id){
  document.getElementById('player-sel').value=id;
  document.getElementById('search-dd').style.display='none';
  document.getElementById('cmd-search').value='';
  loadSelectedPlayer();
}

document.addEventListener('click',function(e){
  if(!e.target.closest('.cmd-search-wrap'))document.getElementById('search-dd').style.display='none';
});

function drawRadar(){
  var c=document.getElementById('radar-canvas');if(!c)return;
  var ctx=c.getContext('2d'),W=c.width,H=c.height,cx=W/2,cy=H/2,R=Math.min(W,H)/2-28;
  ctx.clearRect(0,0,W,H);
  var labels=['Hit Tool','Power','Speed','Discipline','Fielding','Arm'];
  var vals=[0.75,1.0,0.62,0.82,0.62,0.75];
  var n=labels.length;
  [.25,.5,.75,1].forEach(function(r){
    ctx.beginPath();
    for(var i=0;i<n;i++){var a=(i/n)*Math.PI*2-Math.PI/2;var x=cx+Math.cos(a)*R*r,y=cy+Math.sin(a)*R*r;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.closePath();ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=1;ctx.stroke();
  });
  for(var i=0;i<n;i++){
    var a=(i/n)*Math.PI*2-Math.PI/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);
    ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1;ctx.stroke();
    var lx=cx+Math.cos(a)*(R+20),ly=cy+Math.sin(a)*(R+20);
    ctx.fillStyle='rgba(140,160,184,.9)';ctx.font='bold 10px Barlow Condensed';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(labels[i],lx,ly);
  }
  ctx.beginPath();
  for(var i=0;i<n;i++){var a=(i/n)*Math.PI*2-Math.PI/2;var x=cx+Math.cos(a)*R*vals[i],y=cy+Math.sin(a)*R*vals[i];i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
  ctx.closePath();ctx.fillStyle='rgba(232,114,42,.15)';ctx.fill();ctx.strokeStyle='var(--orange)';ctx.lineWidth=2;ctx.stroke();
  for(var i=0;i<n;i++){var a=(i/n)*Math.PI*2-Math.PI/2;var x=cx+Math.cos(a)*R*vals[i],y=cy+Math.sin(a)*R*vals[i];ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#e8722a';ctx.fill();}
}

function drawSpray(){
  var c=document.getElementById('spray-canvas');if(!c)return;
  var ctx=c.getContext('2d'),W=c.width,H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.beginPath();ctx.arc(W/2,H+30,H+10,Math.PI+0.28,-0.28);ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(W/2,H-8);ctx.lineTo(W/2-48,H-58);ctx.lineTo(W/2,H-108);ctx.lineTo(W/2+48,H-58);ctx.closePath();ctx.strokeStyle='rgba(255,255,255,.07)';ctx.stroke();
  var hits=[
    {x:.48,y:.18,t:'hr'},{x:.72,y:.26,t:'hr'},{x:.28,y:.30,t:'hr'},{x:.62,y:.22,t:'hr'},
    {x:.52,y:.38,t:'xb'},{x:.38,y:.46,t:'xb'},{x:.66,y:.42,t:'xb'},{x:.44,y:.30,t:'xb'},
    {x:.44,y:.60,t:'h'},{x:.58,y:.56,t:'h'},{x:.36,y:.62,t:'h'},{x:.62,y:.66,t:'h'},{x:.48,y:.70,t:'h'},
    {x:.30,y:.44,t:'out'},{x:.70,y:.50,t:'out'},{x:.50,y:.20,t:'out'},{x:.42,y:.32,t:'out'},{x:.60,y:.34,t:'out'},{x:.54,y:.54,t:'out'},{x:.34,y:.52,t:'out'},
  ];
  var cols={hr:'rgba(232,90,90,.85)',xb:'rgba(90,180,245,.75)',h:'rgba(77,206,138,.75)',out:'rgba(160,180,204,.28)'};
  hits.forEach(function(h){
    ctx.beginPath();ctx.arc(h.x*W,h.y*H,h.t==='hr'?7:h.t==='out'?4:5,0,Math.PI*2);
    ctx.fillStyle=cols[h.t];ctx.fill();
    if(h.t!=='out'){ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;ctx.stroke();}
  });
}

function drawMovement(){
  var c=document.getElementById('movement-canvas');if(!c)return;
  var ctx=c.getContext('2d'),W=c.width,H=c.height,cx=W/2,cy=H/2;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
  [-20,-10,0,10,20].forEach(function(v){
    var x=cx+v*6,y=cy+v*6;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
  });
  ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.stroke();
  ctx.fillStyle='rgba(140,160,184,.7)';ctx.font='bold 9px Barlow Condensed';ctx.textAlign='center';
  ctx.fillText('← Glove Side',cx-65,H-6);ctx.fillText('Arm Side →',cx+65,H-6);
  ctx.fillText('Rise',cx+4,11);ctx.fillText('Drop',cx+4,H-10);
  var pitches=[
    {hb:5.1,ivb:18.4,color:'rgba(232,90,90,.9)',label:'FF',pts:22},
    {hb:-18.2,ivb:-0.8,color:'rgba(245,200,66,.9)',label:'ST',pts:18},
    {hb:0.4,ivb:-4.8,color:'rgba(90,180,245,.9)',label:'FS',pts:16},
  ];
  pitches.forEach(function(p){
    var px=cx+p.hb*5.8,py=cy-p.ivb*5.8;
    for(var i=0;i<p.pts;i++){var nx=px+(Math.random()-.5)*18,ny=py+(Math.random()-.5)*18;ctx.beginPath();ctx.arc(nx,ny,3,0,Math.PI*2);ctx.fillStyle=p.color.replace('.9','.28');ctx.fill();}
    ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='bold 11px Bebas Neue';ctx.textAlign='center';ctx.fillText(p.label,px,py-14);
  });
}
</script>
</body>
</html>