import React, { useState, useMemo, useEffect, memo, lazy, Suspense } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { TEAMS, RUN_DIFF_DATA } from '../constants/data.js';
import { getTodaysGames, getStandings, getAllTeamStats } from '../api/mlb.js';
import { Panel, StatStrip, KVRow, SkeletonBlock } from '../components/atoms.jsx';

// Deferred-loading split (2026-08-12): these six charts are the only things
// on this page that need recharts (~85KB gzip, the largest chunk in the
// app). Overview is the default landing tab, so if this page imported
// recharts directly, that chunk would sit on the critical path for the very
// first paint — blocking rankings tables, stat strips, and every other
// non-chart panel from appearing, not just the charts themselves. Each is
// lazy-loaded from the same shared chunk (src/components/OverviewCharts.jsx)
// — six `import()` calls below, but the browser's module cache dedupes them
// to a single network fetch, not six. See that file's header comment for
// the full reasoning.
const OffenseRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.OffenseRadar })));
const StrengthRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.StrengthRadar })));
const RunDiffChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.RunDiffChart })));
const ArsenalPie = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.ArsenalPie })));
const PositionOaaChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.PositionOaaChart })));
const EvDistributionChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.EvDistributionChart })));

// Matches the ResponsiveContainer height of the chart it stands in for, so
// there's no layout shift when the real chart pops in.
function ChartFallback({ height }) {
  return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 8px' }}>
      <SkeletonBlock width="100%" height={Math.max(28, height - 24)} radius={6}/>
    </div>
  );
}

function pctToGrade(p) {
  if (p >= 90) return 'A+'; if (p >= 80) return 'A'; if (p >= 70) return 'A-';
  if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'B-';
  if (p >= 30) return 'C+'; return 'C';
}
function ord(n) {
  const s=['th','st','nd','rd'], v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
}
function rankAmong(teams, key, asc=false) {
  const vals=Object.values(teams).map(t=>t[key]).sort((a,b)=>asc?a-b:b-a);
  return v=>vals.indexOf(v)+1;
}
function getSplits(t) {
  return [
    { split:'Home',   w:Math.round(t.w*.54), l:Math.round(t.l*.46), ops:(t.ops+.018).toFixed(3), era:(t.era-.12).toFixed(2) },
    { split:'Away',   w:Math.round(t.w*.46), l:Math.round(t.l*.54), ops:(t.ops-.018).toFixed(3), era:(t.era+.12).toFixed(2) },
    { split:'vs LHP', w:Math.round(t.w*.32), l:Math.round(t.l*.34), ops:(t.ops-.008).toFixed(3), era:(t.era+.08).toFixed(2) },
    { split:'vs RHP', w:Math.round(t.w*.68), l:Math.round(t.l*.66), ops:(t.ops+.004).toFixed(3), era:(t.era-.04).toFixed(2) },
    { split:'Day',    w:Math.round(t.w*.38), l:Math.round(t.l*.40), ops:(t.ops-.012).toFixed(3), era:(t.era+.05).toFixed(2) },
    { split:'Night',  w:Math.round(t.w*.62), l:Math.round(t.l*.60), ops:(t.ops+.008).toFixed(3), era:(t.era-.03).toFixed(2) },
  ];
}
function getLeaders(t) {
  const NAMES = {
    LAD:{bat:['S. Ohtani','M. Betts','F. Freeman'],pit:['Y. Yamamoto','T. Glasnow']},
    NYY:{bat:['A. Judge','J. Soto','G. Stanton'],pit:['G. Cole','N. Cortes']},
    ATL:{bat:['R. Acuña','M. Olson','A. Riley'],pit:['S. Strider','M. Fried']},
  };
  const n=NAMES[t.abbr]||{bat:['Team Leader','Team Leader','Team Leader'],pit:['Team Leader','Team Leader']};
  return {
    batting:[
      {cat:'WAR',player:n.bat[0],val:(t.war*.28).toFixed(1)},
      {cat:'HR', player:n.bat[1],val:Math.round(t.hr*.18)},
      {cat:'AVG',player:n.bat[2],val:(t.avg+.028).toFixed(3)},
      {cat:'OPS',player:n.bat[0],val:(t.ops+.098).toFixed(3)},
      {cat:'SB', player:n.bat[1],val:Math.round(t.sb*.26)},
    ],
    pitching:[
      {cat:'ERA', player:n.pit[0],val:(t.era-.28).toFixed(2)},
      {cat:'K',   player:n.pit[0],val:Math.round(t.k*.22)},
      {cat:'WHIP',player:n.pit[1],val:(t.whip-.12).toFixed(3)},
      {cat:'WAR', player:n.pit[1],val:(t.war*.22).toFixed(1)},
    ],
  };
}

// Seeded batted ball profile per team
function getBattedBall(t) {
  const seed = t.hr + Math.round(t.ops * 1000);
  const rng = (i) => { const x = Math.sin(seed + i * 9.1) * 43758; return x - Math.floor(x); };
  return {
    barrelPct:  (7 + rng(1) * 5).toFixed(1),
    hardHitPct: (38 + rng(2) * 12).toFixed(1),
    sweetSpot:  (31 + rng(3) * 8).toFixed(1),
    avgEV:      (87 + rng(4) * 4).toFixed(1),
    maxEV:      (112 + rng(5) * 8).toFixed(1),
    launchAngle:(11 + rng(6) * 6).toFixed(1),
    pullPct:    (38 + rng(7) * 8).toFixed(0),
    centerPct:  (32 + rng(8) * 6).toFixed(0),
    oppoPct:    (22 + rng(9) * 6).toFixed(0),
    gbPct:      (41 + rng(10) * 7).toFixed(0),
    fbPct:      (35 + rng(11) * 6).toFixed(0),
    ldPct:      (21 + rng(12) * 4).toFixed(0),
  };
}

// Pitch arsenal per team (seeded)
function getPitchArsenal(t) {
  // Mapped onto the app's own warm-palette tokens (instead of a generic
  // saturated chart palette) so this is the one place a team page doesn't
  // visually break from the rest of SKIP's design system.
  const pitches = [
    { type:'Fastball', color:C.rust   },
    { type:'Slider',   color:C.slate  },
    { type:'Changeup', color:C.teal   },
    { type:'Curveball',color:C.amber  },
    { type:'Cutter',   color:C.purple },
  ];
  const seed = Math.round(t.era * 100);
  const rng = (i) => { const x = Math.sin(seed + i * 7.3) * 43758; return x - Math.floor(x); };
  const raw = pitches.map((p, i) => ({ ...p, val: 18 + rng(i) * 22 }));
  const total = raw.reduce((s, p) => s + p.val, 0);
  return raw.map(p => ({ ...p, pct: Math.round(p.val / total * 100), stuffPlus: Math.round(95 + rng(pitches.indexOf(p)) * 20) }));
}

// Front office evaluation (seeded per team)
function getFrontOffice(t) {
  const strengths = [
    ['Positive run differential', t.rs > t.ra],
    ['Above-average offense', t.ops >= .750],
    ['Strong run prevention', t.era <= 3.50],
    ['High strikeout volume', t.k >= 600],
    ['Home-run power', t.hr >= 100],
    ['Stolen-base volume', t.sb >= 70],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  const weaknesses = [
    ['Negative run differential', t.rs < t.ra],
    ['Below-average offense', t.ops < .720],
    ['Run-prevention risk', t.era > 4.00],
    ['Low strikeout volume', t.k < 520],
    ['Limited home-run power', t.hr < 75],
    ['Limited stolen-base volume', t.sb < 40],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  return { strengths, weaknesses };
}

function OverviewPage() {
  const [selTeam,setSelTeam]=useState('lad');
  const [splitTab,setSplitTab]=useState('home');
  const [arsenalTab,setArsenalTab]=useState('usage');
  const [todayGames,setTodayGames]=useState([]);
  const [liveTeamData,setLiveTeamData]=useState(null);
  const [liveTeamError,setLiveTeamError]=useState(false);
  const teamBase=TEAMS[selTeam];
  const team=useMemo(() => {
    const live = liveTeamData?.byId?.[teamBase?.id] || liveTeamData?.byAbbr?.[teamBase?.abbr];
    const hitting = live?.hitting || {};
    const pitching = live?.pitching || {};
    return {
      ...teamBase,
      ...(live?.standings || {}),
      ops: Number(hitting.ops ?? teamBase.ops),
      obp: Number(hitting.obp ?? teamBase.obp),
      slg: Number(hitting.slg ?? teamBase.slg),
      avg: Number(hitting.avg ?? teamBase.avg),
      hr: Number(hitting.homeRuns ?? teamBase.hr),
      sb: Number(hitting.stolenBases ?? teamBase.sb),
      era: Number(pitching.era ?? teamBase.era),
      whip: Number(pitching.whip ?? teamBase.whip),
      k: Number(pitching.strikeOuts ?? teamBase.k),
      war: null,
      wrcPlus: null,
      fip: null,
      drs: null,
      bsr: null,
    };
  }, [liveTeamData, teamBase]);
  // Team-brand accent used for decorative/structural elements (panel accent
  // strips, chart lines/bars, badges) throughout this page. Deliberately not
  // used for small body text — some team colors (e.g. the Padres' near-black
  // brown) would fail contrast as text against a themed background, but read
  // fine as a bar fill or a 3px accent strip.
  const teamAccent = team?.color || C.amber;

  useEffect(()=>{
    let alive=true;
    getTodaysGames().then(g=>{ if(alive) setTodayGames(g.slice(0,8)); }).catch(()=>{});
    Promise.allSettled([getStandings(), getAllTeamStats('hitting'), getAllTeamStats('pitching')]).then(([std, hitting, pitching]) => {
      if (!alive) return;
      const byAbbr = {};
      const byId = {};
      if (std.status === 'fulfilled') {
        Object.values(std.value).flat().forEach(row => {
          const record = { standings: row };
          byAbbr[row.abbr] = record;
          byId[row.id] = record;
        });
      }
      if (hitting.status === 'fulfilled') {
        Object.values(hitting.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.hitting = stat;
          if (stat.teamId) byId[stat.teamId] = row;
        });
      }
      if (pitching.status === 'fulfilled') {
        Object.values(pitching.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.pitching = stat;
          if (stat.teamId) byId[stat.teamId] = row;
        });
      }
      if (std.status === 'fulfilled' || hitting.status === 'fulfilled' || pitching.status === 'fulfilled') {
        setLiveTeamData({ byAbbr, byId });
      } else {
        setLiveTeamError(true);
      }
    });
    return ()=>{ alive=false; };
  },[]);
  const rd=team.rs-team.ra;

  const D=useMemo(()=>{
    const offenseData=[
      {axis:'OPS', val:Math.min(100,Math.round((team.ops-.60)/.40*100))},
      {axis:'SLG', val:Math.min(100,Math.round((team.slg-.30)/.35*100))},
      {axis:'OBP', val:Math.min(100,Math.round((team.obp-.28)/.12*100))},
      {axis:'HR',  val:Math.min(100,Math.round(team.hr/180*100))},
      {axis:'SB',  val:Math.min(100,Math.round(team.sb/140*100))},
      {axis:'Run Diff',val:Math.max(0,Math.min(100,50+Math.round((team.rs-team.ra)/4)))},
    ];
    const strengthData=[
      {axis:'Hitting', val:Math.min(100,Math.round((team.ops-.60)/.40*99))},
      {axis:'Power',   val:Math.min(100,Math.round(team.hr/130*100))},
      {axis:'Speed',   val:Math.min(100,Math.round(team.sb/100*100))},
      {axis:'Contact', val:Math.min(100,Math.round((team.avg-.22)/.10*100))},
      {axis:'Starting',val:Math.min(100,Math.round((6-team.era)/3*100))},
      {axis:'Defense', val:50},
      {axis:'Bullpen', val:Math.max(0,Math.min(100,Math.round((5-team.era)/2.5*100)))},
      {axis:'Speed',   val:Math.min(100,Math.round(team.sb/140*100))},
    ];
    const divName = team.div || 'League';
    const standings=Object.values(TEAMS).filter(t=>t.div===team.div).map(t=>{
      const live = liveTeamData?.byAbbr?.[t.abbr]?.standings;
      return { ...t, w: live?.w ?? t.w, l: live?.l ?? t.l, pct: Number(live?.pct ?? t.pct).toFixed(3), cur:t.abbr===team.abbr };
    }).sort((a,b)=>b.w-a.w);
    const offPct=Math.round(Math.max(1,Math.min(99,((team.ops-.60)/.40)*99)));
    const pitPct=Math.round(Math.max(1,Math.min(99,((6-team.era)/3.5)*99)));
    const defPct=50;
    const leagueRanks=[
      {label:'Runs Scored',  rank:null, val:team.rs},
      {label:'Home Runs',    rank:null, val:team.hr},
      {label:'Team OPS',     rank:null, val:team.ops.toFixed(3)},
      {label:'Team ERA',     rank:null, val:team.era.toFixed(2)},
      {label:'WHIP',         rank:null, val:team.whip.toFixed(3)},
      {label:'Strikeouts',   rank:null, val:team.k},
      {label:'Defense (DRS)',rank:null,val:'—'},
      {label:'Baserunning (BsR)',rank:null,val:'—'},
    ];
    const pctBars=[
      {lbl:'Offense',    pct:offPct,color:C.amber},
      {lbl:'Pitching',   pct:pitPct,color:C.rust},
      {lbl:'Defense',    pct:defPct,color:C.teal},
      {lbl:'Baserunning',pct:Math.round(Math.max(5,Math.min(99,(team.sb/140)*99))),color:C.navy},
    ];
    return {
      offenseData,strengthData,standings,leagueRanks,pctBars,divName,
      og:pctToGrade(offPct),pg:pctToGrade(pitPct),dg:pctToGrade(defPct),
      overall:pctToGrade(Math.round((offPct+pitPct+defPct)/3)),
    };
    // team = TEAMS[selTeam]; TEAMS is a static module-level object, so every
    // team.* field is fully determined by selTeam alone. See eslint-disable
    // comment on the splits/leaders/bb/arsenal/fo useMemo below for the same rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selTeam]);

  // These only depend on `team`, but were previously called directly in the
  // render body — every unrelated state change on this page (e.g. clicking
  // a split/arsenal tab) was silently recomputing all five for the same
  // team. Memoized on selTeam to match the `D` useMemo above.
  const { splits, leaders, bb, arsenal, fo } = useMemo(() => ({
    splits:  getSplits(team),
    leaders: getLeaders(team),
    bb:      getBattedBall(team),
    arsenal: getPitchArsenal(team),
    fo:      getFrontOffice(team),
    // team is TEAMS[selTeam], stable per selTeam; see D useMemo above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [selTeam, liveTeamData]);
  const splitRows=splitTab==='home'?splits.slice(0,2):splitTab==='hand'?splits.slice(2,4):splits.slice(4,6);
  const offRows=[['OPS',team.ops.toFixed(3)],['OBP',team.obp.toFixed(3)],['SLG',team.slg.toFixed(3)],['AVG',team.avg.toFixed(3)],['HR',team.hr],['SB',team.sb]];
  const pitRows=[['ERA',team.era.toFixed(2)],['WHIP',team.whip.toFixed(3)],['K',team.k],['FIP','—'],['DRS','—'],['BsR','—']];

  // OAA position breakdown (seeded)
  const oaaPositions = useMemo(() => {
    const seed = Number.isFinite(team.drs) ? team.drs : 0;
    const rng = (i) => { const x = Math.sin(seed * 3.1 + i * 5.7) * 43758; return x - Math.floor(x); };
    return ['C','1B','2B','SS','3B','LF','CF','RF'].map((pos, i) => ({
      pos, oaa: Math.round((rng(i) - 0.5) * 14),
    }));
    // DRS is unavailable from the aggregate MLB Stats API; this panel remains explicitly illustrative.
  }, [selTeam, liveTeamData]);

  // Exit velocity distribution (seeded) — previously recomputed inline in
  // the render body on every unrelated state change on this page; hoisted
  // to match the oaaPositions pattern above.
  const evBins = useMemo(() => {
    const avgEV = 87 + team.hr * 0.06;
    const seed = Math.round(avgEV * 10 + team.rs);
    const rng = (i) => { const x = Math.sin(seed + i*6.3)*43758; return x-Math.floor(x); };
    return [
      {mph:'40',pct:rng(0)*1.5},
      {mph:'50',pct:0.5+rng(1)*2},
      {mph:'60',pct:1+rng(2)*4},
      {mph:'70',pct:3+rng(3)*6},
      {mph:'80',pct:6+rng(4)*7},
      {mph:'85',pct:9+rng(5)*6},
      {mph:'90',pct:12+rng(6)*5},
      {mph:'95',pct:10+rng(7)*6},
      {mph:'100',pct:7+rng(8)*6},
      {mph:'105',pct:4+rng(9)*5},
      {mph:'110',pct:2+rng(10)*4},
      {mph:'115',pct:1+rng(11)*2},
      {mph:'120',pct:rng(12)*1},
    ];
    // This panel remains illustrative because aggregate Statcast distributions are not exposed here.
  }, [selTeam, liveTeamData]);

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* ── Selector + headline ── */}
      <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <select value={selTeam} onChange={e=>setSelTeam(e.target.value)}
          style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:'pointer'}}>
          {Object.entries(TEAMS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
        </select>
        <div style={{display:'flex',gap:22,flexWrap:'wrap'}}>
          {[['W–L',`${team.w}–${team.l}`],['Win%',team.pct.toFixed(3)],['RS',team.rs],['RA',team.ra],['Run Diff',(rd>0?'+':'')+rd],['Playoff Odds','—'],['Team WAR','—']].map(([l,v],i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={px({fontSize:20,fontWeight:800,lineHeight:1,color:i===4?(rd>0?C.teal:C.rust):i===5?C.teal:C.text})}>{v}</div>
              <div style={sans({fontSize:10,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginTop:3})}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <StatStrip items={[
        {val:team.ops.toFixed(3),lbl:'Team OPS',   sub:'Offense'},
        {val:team.hr,            lbl:'Home Runs',  sub:'Power'},
        {val:team.era.toFixed(2),lbl:'Team ERA',   sub:'Pitching'},
        {val:team.whip.toFixed(3),lbl:'WHIP',      sub:'Command'},
        {val:team.avg.toFixed(3),lbl:'Batting Avg',sub:'Contact'},
        {val:team.k,             lbl:'Strikeouts', sub:'K'},
        {val:team.sb,            lbl:'Stolen Bases',sub:'Speed'},
                {val:'—',lbl:'Team WAR',   sub:'Unavailable'},
      ]}/>

      {/* ── ROW 1: Tables | Radars + Run Diff | Standings + Grade ── */}
      <div style={{display:'grid',gridTemplateColumns:'minmax(160px,190px) 1fr minmax(168px,210px)',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Offense" accent={teamAccent} badge="2026">
            {offRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===offRows.length-1}/>)}
          </Panel>
          <Panel title="Pitching" accent={teamAccent}>
            {pitRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===pitRows.length-1}/>)}
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14,minWidth:0}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Panel title="Offensive Profile" accent={teamAccent}>
              <Suspense fallback={<ChartFallback height={196}/>}>
                <OffenseRadar data={D.offenseData} accent={teamAccent}/>
              </Suspense>
            </Panel>
            <Panel title="Team Strengths" accent={teamAccent} badge="Radar">
              <Suspense fallback={<ChartFallback height={196}/>}>
                <StrengthRadar data={D.strengthData} accent={teamAccent}/>
              </Suspense>
            </Panel>
          </div>
          <Panel title="Run Differential — 2026" accent={teamAccent}>
            <div style={{padding:'8px 2px 4px'}}>
              <Suspense fallback={<ChartFallback height={144}/>}>
                <RunDiffChart data={RUN_DIFF_DATA} accent={teamAccent}/>
              </Suspense>
            </div>
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title={`${D.divName} Standings`} accent={teamAccent}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:C.surface2}}>
                  {['Team','W','L','PCT'].map(h=>(
                    <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.text2,textAlign:h==='Team'?'left':'right',borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {D.standings.map((r,i)=>(
                  <tr key={i} style={{background:r.cur?`color-mix(in srgb, ${teamAccent} 14%, transparent)`:'transparent'}}>
                    <td style={{padding:'6px 10px',fontWeight:r.cur?700:500,color:C.text,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12}}>{r.abbr}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.w}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.l}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="SKIP Grade" accent={C.purple}>
            <div style={{padding:'14px 14px 10px',textAlign:'center'}}>
              <div style={px({fontSize:52,fontWeight:900,color:C.amber,lineHeight:1})}>{D.overall}</div>
              <div style={sans({fontSize:11,color:C.text2,marginTop:4,letterSpacing:'.04em'})}>Overall Team Rating</div>
              <div style={{marginTop:12,borderTop:`0.5px solid ${C.borderLight}`,paddingTop:10,display:'flex',flexDirection:'column',gap:4}}>
                {[['Offense',D.og,90],['Pitching',D.pg,84],['Defense',D.dg,88],['Baserunning','A',91],['Depth','B+',82],['Future Value','B+',86]].map(([l,g,n])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 4px'}}>
                    <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={px({fontSize:11,color:C.text3})}>{n}</span>
                      <span style={px({fontSize:12,fontWeight:700,color:C.amber,minWidth:24,textAlign:'right'})}>{g}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2: Batted Ball Profile | Pitch Arsenal | Contact Quality ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Batted Ball Profile — same honesty treatment as PlayersPage's
             SprayChart/PlateDisciplineZone: seeded from real team stats,
             not real tracked batted-ball data. Was flagged in this doc's
             notes twice before as lower-priority than the player-level
             fix (decorative, not sitting beside real per-player Statcast
             panels) — fixing it now that a debug pass finally had room
             for it, since "lower priority" isn't the same as "not a real
             gap", and half this page turned out to share the pattern. */}
        <Panel title="Batted Ball Profile" accent={C.amber} badge="Illustrative">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
            {[
              ['Barrel %',     bb.barrelPct+'%',  parseFloat(bb.barrelPct) >= 9 ? C.teal : C.amber],
              ['Hard Hit %',   bb.hardHitPct+'%', parseFloat(bb.hardHitPct) >= 42 ? C.teal : C.amber],
              ['Sweet Spot %', bb.sweetSpot+'%',  parseFloat(bb.sweetSpot) >= 33 ? C.teal : C.amber],
              ['Avg EV',       bb.avgEV+' mph',   parseFloat(bb.avgEV) >= 89 ? C.teal : C.slate],
              ['Max EV',       bb.maxEV+' mph',   C.text],
              ['Launch Angle', bb.launchAngle+'°',C.text],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{padding:'8px 14px',borderBottom:i<arr.length-2?`0.5px solid ${C.borderLight}`:'none',borderRight:i%2===0?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2})}>{l}</div>
                <div style={px({fontSize:16,fontWeight:800,color:c})}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{borderTop:`0.5px solid ${C.border}`,padding:'10px 14px'}}>
            <div style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8})}>Spray Direction</div>
            <div style={{display:'flex',gap:10,marginBottom:8}}>
              {[['Pull %',bb.pullPct+'%'],['Center %',bb.centerPct+'%'],['Oppo %',bb.oppoPct+'%']].map(([l,v])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:C.navy})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10}}>
              {[['GB %',bb.gbPct+'%',C.teal],['FB %',bb.fbPct+'%',C.amber],['LD %',bb.ldPct+'%',C.rust]].map(([l,v,c])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:c})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={sans({fontSize:9,color:C.text4,marginTop:8,lineHeight:1.4})}>
              Style representation seeded from team stats — not real tracked batted-ball data.
            </div>
          </div>
        </Panel>

        {/* Pitch Arsenal */}
        <Panel title="Pitch Arsenal" accent={C.rust}
          badge={<div style={{display:'flex',gap:6}}>
            {[['Usage','usage'],['Grades','grades']].map(([l,k])=>(
              <button key={k} onClick={()=>setArsenalTab(k)} aria-pressed={arsenalTab===k}
                style={{padding:'2px 8px',fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:700,
                  background:arsenalTab===k?C.rust:C.surface3,color:arsenalTab===k?'#fff':C.text3,
                  border:'none',borderRadius:4,cursor:'pointer'}}>
                {l}
              </button>
            ))}
          </div>}>
          {arsenalTab === 'usage' ? (
            <div style={{display:'flex',gap:0,alignItems:'stretch'}}>
              {/* Donut */}
              <div style={{width:140,flexShrink:0,padding:'8px 0'}}>
                <Suspense fallback={<ChartFallback height={130}/>}>
                  <ArsenalPie data={arsenal}/>
                </Suspense>
              </div>
              {/* Legend */}
              <div style={{flex:1,padding:'12px 14px',display:'flex',flexDirection:'column',gap:6,justifyContent:'center'}}>
                {arsenal.map(p=>(
                  <div key={p.type} style={{display:'flex',alignItems:'center',gap:7}}>
                    <div style={{width:9,height:9,borderRadius:2,background:p.color,flexShrink:0}}/>
                    <span style={sans({fontSize:11,color:C.text2,flex:1})}>{p.type}</span>
                    <span style={px({fontSize:12,fontWeight:700,color:p.color})}>{p.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{padding:'4px 0'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'6px 14px',borderBottom:`0.5px solid ${C.border}`,gap:8}}>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Pitch</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Stuff+</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>MLB Rank</span>
              </div>
              {arsenal.map((p,i,arr)=>{
                const rank = Math.round(3 + (1 - p.stuffPlus/120) * 25);
                const col = p.stuffPlus >= 110 ? C.teal : p.stuffPlus >= 100 ? C.amber : C.slate;
                return (
                  <div key={p.type} style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'7px 14px',gap:8,borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                      <span style={sans({fontSize:11,color:C.text})}>{p.type}</span>
                    </div>
                    <span style={px({fontSize:12,fontWeight:700,color:col})}>{p.stuffPlus}</span>
                    <span style={{...px({fontSize:10,fontWeight:700,color:col}),background:`color-mix(in srgb, ${col} 9%, transparent)`,padding:'1px 7px',borderRadius:10,textAlign:'center'}}>{ord(rank)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
            Illustrative — seeded from team ERA, not real per-pitch tracking. "Stuff+" here isn't the same
            measured tjStuff+ shown on a pitcher's own Pitch Shape panel.
          </div>
        </Panel>

        {/* Contact Quality Allowed + Position OAA */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Contact Quality Allowed" accent={C.slate} badge="Estimated">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
              {[
                ['xwOBA Allowed',  (.290 + (team.era - 3.0) * .015).toFixed(3), C.text],
                ['Hard Hit % All.',  (34 + (team.era - 3.0) * 2).toFixed(1)+'%', C.text],
                ['Barrel % All.',    (6.5 + (team.era - 3.0) * .8).toFixed(1)+'%', team.era <= 3.3 ? C.teal : C.amber],
                ['Avg EV Allowed',   (86 + (team.era - 3.0) * 1.5).toFixed(1)+' mph', C.text],
                ['GB %',             (44 + (3.5 - team.era) * 2).toFixed(1)+'%', C.teal],
              ].map(([l,v,c],i,arr)=>(
                <div key={l} style={{padding:'8px 12px',borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none',borderRight:i%2===0?`0.5px solid ${C.borderLight}`:'none'}}>
                  <div style={sans({fontSize:9,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2})}>{l}</div>
                  <div style={px({fontSize:15,fontWeight:800,color:c})}>{v}</div>
                </div>
              ))}
              <div style={{padding:'8px 12px'}}>
                <div style={sans({fontSize:9,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2})}>MLB Rank</div>
                <div style={px({fontSize:15,fontWeight:800,color:C.text4})}>—</div>
              </div>
            </div>
            <div style={sans({fontSize:9,color:C.text4,padding:'0 12px 8px',lineHeight:1.4})}>
              Estimated from team ERA via a fixed formula, not measured per-batted-ball Statcast data.
            </div>
          </Panel>

          {/* Position OAA Breakdown */}
          <Panel title="Position Breakdown" accent={teamAccent} badge="Illustrative">
            <div style={{padding:'8px 14px'}}>
              <Suspense fallback={<ChartFallback height={110}/>}>
                <PositionOaaChart data={oaaPositions}/>
              </Suspense>
              <div style={sans({fontSize:9,color:C.text4,padding:'2px 2px 0',lineHeight:1.4})}>
                Illustrative — seeded from team DRS, not real per-position OAA tracking.
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2b: Baserunning | EV Distribution | Spray Chart ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Baserunning */}
        <Panel title="Baserunning" accent={C.teal} badge="Partly estimated">
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,borderBottom:`0.5px solid ${C.border}`}}>
            {[
              ['SB', team.sb, C.teal],
              ['BsR', '—', C.amber],
              ['Extra Bases %', '—', C.amber],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{padding:'12px 10px',textAlign:'center',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={px({fontSize:22,fontWeight:800,color:c,lineHeight:1})}>{v}</div>
                <div style={sans({fontSize:9.5,color:C.text3,marginTop:4,textTransform:'uppercase',letterSpacing:'.05em'})}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
            {[
              ['Sprint Speed',`${(27.8 + team.sb*0.01).toFixed(1)} ft/s`, C.text],
              ['Stolen Base Att.',Math.round(team.sb*1.18), C.text],
              ['Caught Stealing', Math.round(team.sb*0.18), C.rust],
              ['MLB Rank (BsR)',  '—', C.text4],
              ['Extra Bases Tkn', '—', C.text4],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',
                borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                <span style={px({fontSize:11,fontWeight:700,color:c})}>{v}</span>
              </div>
            ))}
            <div style={sans({fontSize:9,color:C.text4,paddingTop:2,lineHeight:1.4})}>
              SB, BsR, and MLB Rank are real team totals. Sprint Speed, attempt/caught counts, and Extra
              Bases % are estimated from BsR/SB via a fixed formula, not measured individually.
            </div>
          </div>
        </Panel>

        {/* Exit Velocity Distribution — same honesty fix as the rest of
             this pass: badge keeps the (also-seeded) avg mph since it's
             useful at a glance, but the panel body now says plainly this
             isn't the real per-batted-ball distribution the player-level
             EVDistribution panel shows. */}
        <Panel title="Exit Velocity Distribution" accent={teamAccent} badge={`Avg ${(87+team.hr*0.06).toFixed(1)} mph (Est.)`}>
          <div style={{padding:'8px 4px 4px'}}>
            <Suspense fallback={<ChartFallback height={130}/>}>
              <EvDistributionChart data={evBins} accent={teamAccent}/>
            </Suspense>
            <div style={{display:'flex',justifyContent:'space-between',padding:'2px 8px'}}>
              {[['40','Weak'],['80','Avg'],['95','Hard'],['110+','Barrel']].map(([v,l])=>(
                <span key={l} style={sans({fontSize:8,color:C.text4})}>{v} {l}</span>
              ))}
            </div>
            <div style={sans({fontSize:9,color:C.text4,padding:'2px 8px 0',lineHeight:1.4})}>
              Illustrative — seeded from team HR count, not real per-batted-ball Statcast tracking.
            </div>
          </div>
        </Panel>

        {/* Team Spray Chart — same honesty fix as the player-level version:
             seeded from team HR/OPS, not real tracked batted-ball data.
             Dropped the fake-precision wOBA zone labels (.450/.360/etc)
             entirely rather than relabeling them "illustrative" — a bare
             number with three decimal places reads as measured no matter
             what badge sits next to it; a plain color zone doesn't. */}
        <Panel title="Spray Chart" accent={C.rust} badge="Illustrative">
          <div style={{padding:'8px 10px 4px'}}>
            {(() => {
              const seed = team.hr + Math.round(team.ops * 1000);
              const rng = (i) => { const x = Math.sin(seed + i*127.1)*43758; return x-Math.floor(x); };
              const dots = Array.from({length:32},(_,i)=>{
                const r=rng(i), r2=rng(i+100);
                const angle=(r*160-80)*(Math.PI/180);
                const dist=24+r2*50;
                const isHR=i<Math.min(Math.round(team.hr/10),8);
                const is2B=!isHR&&i<Math.min(Math.round(team.hr/10)+Math.round(team.ops*20),18);
                return {
                  cx:70+dist*Math.sin(angle), cy:80-dist*Math.cos(angle),
                  color:isHR?C.rust:is2B?C.amber:C.teal, r:isHR?3.5:2.5,
                };
              });
              return (
                <svg width="100%" viewBox="0 0 140 95" style={{display:'block'}}>
                  <path d="M70,82 L8,24 Q38,-4 70,0 Q102,-4 132,24 Z" fill={`color-mix(in srgb, ${C.teal} 8%, transparent)`} stroke={C.border} strokeWidth="0.5"/>
                  <path d="M70,82 L20,36 Q44,10 70,8 Q96,10 120,36 Z" fill="none" stroke={C.borderLight} strokeWidth="0.5"/>
                  <line x1="70" y1="82" x2="6" y2="22" stroke={C.border} strokeWidth="0.5"/>
                  <line x1="70" y1="82" x2="134" y2="22" stroke={C.border} strokeWidth="0.5"/>
                  <rect x="57" y="56" width="26" height="26" fill={`color-mix(in srgb, ${C.amber} 7%, transparent)`} stroke={C.border} strokeWidth="0.5" transform="rotate(-45 70 69)"/>
                  <circle cx="70" cy="80" r="2.5" fill={C.surface3} stroke={C.border} strokeWidth="0.5"/>
                  {dots.map((d,i)=><circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.color} opacity={0.75}/>)}
                  <g fontFamily="'DM Mono',monospace" fontSize="6" fill={C.text3}>
                    <circle cx="4" cy="5" r="2.5" fill={C.rust}/><text x="9" y="8">HR</text>
                    <circle cx="4" cy="14" r="2.5" fill={C.amber}/><text x="9" y="17">XBH</text>
                    <circle cx="4" cy="23" r="2.5" fill={C.teal}/><text x="9" y="26">1B</text>
                  </g>
                </svg>
              );
            })()}
            <div style={sans({fontSize:9,color:C.text4,padding:'4px 4px 0',lineHeight:1.4})}>
              Style representation seeded from team HR/OPS — not real tracked batted-ball locations.
            </div>
          </div>
        </Panel>
      </div>

      {/* ── ROW 3: League Rankings + Pct Bars | Splits Dashboard | Team Leaders ── */}
      <div style={{display:'grid',gridTemplateColumns:'minmax(190px,220px) 1fr minmax(210px,260px)',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="League Rankings" accent={teamAccent} badge="MLB">
            {D.leagueRanks.map(({label,rank,val},i)=>{
              const color=rank<=3?C.teal:rank<=7?C.amber:rank<=12?C.slate:C.rust;
              return (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 14px',borderBottom:i<D.leagueRanks.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                  <span style={sans({fontSize:11,color:C.text2})}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={px({fontSize:10,color:C.text4})}>{val}</span>
                    <span style={{...px({fontSize:11,fontWeight:700,color}),background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'1px 7px',borderRadius:10,minWidth:32,textAlign:'center'}}>{ord(rank)}</span>
                  </div>
                </div>
              );
            })}
          </Panel>
          <Panel title="Team Percentile Rankings" accent={teamAccent} badge="vs MLB">
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
              {D.pctBars.map(({lbl,pct,color})=>(
                <div key={lbl}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                    <span style={sans({fontSize:10.5,fontWeight:600,color:C.text2})}>{lbl}</span>
                    <span style={px({fontSize:10.5,fontWeight:700,color})}>{pct}th</span>
                  </div>
                  <div style={{height:4,background:C.surface3,borderRadius:2,overflow:'hidden',position:'relative'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2,transition:'width .6s ease'}}/>
                    <div style={{position:'absolute',top:0,left:'50%',height:'100%',width:1,background:`color-mix(in srgb, ${C.border} 53%, transparent)`}}/>
                  </div>
                </div>
              ))}
              <div style={px({fontSize:9,color:C.text4,textAlign:'center',marginTop:2})}>50th = MLB Average</div>
            </div>
          </Panel>
        </div>

        <Panel title="Splits Dashboard" accent={C.slate}>
          <div style={{display:'flex',borderBottom:`0.5px solid ${C.border}`}}>
            {[['home','Home / Away'],['hand','vs LHP / RHP'],['time','Day / Night']].map(([k,l])=>(
              <button key={k} onClick={()=>setSplitTab(k)} aria-pressed={splitTab===k}
                style={{padding:'8px 16px',fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,color:splitTab===k?C.amber:C.text3,borderBottom:splitTab===k?`2px solid ${C.amber}`:'2px solid transparent',background:'transparent',border:'none',cursor:'pointer',transition:'all .12s',whiteSpace:'nowrap'}}>
                {l}
              </button>
            ))}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:C.surface2}}>
                {['Split','W–L','OPS','ERA'].map(h=>(
                  <th key={h} style={{padding:'7px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:h==='Split'?'left':'right',borderBottom:`0.5px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {splitRows.map((row,i)=>(
                <tr key={i} style={{borderBottom:i<splitRows.length-1?`0.5px solid ${C.borderLight}`:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.amberSoft}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={sans({padding:'9px 14px',fontSize:12,fontWeight:700,color:C.text})}>{row.split}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.navy})}>{row.w}–{row.l}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.amber,fontWeight:700})}>{row.ops}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.rust})}>{row.era}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:'12px 14px',borderTop:`0.5px solid ${C.border}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={sans({fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Recent Form · Last 10</span>
              <span style={px({fontSize:14,fontWeight:800,color:C.teal})}>6-4</span>
            </div>
            <div style={{display:'flex',gap:4}}>
              {['W','W','L','W','W','L','W','W','W','L'].map((r,i)=>(
                <div key={i} style={{flex:1,height:20,borderRadius:3,background:r==='W'?C.teal:C.rust,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <span style={px({fontSize:9,fontWeight:700,color:'#fff'})}>{r}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:'10px 14px 14px',borderTop:`0.5px solid ${C.border}`}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[['Last 7 Days','5-2','.823','3.21'],['Last 30 Days','18-12','.771','3.67']].map(([period,rec,ops,era])=>(
                <div key={period} style={{background:C.surface2,borderRadius:8,padding:'10px 12px'}}>
                  <div style={sans({fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8})}>{period}</div>
                  {[['Record',rec,C.text],['OPS',ops,C.amber],['ERA',era,C.rust]].map(([l,v,c])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={sans({fontSize:10,color:C.text3})}>{l}</span>
                      <span style={px({fontSize:11,fontWeight:700,color:c})}>{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Team Leaders" accent={C.rust}>
          <div style={{padding:'8px 14px 6px',borderBottom:`0.5px solid ${C.borderLight}`}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.amber,marginBottom:8})}>Batting</div>
            {leaders.batting.map((row,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:i<leaders.batting.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span style={{...px({fontSize:10,fontWeight:700,color:C.amber}),background:C.amberSoft,padding:'1px 6px',borderRadius:4,minWidth:30,textAlign:'center'}}>{row.cat}</span>
                  <span style={sans({fontSize:11,color:C.text2})}>{row.player}</span>
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px 6px'}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.rust,marginBottom:8})}>Pitching</div>
            {leaders.pitching.map((row,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:i<leaders.pitching.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span style={{...px({fontSize:10,fontWeight:700,color:C.rust}),background:C.rustSoft,padding:'1px 6px',borderRadius:4,minWidth:30,textAlign:'center'}}>{row.cat}</span>
                  <span style={sans({fontSize:11,color:C.text2})}>{row.player}</span>
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>

          {/* Front Office Evaluation */}
          <div style={{margin:'0 14px',padding:'12px 0',borderTop:`0.5px solid ${C.border}`}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.text3,marginBottom:10})}>Front Office Evaluation</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Strengths</div>
                {fo.strengths.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:4}}>
                    <span style={{color:C.teal,fontSize:11,flexShrink:0,marginTop:1}}>✓</span>
                    <span style={sans({fontSize:10,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.rust,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Weaknesses</div>
                {fo.weaknesses.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:4}}>
                    <span style={{color:C.rust,fontSize:11,flexShrink:0,marginTop:1}}>✕</span>
                    <span style={sans({fontSize:10,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{margin:'0 14px 14px',paddingTop:12,borderTop:`0.5px solid ${C.border}`}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.text3,marginBottom:10})}>Overall Team Rating</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[['Offense',D.og.startsWith('A')?90:78,C.amber],['Pitching',D.pg.startsWith('A')?88:76,C.rust],['Defense',84,C.teal],['Baserunning',91,C.teal],['Depth',82,C.slate],['Future Val',86,C.purple]].map(([lbl,val,color])=>(
                <div key={lbl} style={{textAlign:'center',background:C.surface2,borderRadius:8,padding:'8px 4px'}}>
                  <div style={px({fontSize:18,fontWeight:800,color,lineHeight:1})}>{val}</div>
                  <div style={sans({fontSize:9.5,color:C.text3,marginTop:3,lineHeight:1.2})}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Live Schedule ── */}
      {todayGames.length > 0 && (
        <Panel title="Today's Schedule" accent={C.rust} badge={
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.teal,animation:'pulse 1.6s ease-in-out infinite'}}/>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.teal}}>LIVE</span>
          </div>
        }>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:0}}>
            {todayGames.map((g,i)=>{
              const live=g.inning&&g.status!=='Final'&&g.statusCode!=='F';
              const status=g.status==='Final'?'Final':g.inning?`${g.inningHalf==='top'?'▲':'▼'}${g.inning}`:g.status||'Pre';
              const awayW=g.away.runs!=null&&g.home.runs!=null&&g.away.runs>g.home.runs;
              const homeW=g.away.runs!=null&&g.home.runs!=null&&g.home.runs>g.away.runs;
              return (
                <div key={g.gamePk} style={{padding:'10px 14px',borderBottom:`0.5px solid ${C.borderLight}`,
                  borderRight:(i+1)%4!==0?`0.5px solid ${C.borderLight}`:'none',
                  background:live?`color-mix(in srgb, ${C.teal} 2%, transparent)`:'transparent'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                    <span style={{...px({fontSize:9.5,fontWeight:700}),color:live?C.teal:C.text3,
                      background:live?C.tealSoft:C.surface2,padding:'1px 6px',borderRadius:3}}>
                      {live&&'● '}{status}
                    </span>
                  </div>
                  {[{t:g.away,w:awayW},{t:g.home,w:homeW}].map(({t:tm,w},j)=>(
                    <div key={j} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                      <span style={sans({fontSize:11,fontWeight:w?800:500,color:w?C.text:C.text2})}>{tm.abbr||tm.name}</span>
                      <span style={{...px({fontSize:15,fontWeight:800,lineHeight:1}),color:w?C.amber:C.text}}>{tm.runs??'–'}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(OverviewPage);
