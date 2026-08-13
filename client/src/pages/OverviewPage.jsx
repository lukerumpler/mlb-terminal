import React, { useState, useMemo, useEffect, memo, lazy, Suspense } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { TEAMS, RUN_DIFF_DATA } from '../constants/data.js';
import { getTodaysGames, getStandings, getAllTeamStats, getTeamPlayerStats } from '../api/mlb.js';
import { Panel, StatStrip, KVRow, SkeletonBlock } from '../components/atoms.jsx';
import { percentile } from '../lib/percentile.js';

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
  if (!Number.isFinite(Number(p))) return '—';
  if (p >= 90) return 'A+'; if (p >= 80) return 'A'; if (p >= 70) return 'A-';
  if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'B-';
  if (p >= 30) return 'C+'; return 'C';
}
function ord(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  const value = Number(n);
  const s=['th','st','nd','rd'], v=value%100;
  return value+(s[(v-20)%10]||s[v]||s[0]);
}
function percentileLabel(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const n = Math.round(Number(value));
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
}
function formatTeamMetric(value, digits = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}
function rankAmong(teams, key, asc=false) {
  const vals=Object.values(teams).map(t=>t[key]).sort((a,b)=>asc?a-b:b-a);
  return v=>vals.indexOf(v)+1;
}
function getSplits() {
  // MLB Stats API does not expose home/away, handedness, day/night, and
  // recent-form team splits through the aggregate endpoint used here. Do not
  // turn aggregate season totals into invented split values.
  return [];
}

function formatLeaderValue(value, digits = 0) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : String(value);
}

function getLeaders(hittingRows = [], pitchingRows = []) {
  const top = (rows, key, direction = 'desc') => [...rows]
    .filter(row => Number.isFinite(Number(row.stat?.[key])))
    .sort((a, b) => direction === 'asc'
      ? Number(a.stat[key]) - Number(b.stat[key])
      : Number(b.stat[key]) - Number(a.stat[key]))[0] || null;
  const hit = (cat, key, digits = 0, direction = 'desc') => {
    const row = top(hittingRows, key, direction);
    return { cat, player: row?.name || '—', val: row ? formatLeaderValue(row.stat[key], digits) : '—' };
  };
  const pit = (cat, key, digits = 0, direction = 'desc') => {
    const row = top(pitchingRows, key, direction);
    return { cat, player: row?.name || '—', val: row ? formatLeaderValue(row.stat[key], digits) : '—' };
  };
  return {
    batting: [hit('HR', 'homeRuns'), hit('AVG', 'avg', 3), hit('OPS', 'ops', 3), hit('SB', 'stolenBases')],
    pitching: [pit('ERA', 'era', 2, 'asc'), pit('K', 'strikeOuts'), pit('WHIP', 'whip', 2, 'asc')],
  };
}

function getBattedBall() { return null; }
function getPitchArsenal() { return null; }

// Front office evaluation (seeded per team)
function getFrontOffice(t) {
  const has = key => t[key] != null && Number.isFinite(Number(t[key]));
  const strengths = [
    ['Positive run differential', has('rs') && has('ra') && t.rs > t.ra],
    ['Above-average offense', has('ops') && t.ops >= .750],
    ['Strong run prevention', has('era') && t.era <= 3.50],
    ['High strikeout volume', has('k') && t.k >= 600],
    ['Home-run power', has('hr') && t.hr >= 100],
    ['Stolen-base volume', has('sb') && t.sb >= 70],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  const weaknesses = [
    ['Negative run differential', has('rs') && has('ra') && t.rs < t.ra],
    ['Below-average offense', has('ops') && t.ops < .720],
    ['Run-prevention risk', has('era') && t.era > 4.00],
    ['Low strikeout volume', has('k') && t.k < 520],
    ['Limited home-run power', has('hr') && t.hr < 75],
    ['Limited stolen-base volume', has('sb') && t.sb < 40],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  return { strengths, weaknesses };
}

function OverviewPage() {
  const [selTeam,setSelTeam]=useState('lad');
  const [splitTab,setSplitTab]=useState('home');
  const [arsenalTab,setArsenalTab]=useState('usage');
  const [todayGames,setTodayGames]=useState([]);
  const [liveTeamData,setLiveTeamData]=useState(null);
  const [liveTeamPlayers,setLiveTeamPlayers]=useState({ hitting:[], pitching:[] });
  const [liveTeamError,setLiveTeamError]=useState(false);
  const teamBase=TEAMS[selTeam];
  const team=useMemo(() => {
    const live = liveTeamData?.byId?.[teamBase?.id] || liveTeamData?.byAbbr?.[teamBase?.abbr];
    const hitting = live?.hitting || {};
    const pitching = live?.pitching || {};
    const stat = (source, key) => source?.[key] == null || source?.[key] === '' ? null : (Number.isFinite(Number(source[key])) ? Number(source[key]) : null);
    return {
      ...teamBase,
      ...(live?.standings || {}),
      w: stat(live?.standings, 'w'), l: stat(live?.standings, 'l'), pct: stat(live?.standings, 'pct'),
      rs: stat(live?.standings, 'rs'), ra: stat(live?.standings, 'ra'), diff: stat(live?.standings, 'diff'),
      ops: stat(hitting, 'ops'), obp: stat(hitting, 'obp'), slg: stat(hitting, 'slg'), avg: stat(hitting, 'avg'),
      hr: stat(hitting, 'homeRuns'), sb: stat(hitting, 'stolenBases'),
      era: stat(pitching, 'era'), whip: stat(pitching, 'whip'), k: stat(pitching, 'strikeOuts'),
      war: null, wrcPlus: null, fip: null, drs: null, bsr: null,
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
    setLiveTeamData(null);
    setLiveTeamPlayers({ hitting:[], pitching:[] });
    setLiveTeamError(false);
    getTodaysGames().then(g=>{ if(alive) setTodayGames(g.slice(0,8)); }).catch(()=>{});

    // Aggregate standings and team totals are the critical Overview path. They
    // must render independently of the slower per-player leaderboard calls,
    // otherwise one delayed pitching request leaves every visible team card on
    // an em dash even when the authoritative aggregate responses succeeded.
    Promise.allSettled([
      getStandings(),
      getAllTeamStats('hitting'),
      getAllTeamStats('pitching'),
    ]).then(([std, hitting, pitching]) => {
      if (!alive) return;
      const byAbbr = {};
      const byId = {};
      if (std.status === 'fulfilled') {
        Object.values(std.value).flat().forEach(row => {
          const record = { standings: row };
          if (row.abbr) byAbbr[row.abbr] = record;
          if (row.id != null) byId[row.id] = record;
        });
      }
      if (hitting.status === 'fulfilled') {
        Object.values(hitting.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.hitting = stat;
          if (stat.teamId != null) byId[stat.teamId] = row;
        });
      }
      if (pitching.status === 'fulfilled') {
        Object.values(pitching.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.pitching = stat;
          if (stat.teamId != null) byId[stat.teamId] = row;
        });
      }
      if ([std, hitting, pitching].some(result => result.status === 'fulfilled')) {
        setLiveTeamData({ byAbbr, byId });
      } else {
        setLiveTeamError(true);
      }
    });

    // Team leaders are useful but non-critical. A timeout or upstream failure
    // should only make the leader rows unavailable, not block the aggregates.
    Promise.allSettled([
      getTeamPlayerStats(teamBase.id, 'hitting'),
      getTeamPlayerStats(teamBase.id, 'pitching'),
    ]).then(([teamHitters, teamPitchers]) => {
      if (!alive) return;
      setLiveTeamPlayers({
        hitting: teamHitters.status === 'fulfilled' ? teamHitters.value : [],
        pitching: teamPitchers.status === 'fulfilled' ? teamPitchers.value : [],
      });
    });

    return ()=>{ alive=false; };
  },[teamBase?.id]);
  const rd = team.rs == null || team.ra == null || !Number.isFinite(Number(team.rs)) || !Number.isFinite(Number(team.ra))
    ? null
    : Number(team.rs) - Number(team.ra);

  const D=useMemo(()=>{
    const records = Object.values(liveTeamData?.byAbbr || {});
    const hittingRecords = records.map(r => r.hitting).filter(Boolean);
    const pitchingRecords = records.map(r => r.pitching).filter(Boolean);
    const standingsRecords = records.map(r => r.standings).filter(Boolean);
    const rankValue = (value, rows, keys, higher = true) => {
      if (value == null || value === '') return null;
      const current = Number(value);
      if (!Number.isFinite(current)) return null;
      const values = rows.map(row => {
        for (const key of keys) {
          const n = Number(row?.[key]);
          if (Number.isFinite(n)) return n;
        }
        return null;
      }).filter(v => v != null);
      return percentile(current, values, higher);
    };
    const offPct = rankValue(team.ops, hittingRecords, ['ops']);
    const powerPct = rankValue(team.hr, hittingRecords, ['homeRuns']);
    const speedPct = rankValue(team.sb, hittingRecords, ['stolenBases']);
    const contactPct = rankValue(team.avg, hittingRecords, ['avg']);
    const pitchingPct = rankValue(team.era, pitchingRecords, ['era'], false);
    const whipPct = rankValue(team.whip, pitchingRecords, ['whip'], false);
    const runDiffPct = rankValue(rd, standingsRecords, ['diff']);
    const offenseData=[
      {axis:'OPS', val:offPct}, {axis:'SLG', val:rankValue(team.slg, hittingRecords, ['slg'])},
      {axis:'OBP', val:rankValue(team.obp, hittingRecords, ['obp'])}, {axis:'HR', val:powerPct},
      {axis:'SB', val:speedPct}, {axis:'Run Diff', val:runDiffPct},
    ].filter(row => row.val != null);
    const strengthData=[
      {axis:'Hitting', val:offPct}, {axis:'Power', val:powerPct}, {axis:'Speed', val:speedPct},
      {axis:'Contact', val:contactPct}, {axis:'Run Prevention', val:pitchingPct}, {axis:'Command', val:whipPct},
    ].filter(row => row.val != null);
    const divName = team.div || 'League';
    const standings=Object.values(TEAMS).filter(t=>t.div===team.div).map(t=>{
      const live = liveTeamData?.byAbbr?.[t.abbr]?.standings;
      return { ...t, w: live?.w ?? null, l: live?.l ?? null, pct: live?.pct == null ? '—' : Number(live.pct).toFixed(3), cur:t.abbr===team.abbr };
    }).sort((a,b)=>(b.w ?? -1)-(a.w ?? -1));
    const leagueRanks=[
      {label:'Runs Scored',  rank:rankValue(team.rs, standingsRecords, ['rs']), val:team.rs},
      {label:'Home Runs',    rank:rankValue(team.hr, hittingRecords, ['homeRuns']), val:team.hr},
      {label:'Team OPS',     rank:rankValue(team.ops, hittingRecords, ['ops']), val:formatTeamMetric(team.ops,3)},
      {label:'Team ERA',     rank:rankValue(team.era, pitchingRecords, ['era'], false), val:formatTeamMetric(team.era,2)},
      {label:'WHIP',         rank:rankValue(team.whip, pitchingRecords, ['whip'], false), val:formatTeamMetric(team.whip,3)},
      {label:'Strikeouts',   rank:rankValue(team.k, pitchingRecords, ['strikeOuts']), val:team.k},
      {label:'Defense (OAA)',rank:null,val:'—'},
      {label:'Baserunning (BsR)',rank:null,val:'—'},
    ];
    const pctBars=[
      {lbl:'Offense', pct:offPct, color:C.amber},
      {lbl:'Pitching', pct:pitchingPct, color:C.rust},
      {lbl:'Defense', pct:null, color:C.teal},
      {lbl:'Baserunning', pct:null, color:C.navy},
    ];
    const available = [offPct, pitchingPct].filter(v => v != null);
    const overallPct = available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : null;
    return {
      offenseData,strengthData,standings,leagueRanks,pctBars,divName,
      og:pctToGrade(offPct),pg:pctToGrade(pitchingPct),dg:'—',
      overall:pctToGrade(overallPct),
    };
  },[selTeam, liveTeamData]);

  // These only depend on `team`, but were previously called directly in the
  // render body — every unrelated state change on this page (e.g. clicking
  // a split/arsenal tab) was silently recomputing all five for the same
  // team. Memoized on selTeam to match the `D` useMemo above.
  const { splits, leaders, bb, arsenal, fo } = useMemo(() => ({
    splits:  getSplits(),
    leaders: getLeaders(liveTeamPlayers.hitting, liveTeamPlayers.pitching),
    bb:      getBattedBall(),
    arsenal: getPitchArsenal(),
    fo:      getFrontOffice(team),
  }), [team, liveTeamPlayers]);
  const splitRows=splitTab==='home'?splits.slice(0,2):splitTab==='hand'?splits.slice(2,4):splits.slice(4,6);
  const offRows=[['OPS',formatTeamMetric(team.ops,3)],['OBP',formatTeamMetric(team.obp,3)],['SLG',formatTeamMetric(team.slg,3)],['AVG',formatTeamMetric(team.avg,3)],['HR',formatTeamMetric(team.hr)],['SB',formatTeamMetric(team.sb)]];
  const pitRows=[['ERA',formatTeamMetric(team.era,2)],['WHIP',formatTeamMetric(team.whip,3)],['K',formatTeamMetric(team.k)],['FIP','—'],['OAA','—'],['BsR','—']];

  // Team-level OAA and per-batted-ball EV distributions require dedicated
  // Statcast team queries. The MLB aggregate endpoints above do not provide
  // them, so these panels intentionally receive empty data and render an
  // unavailable state rather than seeded points.
  const oaaPositions = [];
  const evBins = [];

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* ── Selector + headline ── */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20,flexWrap:'wrap',paddingBottom:2}}>
        <div>
          <div style={px({fontSize:10,fontWeight:700,color:C.amber,letterSpacing:'.14em',textTransform:'uppercase',marginBottom:5})}>TEAM COMMAND CENTER</div>
          <h1 style={sans({fontSize:24,fontWeight:800,color:C.text,letterSpacing:'-.04em',lineHeight:1.1})}>Season overview</h1>
          <div style={sans({fontSize:11,color:C.text3,marginTop:5})}>A live snapshot of performance, leverage, and roster context.</div>
        </div>
        <div role="status" aria-live="polite" style={{display:'flex',alignItems:'center',gap:7,padding:'6px 9px',borderRadius:7,background:liveTeamError?C.rustSoft:liveTeamData?C.tealSoft:C.amberSoft,border:`1px solid ${liveTeamError?C.rustMid:liveTeamData?C.tealMid:C.amberMid}`}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:liveTeamError?C.rust:liveTeamData?C.teal:C.amber,animation:liveTeamData||liveTeamError?'none':'pulse 1.2s ease-in-out infinite'}} />
          <span style={px({fontSize:10,color:liveTeamError?C.rust:liveTeamData?C.teal:C.amberDark,fontWeight:700,letterSpacing:'.06em'})}>{liveTeamError?'DATA UNAVAILABLE':liveTeamData?'LIVE MLB DATA':'LOADING MLB DATA'}</span>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:8}}>
          <span className="sr-only">Select team</span>
          <select aria-label="Select team" value={selTeam} onChange={e=>setSelTeam(e.target.value)}
          style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:'pointer'}}>
            {Object.entries(TEAMS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </select>
        </label>
        <div style={{display:'flex',gap:22,flexWrap:'wrap'}}>
          {[['W–L',team.w == null || team.l == null ? '—' : `${team.w}–${team.l}`],['Win%',formatTeamMetric(team.pct,3)],['RS',formatTeamMetric(team.rs)],['RA',formatTeamMetric(team.ra)],['Run Diff',rd == null ? '—' : `${rd>0?'+':''}${rd}`],['Playoff Odds','—'],['Team WAR','—']].map(([l,v],i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={px({fontSize:20,fontWeight:800,lineHeight:1,color:i===4?(rd==null?C.text3:rd>0?C.teal:C.rust):i===5?C.teal:C.text})}>{v}</div>
              <div style={sans({fontSize:10,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginTop:3})}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <StatStrip items={[
        {val:formatTeamMetric(team.ops,3),lbl:'Team OPS',   sub:'Offense'},
        {val:formatTeamMetric(team.hr),    lbl:'Home Runs',  sub:'Power'},
        {val:formatTeamMetric(team.era,2),lbl:'Team ERA',   sub:'Pitching'},
        {val:formatTeamMetric(team.whip,3),lbl:'WHIP',      sub:'Command'},
        {val:formatTeamMetric(team.avg,3),lbl:'Batting Avg',sub:'Contact'},
        {val:formatTeamMetric(team.k),     lbl:'Strikeouts', sub:'K'},
        {val:formatTeamMetric(team.sb),    lbl:'Stolen Bases',sub:'Speed'},
        {val:'—',lbl:'Team WAR',   sub:'Unavailable'},
      ]}/>

      <Panel title="Front Office Read" accent={teamAccent} badge="Decision Lens">
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
          {[
            {label:'Current posture', value:rd == null ? 'Data pending' : rd > 0 ? 'Contending profile' : 'Needs run support', detail:rd == null ? 'Run differential unavailable' : `${rd > 0 ? '+' : ''}${rd} run differential`, color:rd == null ? C.text3 : rd > 0 ? C.teal : C.rust},
            {label:'Best signal', value:team.ops == null ? 'Data pending' : team.ops >= .750 ? 'Offensive leverage' : team.era != null && team.era <= 3.50 ? 'Run prevention' : 'Balanced evaluation', detail:team.ops == null ? 'Waiting on team aggregates' : `OPS ${formatTeamMetric(team.ops,3)} · ERA ${formatTeamMetric(team.era,2)}`, color:team.ops >= .750 ? C.amber : C.navy},
            {label:'Next question', value:'Prospect depth', detail:'Review future value and ETA', color:C.purple, action:() => window.dispatchEvent(new CustomEvent('skip-navigate', { detail:{ tab:'prospects' } }))},
          ].map((item, i) => (
            <div key={item.label} style={{padding:'12px 14px',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
              <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6})}>{item.label}</div>
              <div style={sans({fontSize:13,fontWeight:800,color:item.color,lineHeight:1.2})}>{item.value}</div>
              {item.action ? (
                <button onClick={item.action} style={{marginTop:5,padding:0,border:'none',background:'transparent',fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:10,color:C.purple,cursor:'pointer',textAlign:'left',textDecoration:'underline',textUnderlineOffset:2}}>{item.detail} →</button>
              ) : <div style={sans({fontSize:10,color:C.text3,marginTop:5,lineHeight:1.4})}>{item.detail}</div>}
            </div>
          ))}
        </div>
      </Panel>

      {/* ── ROW 1: Tables | Radars + Run Diff | Standings + Grade ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(160px,190px) 1fr minmax(168px,210px)',gap:14,alignItems:'start'}}>

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
                {[['Offense',D.og,D.pctBars.find(x=>x.lbl==='Offense')?.pct],['Pitching',D.pg,D.pctBars.find(x=>x.lbl==='Pitching')?.pct],['Defense',D.dg,null],['Baserunning','—',null],['Depth','—',null],['Future Value','—',null]].map(([l,g,n])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 4px'}}>
                    <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={px({fontSize:11,color:C.text3})}>{percentileLabel(n)}</span>
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
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Batted Ball Profile — same honesty treatment as PlayersPage's
             SprayChart/PlateDisciplineZone: seeded from real team stats,
             not real tracked batted-ball data. Was flagged in this doc's
             notes twice before as lower-priority than the player-level
             fix (decorative, not sitting beside real per-player Statcast
             panels) — fixing it now that a debug pass finally had room
             for it, since "lower priority" isn't the same as "not a real
             gap", and half this page turned out to share the pattern. */}
        <Panel title="Batted Ball Profile" accent={C.amber} badge={bb ? 'Savant' : 'Unavailable'}>
          {bb ? (
          <div>
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
              Source: Baseball Savant Statcast team batted-ball data.
            </div>
          </div>
          </div>
          ) : (
            <div style={{padding:'28px 18px',textAlign:'center'}}>
              <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
              <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team batted-ball data unavailable</div>
              <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>Aggregate MLB team stats do not include Statcast spray coordinates or batted-ball distributions.</div>
            </div>
          )}
        </Panel>

        {/* Pitch Arsenal */}
        <Panel title="Pitch Arsenal" accent={C.rust}
          badge={arsenal ? <div style={{display:'flex',gap:6}}>
            {[['Usage','usage'],['Grades','grades']].map(([l,k])=>(
              <button key={k} onClick={()=>setArsenalTab(k)} aria-pressed={arsenalTab===k}
                style={{padding:'2px 8px',fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:700,
                  background:arsenalTab===k?C.rust:C.surface3,color:arsenalTab===k?'#fff':C.text3,
                  border:'none',borderRadius:4,cursor:'pointer'}}>
                {l}
              </button>
            ))}
          </div> : 'Unavailable'}>
          {arsenal ? (arsenalTab === 'usage' ? (
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
                    <span style={px({fontSize:12,fontWeight:700,color:p.color})}>{percentileLabel(p.pct)}</span>
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
          )) : (
            <div style={{padding:'28px 18px',textAlign:'center'}}>
              <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
              <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team pitch arsenal unavailable</div>
              <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>Pitch type usage and Stuff+ require a team-level Baseball Savant pitch query.</div>
            </div>
          )}
          <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
            Source: Baseball Savant pitch-arsenal data when available; no seeded team values are shown.
          </div>
        </Panel>

        {/* Contact Quality Allowed + Position OAA */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Contact Quality Allowed" accent={C.slate} badge="Unavailable">
            <div style={{padding:'28px 18px',textAlign:'center'}}>
              <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
              <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team contact-quality data unavailable</div>
              <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>xwOBA allowed, hard-hit rate, barrel rate, and average exit velocity require team-level Baseball Savant Statcast rows.</div>
            </div>
          </Panel>

          {/* Position OAA Breakdown */}
          <Panel title="Position Breakdown" accent={teamAccent} badge="Unavailable">
            <div style={{padding:'28px 18px',textAlign:'center'}}>
              <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
              <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team OAA by position unavailable</div>
              <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>Baseball Savant’s individual OAA rows are not available through the aggregate team request used by this overview.</div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2b: Baserunning | EV Distribution | Spray Chart ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Baserunning */}
        <Panel title="Baserunning" accent={C.teal} badge="MLB Stats API">
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,borderBottom:`0.5px solid ${C.border}`}}>
            {[
              ['SB', team.sb, C.teal],
              ['BsR', '—', C.text4],
              ['Extra Bases %', '—', C.text4],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{padding:'12px 10px',textAlign:'center',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={px({fontSize:22,fontWeight:800,color:c,lineHeight:1})}>{v}</div>
                <div style={sans({fontSize:9.5,color:C.text3,marginTop:4,textTransform:'uppercase',letterSpacing:'.05em'})}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
            {[
              ['Sprint Speed','—', C.text4],
              ['Stolen Base Attempts','—', C.text4],
              ['Caught Stealing', '—', C.text4],
              ['MLB Rank (BsR)',  '—', C.text4],
              ['Extra Bases Taken', '—', C.text4],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0', borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                <span style={px({fontSize:11,fontWeight:700,color:c})}>{v}</span>
              </div>
            ))}
            <div style={sans({fontSize:9,color:C.text4,paddingTop:2,lineHeight:1.4})}>
              Only stolen bases are available in the current MLB aggregate team response. Sprint speed, BsR, attempts, and extra-base-taking require dedicated Statcast or play-by-play feeds.
            </div>
          </div>
        </Panel>

        <Panel title="Exit Velocity Distribution" accent={teamAccent} badge="Unavailable">
          <div style={{padding:'28px 18px',textAlign:'center'}}>
            <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
            <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team exit-velocity distribution unavailable</div>
            <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>Baseball Savant batted-ball distributions are not included in the current aggregate team endpoint.</div>
          </div>
        </Panel>

        <Panel title="Spray Chart" accent={C.rust} badge="Unavailable">
          <div style={{padding:'28px 18px',textAlign:'center'}}>
            <div style={px({fontSize:24,color:C.text4,marginBottom:8})}>—</div>
            <div style={sans({fontSize:11,color:C.text2,fontWeight:700})}>Team spray chart unavailable</div>
            <div style={sans({fontSize:10,color:C.text4,lineHeight:1.5,marginTop:5})}>Team spray charts require individual Baseball Savant Statcast batted-ball coordinates; no seeded dots are shown.</div>
          </div>
        </Panel>
      </div>

      {/* ── ROW 3: League Rankings + Pct Bars | Splits Dashboard | Team Leaders ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(190px,220px) 1fr minmax(210px,260px)',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="League Rankings" accent={teamAccent} badge="MLB">
            {D.leagueRanks.map(({label,rank,val},i)=>{
              const color=rank<=3?C.teal:rank<=7?C.amber:rank<=12?C.slate:C.rust;
              return (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 14px',borderBottom:i<D.leagueRanks.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                  <span style={sans({fontSize:11,color:C.text2})}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={px({fontSize:10,color:C.text4})}>{val}</span>
                    <span style={{...px({fontSize:11,fontWeight:700,color}),background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'1px 7px',borderRadius:10,minWidth:42,textAlign:'center'}}>{percentileLabel(rank)}</span>
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
                    <span style={px({fontSize:10.5,fontWeight:700,color})}>{percentileLabel(pct)}</span>
                  </div>
                  <div style={{height:4,background:C.surface3,borderRadius:2,overflow:'hidden',position:'relative'}}>
                    <div style={{height:'100%',width:`${pct == null ? 0 : pct}%`,background:color,borderRadius:2,transition:'width .6s ease'}}/>
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
              {splitRows.length ? splitRows.map((row,i)=>(
                <tr key={i} style={{borderBottom:i<splitRows.length-1?`0.5px solid ${C.borderLight}`:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.amberSoft}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={sans({padding:'9px 14px',fontSize:12,fontWeight:700,color:C.text})}>{row.split}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.navy})}>{row.w}–{row.l}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.amber,fontWeight:700})}>{row.ops}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.rust})}>{row.era}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={sans({padding:'28px 14px',fontSize:10.5,color:C.text3,textAlign:'center',lineHeight:1.5})}>Split statistics unavailable in the current MLB team aggregate feed. No estimated rows are shown.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{padding:'16px 14px',borderTop:`0.5px solid ${C.border}`}}>
            <div style={sans({fontSize:10.5,color:C.text3,lineHeight:1.5})}>Recent form and rolling time-window splits are not loaded from a source-backed team game-log feed in this panel.</div>
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
              {[['Offense',D.og,C.amber],['Pitching',D.pg,C.rust],['Defense','—',C.teal],['Baserunning','—',C.teal],['Depth','—',C.slate],['Future Val','—',C.purple]].map(([lbl,val,color])=>(
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
