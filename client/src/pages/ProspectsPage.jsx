import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { fmt, fmtEra, trueIP } from '../lib/formatting.js';
import { placeholderColors } from '../lib/theme.js';
import { PROSPECT_BATTERS, PROSPECT_PITCHERS, TEAMS, SEASON } from '../constants/data.js';
import { getTopProspectStats, getMiLBGames } from '../api/mlb.js';
import { PosBadge, Panel, StatStrip, SkeletonRows, FVBadge, RiskDot, WatchStar, TrendBadge } from '../components/atoms.jsx';
import { computeFV, fvBaselines, projectedWAR, fvRiskBand, fvETA, fvETAYear } from '../engine/skip.js';
import ProspectCard from '../components/ProspectCard.jsx';
import CompareModal from '../components/CompareModal.jsx';
import ScatterBuilder from '../components/ScatterBuilder.jsx';
import { useWatchlist } from '../lib/watchlist.js';
import { compareValues } from '../lib/sorting.js';

/* ── Live MiLB Scoreboard ─────────────────────────────────────── */
const MILB_LEVEL_COLOR = {
  'Triple-A': C.amber, 'Double-A': C.teal, 'High-A': C.slate, 'Single-A': C.purple,
};
function milbGameStatusLabel(g) {
  if (g.status === 'Final' || g.statusCode === 'F') return 'FINAL';
  if (g.inning) return `${g.inningState === 'Top' ? '▲' : '▼'} ${g.inning}`;
  return g.status || 'Scheduled';
}
function milbIsLive(g) { return !!g.inning && g.status !== 'Final' && g.statusCode !== 'F'; }

function MiLBScoreboardPanel() {
  const [byLevel, setByLevel] = useState({});
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState('Triple-A');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { byLevel } = await getMiLBGames(undefined, [11, 12, 13, 14]);
        if (alive) setByLevel(byLevel || {});
      } catch { /* best effort */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const levels = ['Triple-A', 'Double-A', 'High-A', 'Single-A'].filter(l => byLevel[l]?.length);
  const games = byLevel[level] || [];

  return (
    <Panel title="Live MiLB Scoreboard" accent={C.teal} badge={loading ? 'Loading…' : `${games.length} games`}>
      <div style={{ display:'flex', gap:2, padding:'8px 14px 0', flexWrap:'wrap' }}>
        {['Triple-A', 'Double-A', 'High-A', 'Single-A'].map(l => (
          <button key={l} onClick={() => setLevel(l)} aria-pressed={level===l}
            disabled={!byLevel[l]?.length}
            style={{
              padding:'5px 12px', fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:600,
              color: level===l ? C.surface : (byLevel[l]?.length ? C.text2 : C.text4),
              background: level===l ? (MILB_LEVEL_COLOR[l]||C.teal) : 'transparent',
              border:`1px solid ${level===l ? (MILB_LEVEL_COLOR[l]||C.teal) : C.border}`,
              borderRadius:6, cursor: byLevel[l]?.length ? 'pointer' : 'default', marginBottom:6,
            }}>
            {l}{byLevel[l]?.length ? ` (${byLevel[l].length})` : ''}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding:'10px 14px' }}><SkeletonRows count={3} height={44} /></div>
      )}
      {!loading && levels.length === 0 && (
        <div style={{ padding:'16px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
          No MiLB games scheduled today
        </div>
      )}
      {!loading && games.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:0 }}>
          {games.map((g, i) => {
            const live = milbIsLive(g);
            const status = milbGameStatusLabel(g);
            const awayWin = g.away.runs != null && g.home.runs != null && g.away.runs > g.home.runs;
            const homeWin = g.away.runs != null && g.home.runs != null && g.home.runs > g.away.runs;
            return (
              <div key={g.gamePk || i} style={{
                padding:'10px 14px', borderBottom:`0.5px solid ${C.borderLight}`,
                borderRight: (i+1) % 2 === 1 ? `0.5px solid ${C.borderLight}` : 'none',
                background: live ? `color-mix(in srgb, ${C.teal} 2%, transparent)` : 'transparent',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <span style={{ ...px({ fontSize:10, fontWeight:700 }), color:live?C.teal:C.text3,
                    background:live?C.tealSoft:C.surface2, padding:'1px 6px', borderRadius:3 }}>
                    {live && <span style={{ marginRight:4 }}>●</span>}{status}
                  </span>
                  {g.venue && <span style={sans({ fontSize:9, color:C.text4 })}>{g.venue.replace(/ (Park|Field|Stadium|Center)$/,'')}</span>}
                </div>
                {[
                  { label:g.away.abbr||g.away.name, runs:g.away.runs, hits:g.away.hits, win:awayWin },
                  { label:g.home.abbr||g.home.name, runs:g.home.runs, hits:g.home.hits, win:homeWin },
                ].map(({ label, runs, hits, win }) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                    <span style={sans({ fontSize:12, fontWeight:win?800:500, color:win?C.text:C.text2 })}>{label}</span>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      {hits != null && <span style={px({ fontSize:10, color:C.text4 })}>{hits}H</span>}
                      <span style={{ ...px({ fontSize:16, fontWeight:800, lineHeight:1 }), color:win?C.amber:C.text }}>
                        {runs ?? '–'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}


/* ── team-id lookup for logos ─────────────────────────────────── */
const TEAM_ID = {
  LAD:119,NYY:147,BOS:111,ATL:144,SEA:136,HOU:117,CLE:114,BAL:110,SD:135,PHI:143,
  MIL:158,OAK:133,WSH:120,DET:116,MIN:142,STL:138,CWS:145,MIA:146,TEX:140,TB:139,
  TOR:141,KC:118,CHC:112,CIN:113,COL:115,SF:137,PIT:134,NYM:121,ARI:109,LAA:108,
};
function TeamLogo({ abbr, size = 20 }) {
  const id = TEAM_ID[abbr];
  if (!id) return <span style={sans({ fontSize:10, color:C.text3 })}>{abbr}</span>;
  return <img src={`https://www.mlbstatic.com/team-logos/${id}.svg`} alt={abbr} width={size} height={size} loading="lazy" style={{ flexShrink:0, objectFit:'contain' }} />;
}
function ProspectPhoto({ mlbId, name, size = 40 }) {
  const [err, setErr] = useState(false);
  const src = `https://content.mlb.com/images/headshots/current/60x60/${mlbId}.png`;
  const { bg: phBg, fg: phFg } = placeholderColors();
  const fallback = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="6" fill="${phBg}"/><circle cx="${size/2}" cy="${size*.35}" r="${size*.22}" fill="${phFg}"/><ellipse cx="${size/2}" cy="${size*.85}" rx="${size*.28}" ry="${size*.22}" fill="${phFg}"/></svg>`
  )}`;
  return <img src={err ? fallback : src} onError={() => setErr(true)} alt={name} loading="lazy"
    style={{ width:size, height:size, borderRadius:6, objectFit:'cover', objectPosition:'center top',
      border:`0.5px solid ${C.border}`, flexShrink:0, background:C.surface2 }} />;
}

// (fmt3/fmtEra formatting now come from ../lib/formatting.js as fmt/fmtEra)

/* ── eFV Movers ────────────────────────────────────────────────────────
   Prospects whose live-recomputed eFV has drifted furthest from SKIP's
   preseason-snapshot grade — i.e. real, in-season performance actually
   moving the number, not a hand-curated "risers" list. Empty until live
   MLB stats have loaded and diverge from the static baseline. */
function FVMoversMetric({ mover }) {
  if (mover.isPitcher) {
    return `ERA ${mover.era != null ? mover.era.toFixed(2) : '—'} vs. preseason line`;
  }
  return `OPS ${mover.ops != null ? fmt(mover.ops) : '—'} vs. preseason line`;
}
function FVMoversPanel({ movers, loading }) {
  return (
    <Panel title="eFV Movers" accent={C.teal} badge="Live vs. Preseason">
      {loading && (
        <div style={{ padding:'10px 14px' }}><SkeletonRows count={3} height={40} /></div>
      )}
      {!loading && movers.length === 0 && (
        <div style={{ padding:'16px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
          No prospects have drifted from their preseason eFV yet today.
        </div>
      )}
      {!loading && movers.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:0 }}>
          {movers.map((m, i) => {
            const up = m.delta > 0;
            const arrowColor = up ? C.teal : C.rust;
            return (
              <div key={m.mlbId} style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                borderBottom:`0.5px solid ${C.borderLight}`,
                borderRight: (i % 2 === 0) ? `0.5px solid ${C.borderLight}` : 'none',
              }}>
                <ProspectPhoto mlbId={m.mlbId} name={m.name} size={32} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <TeamLogo abbr={m.team} size={14} />
                    <span style={sans({ fontSize:11.5, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' })}>{m.name}</span>
                  </div>
                  <div style={sans({ fontSize:9.5, color:C.text3, marginTop:1 })}><FVMoversMetric mover={m} /></div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                    <span style={sans({ fontSize:9, color:C.text4 })}>{m.staticFV}</span>
                    <span style={sans({ fontSize:9, color:C.text4 })}>→</span>
                    <FVBadge fv={m.fv} />
                  </div>
                  <div style={{ ...px({ fontSize:10.5, fontWeight:800, color:arrowColor }), marginTop:2 }}>
                    {up ? '▲' : '▼'} {up ? '+' : ''}{m.delta} eFV
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.borderLight}` }}>
        <span style={sans({ fontSize:9.5, color:C.text4 })}>
          eFV recomputes live from rank, level-relative performance, and age-for-level · delta is vs. SKIP's preseason snapshot · see Knowledge → Future Value
        </span>
      </div>
    </Panel>
  );
}

// Live MLB API names and our static roster names can differ in ways an exact
// string match misses entirely — diacritics ("Jasson Domínguez" vs
// "Jasson Dominguez"), suffixes ("Jackson Jr." vs "Jackson"), or stray
// whitespace/punctuation. A missed match doesn't error — it just silently
// falls back to static-only numbers, which looks like "stats aren't
// updating" with no visible cause. mlbId is the primary match key (exact,
// unambiguous); normalized name is the fallback for the rare case a static
// mlbId is stale.
/* ── Farm System Depth ────────────────────────────────────────────────
   Count of each org's prospects in SKIP's tracked Top-100 pool, sorted by
   depth then average rank. A lightweight complement to FARM_GRADES (which
   is a hand-set letter grade) — this one's a straight count derived from
   the same rank data the rest of this page uses. */
function useFarmRankings() {
  return useMemo(() => {
    const byTeam = {};
    for (const p of [...PROSPECT_BATTERS, ...PROSPECT_PITCHERS]) {
      if (!byTeam[p.team]) byTeam[p.team] = [];
      byTeam[p.team].push(p.rank);
    }
    return Object.entries(byTeam)
      .map(([team, ranks]) => ({
        team,
        count: ranks.length,
        avgRank: ranks.reduce((a, b) => a + b, 0) / ranks.length,
        bestRank: Math.min(...ranks),
      }))
      // More tracked prospects first (deeper system); ties broken by who's
      // tracked highest on average (better system, not just bigger).
      .sort((a, b) => b.count - a.count || a.avgRank - b.avgRank);
  }, []);
}

function FarmRankingsPanel() {
  const rankings = useFarmRankings();
  return (
    <Panel title="Farm System Depth" accent={C.slate} badge={`${rankings.length} orgs represented`}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gap:0 }}>
        {rankings.map((r, i) => {
          const teamInfo = TEAMS[r.team.toLowerCase()];
          return (
            <div key={r.team} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderBottom:`0.5px solid ${C.borderLight}` }}>
              <span style={{ ...px({ fontSize:9.5, color:C.text4, width:16, flexShrink:0 }) }}>{i + 1}</span>
              <TeamLogo abbr={r.team} size={16} />
              <span style={sans({ fontSize:11.5, fontWeight:600, color:C.text, flex:1 })}>{teamInfo?.name ?? r.team}</span>
              <span style={{ ...px({ fontSize:10.5, fontWeight:700, color:C.teal }) }}>{r.count}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.border}` }}>
        <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
          Count of each org&rsquo;s prospects in SKIP&rsquo;s tracked Top ~100 pool, sorted by depth
          then average rank — a snapshot of top-tier system strength, not a full-system census.
        </div>
      </div>
    </Panel>
  );
}

function normalizeName(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[.,'']/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv)\.?$/, '')          // drop generational suffixes
    .replace(/\s+/g, ' ')
    .trim();
}
function buildNameIndex(list) {
  const map = new Map();
  for (const item of list) map.set(normalizeName(item.name), item);
  return map;
}


// Declared at module scope (not inside the page component) so it isn't
// recreated on every render — recreating it each render was resetting
// React's reconciliation identity for every header cell.
function SortTh({ label, k, right = true, sortKey, sortAsc, toggleSort }) {
  const active = sortKey === k;
  return (
    <th onClick={() => toggleSort(k)}
      tabIndex={0} role="button" aria-pressed={active}
      onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggleSort(k); } }}
      style={{ padding:'7px 6px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',
        color:active?C.amber:C.text2,textAlign:right?'right':'left',
        borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',
        background:active?`color-mix(in srgb, ${C.amber} 3%, transparent)`:'transparent' }}>
      {label}{active?(sortAsc?' ↑':' ↓'):''}
    </th>
  );
}

const MILB_STANDOUTS = [
  { name:'Konnor Griffin', pos:'SS', team:'PIT', level:'AA', levelColor:C.teal,
    stats:[{lbl:'Max EV',val:'114.2 mph',color:C.teal},{lbl:'Avg EV',val:'95.1 mph',color:C.teal},{lbl:'Barrel %',val:'19.8%',color:C.teal},{lbl:'Whiff %',val:'17.2%',color:C.amber}],
    note:'Bat speed elite for any level. Chase rate improving. MLB debut timeline accelerating.' },
  { name:'Roman Anthony', pos:'OF', team:'BOS', level:'AAA', levelColor:C.teal,
    stats:[{lbl:'Max EV',val:'109.7 mph',color:C.amber},{lbl:'Avg EV',val:'92.1 mph',color:C.amber},{lbl:'Hard Hit %',val:'47.3%',color:C.teal},{lbl:'K %',val:'19.8%',color:C.amber}],
    note:'Contact% improving every month. Hit tool emerging at highest level.' },
  { name:'Josue De Paula', pos:'OF', team:'LAD', level:'AA', levelColor:C.amber,
    stats:[{lbl:'OPS',val:'.971',color:C.teal},{lbl:'BB%',val:'14.5%',color:C.teal},{lbl:'K%',val:'12.9%',color:C.teal},{lbl:'HR',val:'10',color:C.amber}],
    note:'Best prospect line in the minors. Power-contact combo elite for age 21.' },
];

const SCOUTING = {
  'Konnor Griffin': [{tool:'HIT',val:65,desc:'Elite bat-to-ball'},{tool:'PWR',val:60,desc:'Plus raw power'},{tool:'RUN',val:70,desc:'Plus-plus speed'},{tool:'ARM',val:65,desc:'Strong & accurate'},{tool:'FLD',val:60,desc:'Solid range'}],
  default: [{tool:'HIT',val:55,desc:'Developing hit tool'},{tool:'PWR',val:55,desc:'Plus raw power'},{tool:'RUN',val:55,desc:'Average runner'},{tool:'ARM',val:55,desc:'Average arm'},{tool:'FLD',val:55,desc:'Average glove'}],
};

function LevelProgression({ currentLevel }) {
  const LEVELS = ['LOW-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB'];
  const MAP = { A:0,'A+':1,AA:2,AAA:3,MLB:4 };
  const clean = (currentLevel||'').replace(/ALL \(\d+\)/,'AA').split('/')[0].trim();
  const cur = MAP[clean] ?? 2;
  return (
    <div style={{ padding:'10px 14px 4px' }}>
      <div style={sans({ fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 })}>Level Progression</div>
      <div style={{ display:'flex',alignItems:'center',position:'relative' }}>
        <div style={{ position:'absolute',top:7,left:8,right:8,height:2,background:C.surface3,zIndex:0 }}/>
        <div style={{ position:'absolute',top:7,left:8,height:2,width:`calc(${Math.max(0,cur/(LEVELS.length-1))*100}% - 8px)`,background:C.teal,zIndex:1,transition:'width .6s ease' }}/>
        {LEVELS.map((lv,i) => {
          const done=i<cur, active=i===cur;
          return (
            <div key={lv} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',zIndex:2 }}>
              <div style={{ width:16,height:16,borderRadius:'50%',border:`2px solid ${active?C.teal:done?C.teal:C.border}`,background:active?C.teal:done?C.tealSoft:C.surface,display:'flex',alignItems:'center',justifyContent:'center' }}>
                {done && <div style={{ width:6,height:6,borderRadius:'50%',background:C.teal }}/>}
                {active && <div style={{ width:5,height:5,borderRadius:'50%',background:'#fff' }}/>}
              </div>
              <div style={sans({ fontSize:8.5,fontWeight:active?800:500,color:active?C.teal:done?C.text3:C.text4,marginTop:5,textAlign:'center',lineHeight:1.2 })}>{lv}</div>
              {active && <div style={sans({ fontSize:8,color:C.teal,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginTop:2 })}>Current</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProspectsPage() {
  const [view,    setView]    = useState('top100');
  const [batPit,  setBatPit]  = useState('bat');   // 'bat' | 'pit'
  const [selId,   setSelId]   = useState(null);
  const [cardId,  setCardId]  = useState(null);
  const [sortKey, setSortKey] = useState('rank');
  const [sortAsc, setSortAsc] = useState(true);

  const [liveStats, setLiveStats] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);

  const [compareIds, setCompareIds] = useState([]); // up to 4 mlbIds, same batPit type
  const [showCompare, setShowCompare] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const [showScatter, setShowScatter] = useState(false);
  const { isWatched, toggle: toggleWatch } = useWatchlist();

  // The command palette (Cmd/Ctrl+K) can deep-link here from anywhere in the
  // app — it switches to this tab and fires this event rather than holding
  // a ref, since this component isn't mounted yet on the render where the
  // tab switch happens.
  useEffect(() => {
    const onOpen = e => { if (e.detail?.mlbId) setCardId(e.detail.mlbId); };
    window.addEventListener('skip-open-prospect-card', onOpen);
    return () => window.removeEventListener('skip-open-prospect-card', onOpen);
  }, []);

  // Try to enrich static data with live MLB API stats; falls back silently on error
  useEffect(() => {
    let alive = true;
    getTopProspectStats().then(data => {
      const hasLiveRows = Boolean(data && (data.hitting?.length || data.pitching?.length));
      if (alive && hasLiveRows) setLiveStats(data);
    }).catch(() => {}).finally(() => { if (alive) setLiveLoading(false); });
    return () => { alive = false; };
  }, []);

  // Merge live stats into static data — matched by mlbId (reliable) with a
  // name-based fallback for the rare case a prospect's static mlbId is stale.
  const batters = useMemo(() => {
    if (!liveStats?.hitting?.length) return PROSPECT_BATTERS;
    const liveById   = new Map(liveStats.hitting.map(l => [l.id, l]));
    const liveByName = buildNameIndex(liveStats.hitting);
    return PROSPECT_BATTERS.map(p => {
      const live = liveById.get(p.mlbId) || liveByName.get(normalizeName(p.name));
      if (!live) return { ...p, ops:null, avg:null, hr:null, rbi:null, sb:null, statSource:'unavailable' };
      return {
        ...p,
        ops: live.ops != null && live.ops !== '—' ? +live.ops : null,
        avg: live.avg != null && live.avg !== '—' ? +live.avg : null,
        hr:  live.hr  != null && live.hr  !== '—' ? +live.hr  : null,
        rbi: live.rbi != null && live.rbi !== '—' ? +live.rbi : null,
        sb:  live.sb  != null && live.sb  !== '—' ? +live.sb  : null,
        statSource:'live',
      };
    });
  }, [liveStats]);

  const pitchers = useMemo(() => {
    if (!liveStats?.pitching?.length) return PROSPECT_PITCHERS;
    const liveById   = new Map(liveStats.pitching.map(l => [l.id, l]));
    const liveByName = buildNameIndex(liveStats.pitching);
    return PROSPECT_PITCHERS.map(p => {
      const live = liveById.get(p.mlbId) || liveByName.get(normalizeName(p.name));
      if (!live) return { ...p, era:null, whip:null, so:null, w:null, statSource:'unavailable' };
      return {
        ...p,
        era:  live.era  != null && live.era  !== '—' ? +live.era  : null,
        whip: live.whip != null && live.whip !== '—' ? +live.whip : null,
        so:   live.k    != null && live.k    !== '—' ? +live.k    : null,
        w:    live.w    != null && live.w    !== '—' ? +live.w    : null,
        statSource:'live',
      };
    });
  }, [liveStats]);

  // Static (preseason-snapshot) eFV — computed once from the hardcoded data
  // file rather than live stats, purely so the movers panel (and the Trend
  // column below, Roadmap #6) has a fixed baseline to diff the live grade
  // against. Empty deps: this never needs to be recalculated after first
  // render. Computed before battersFV/pitchersFV since those now fold the
  // resulting delta straight into each row.
  const staticBatterFV  = useMemo(() => {
    const baselines = fvBaselines(PROSPECT_BATTERS, false);
    return new Map(PROSPECT_BATTERS.map(p => [p.mlbId, computeFV(p, baselines, false)]));
  }, []);
  const staticPitcherFV = useMemo(() => {
    const baselines = fvBaselines(PROSPECT_PITCHERS, true);
    return new Map(PROSPECT_PITCHERS.map(p => [p.mlbId, computeFV(p, baselines, true)]));
  }, []);

  // ── eFV — computed live from rank + current performance + age-for-level.
  // See src/engine/skip.js for the full methodology. Re-derives whenever
  // `batters`/`pitchers` change, so a live stats refresh recomputes grades
  // automatically instead of relying on a hand-maintained number. Baselines
  // (pool medians) are computed once per array, not once per prospect —
  // computeFV() takes the precomputed baseline rather than the raw pool.
  //
  // fvDelta/trend (Roadmap #6): fvDelta is live eFV minus the static
  // preseason snapshot — the same number fvMovers below ranks on, now
  // computed once per row instead of twice. trend labels it Surge/Slide
  // only past a +/-3 threshold (a couple of points of drift is normal
  // quarter-to-quarter noise, not a real trend) — 'null' renders as a plain
  // dash rather than a fabricated "Steady" tag. There's no live injury feed
  // wired into SKIP, so unlike the reference card's Trend column this
  // deliberately has no "Injured" state — see Roadmap #6 notes for why that
  // wasn't added as a per-player tag here.
  const battersFV = useMemo(() => {
    const baselines = fvBaselines(batters, false);
    return batters.map(p => {
      const fv = computeFV(p, baselines, false);
      const staticFV = staticBatterFV.get(p.mlbId);
      const fvDelta = staticFV != null ? fv - staticFV : null;
      return {
        ...p, fv, projWar: projectedWAR(fv), risk: fvRiskBand(p),
        eta: fvETA(p, SEASON), etaSort: fvETAYear(p, SEASON),
        fvDelta, trend: fvDelta == null ? null : fvDelta >= 3 ? 'Surge' : fvDelta <= -3 ? 'Slide' : null,
      };
    });
  }, [batters, staticBatterFV]);

  const pitchersFV = useMemo(() => {
    const baselines = fvBaselines(pitchers, true);
    return pitchers.map(p => {
      const fv = computeFV(p, baselines, true);
      const staticFV = staticPitcherFV.get(p.mlbId);
      const fvDelta = staticFV != null ? fv - staticFV : null;
      return {
        ...p, fv, projWar: projectedWAR(fv), risk: fvRiskBand(p),
        eta: fvETA(p, SEASON), etaSort: fvETAYear(p, SEASON),
        fvDelta, trend: fvDelta == null ? null : fvDelta >= 3 ? 'Surge' : fvDelta <= -3 ? 'Slide' : null,
      };
    });
  }, [pitchers, staticPitcherFV]);

  // eFV Movers — prospects whose live-recomputed grade has drifted furthest
  // from the static baseline, i.e. real season performance moving the
  // needle since the preseason snapshot. Only non-zero once live MLB stats
  // have actually loaded and differ from the snapshot. Reuses the fvDelta
  // already computed above instead of re-diffing against the static maps.
  const fvMovers = useMemo(() => {
    const rows = [];
    battersFV.forEach(p => {
      if (p.fvDelta != null && p.fvDelta !== 0) rows.push({ ...p, isPitcher:false, staticFV: p.fv - p.fvDelta, delta: p.fvDelta });
    });
    pitchersFV.forEach(p => {
      if (p.fvDelta != null && p.fvDelta !== 0) rows.push({ ...p, isPitcher:true, staticFV: p.fv - p.fvDelta, delta: p.fvDelta });
    });
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
  }, [battersFV, pitchersFV]);

  const toggleSort = useCallback((key) => {
    setSortKey(k => { if (k === key) { setSortAsc(a => !a); return k; } setSortAsc(true); return key; });
  }, []);

  // Compare list is capped at 4 (beyond that the table gets unreadable) and
  // switching between batters/pitchers clears it, since the stat columns
  // being compared are completely different between the two.
  const toggleCompare = useCallback((mlbId) => {
    setCompareIds(prev => prev.includes(mlbId)
      ? prev.filter(id => id !== mlbId)
      : prev.length >= 4 ? prev : [...prev, mlbId]);
  }, []);

  const [levelFilter, setLevelFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [etaFilter, setEtaFilter] = useState('all');
  const batterLevels  = useMemo(() => [...new Set(battersFV.map(b => b.level))].sort(), [battersFV]);
  const pitcherLevels = useMemo(() => [...new Set(pitchersFV.map(p => p.level))].sort(), [pitchersFV]);
  const activeRows = batPit === 'bat' ? battersFV : pitchersFV;
  const positionOptions = useMemo(() => [...new Set(activeRows.map(player => player.pos).filter(Boolean))].sort(), [activeRows]);
  const etaOptions = useMemo(() => [...new Set(activeRows.map(player => player.eta).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true })), [activeRows]);
  const ageMatches = (age) => {
    const n = Number(age);
    if (!Number.isFinite(n) || ageFilter === 'all') return ageFilter === 'all';
    if (ageFilter === 'under21') return n < 21;
    if (ageFilter === '21to22') return n >= 21 && n <= 22;
    if (ageFilter === '23to24') return n >= 23 && n <= 24;
    if (ageFilter === '25plus') return n >= 25;
    return true;
  };
  const filterRows = (rows) => rows.filter(player => {
    const levelOk = levelFilter === 'all' || player.level === levelFilter;
    const positionOk = positionFilter === 'all' || player.pos === positionFilter;
    const etaOk = etaFilter === 'all' || player.eta === etaFilter;
    return levelOk && positionOk && etaOk && ageMatches(player.age) && (!watchOnly || isWatched(player.mlbId));
  });

  const sortedBatters = useMemo(() => {
    return [...filterRows(battersFV)].sort((a,b) => compareValues(a[sortKey] ?? 0, b[sortKey] ?? 0, sortAsc));
  }, [battersFV, sortKey, sortAsc, levelFilter, positionFilter, ageFilter, etaFilter, watchOnly, isWatched]);

  const sortedPitchers = useMemo(() => {
    return [...filterRows(pitchersFV)].sort((a,b) => compareValues(a[sortKey] ?? 0, b[sortKey] ?? 0, sortAsc));
  }, [pitchersFV, sortKey, sortAsc, levelFilter, positionFilter, ageFilter, etaFilter, watchOnly, isWatched]);

  const selBatter  = useMemo(() => battersFV.find(b => b.mlbId === selId), [selId, battersFV]);
  const selPitcher = useMemo(() => pitchersFV.find(p => p.mlbId === selId), [selId, pitchersFV]);

  // Stats for top strip — a single O(n) reduce pass per stat instead of
  // sorting (and copying) the whole array 6x on every render just to read
  // element [0]. Memoized since batters/pitchers only change when live
  // stats load in, not on every selection/sort click.
  const bestBy = (arr, key, higherIsBetter = true) =>
    arr.reduce((best, cur) => {
      if (!best) return cur;
      const c = cur[key], b = best[key];
      if (c == null) return best;
      if (b == null) return cur;
      return (higherIsBetter ? c > b : c < b) ? cur : best;
    }, null);

  const { topOPS, topSB, topAVG, topHR } = useMemo(() => ({
    topOPS: bestBy(battersFV, 'ops'),
    topSB:  bestBy(battersFV, 'sb'),
    topAVG: bestBy(battersFV, 'avg'),
    topHR:  bestBy(battersFV, 'hr'),
  }), [battersFV]);

  const { topERA, topK } = useMemo(() => ({
    topERA: bestBy(pitchersFV, 'era', false),
    topK:   bestBy(pitchersFV, 'so'),
  }), [pitchersFV]);

  const pipelineSummary = useMemo(() => {
    const all = [...battersFV, ...pitchersFV];
    const nearTerm = all.filter(player => player.eta && /2026|2027/.test(player.eta)).length;
    const highRisk = all.filter(player => player.risk === 'High').length;
    const topSystem = [...all].sort((a, b) => (b.fv || 0) - (a.fv || 0))[0];
    return { nearTerm, highRisk, topSystem };
  }, [battersFV, pitchersFV]);

  return (
    <>
    <div className="page-enter skip-prospects-page" style={{ display:'flex',flexDirection:'column',gap:14 }}>
      <StatStrip items={[
        { val:battersFV.length,  lbl:'Batter Prospects', sub:'Top 100 2026' },
        { val:pitchersFV.length, lbl:'Pitcher Prospects', sub:'Top 100 2026' },
        { val:topOPS  ? fmt(topOPS.ops)   : '—', lbl:'Top OPS',  sub:topOPS?.name?.split(' ').slice(-1)[0]||'' },
        { val:topERA  ? fmtEra(topERA.era) : '—', lbl:'Top ERA',  sub:topERA?.name?.split(' ').slice(-1)[0]||'' },
        { val:topSB   ? topSB.sb           : '—', lbl:'Top SB',   sub:topSB?.name?.split(' ').slice(-1)[0]||''  },
        { val:topHR   ? topHR.hr           : '—', lbl:'Top HR',   sub:topHR?.name?.split(' ').slice(-1)[0]||''  },
        { val:topAVG  ? fmt(topAVG.avg)   : '—', lbl:'Top AVG',  sub:topAVG?.name?.split(' ').slice(-1)[0]||'' },
        { val:topK    ? topK.so            : '—', lbl:'Top K',    sub:topK?.name?.split(' ').slice(-1)[0]||''   },
      ]}/>

      <Panel title="Prospect Board" accent={C.purple} badge="Scouting Workflow">
        <div className="skip-prospect-summary-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0}}>
          {[
            {label:'Near-term ETA', value:pipelineSummary.nearTerm, detail:'2026–27 arrivals', color:C.teal},
            {label:'High risk', value:pipelineSummary.highRisk, detail:'Requires monitoring', color:pipelineSummary.highRisk ? C.rust : C.text3},
            {label:'Top future value', value:pipelineSummary.topSystem?.fv ? `${pipelineSummary.topSystem.fv} FV` : '—', detail:pipelineSummary.topSystem?.name || 'Data pending', color:C.amber},
            {label:'Tracking pool', value:battersFV.length + pitchersFV.length, detail:'Players in board', color:C.navy},
          ].map((item, i) => (
            <div key={item.label} style={{padding:'12px 14px',borderRight:i<3?`0.5px solid ${C.borderLight}`:'none'}}>
              <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6})}>{item.label}</div>
              <div style={px({fontSize:20,fontWeight:900,color:item.color,lineHeight:1})}>{item.value}</div>
              <div style={sans({fontSize:10,color:C.text3,marginTop:5,lineHeight:1.35,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'})}>{item.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <FVMoversPanel movers={fvMovers} loading={liveLoading} />

      <MiLBScoreboardPanel />

      <FarmRankingsPanel />

      {/* ── View tabs ── */}
      <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
        <div style={{ display:'flex',gap:2,background:C.surface,border:`0.5px solid ${C.border}`,borderRadius:8,padding:4 }}>
          {[['top100','Top 100 Stats'],['byteam','By Team'],['breakouts','Breakouts'],['risers','Risers & Fallers']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} aria-pressed={view===k} style={{ padding:'6px 14px',fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:600,
              color:view===k?'#fff':C.text2,background:view===k?C.navy:'transparent',border:'none',borderRadius:6,cursor:'pointer',transition:'all .12s' }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,
          background:liveStats?C.tealSoft:liveLoading?C.amberSoft:C.surface2,
          border:`0.5px solid ${liveStats?C.tealMid:liveLoading?C.amberMid:C.border}` }}>
          <div style={{ width:5,height:5,borderRadius:'50%',
            background:liveStats?C.teal:liveLoading?C.amber:C.text4,
            animation:liveLoading?'pulse 1.2s ease-in-out infinite':undefined }} />
          <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,letterSpacing:'.06em',
            color:liveStats?C.teal:liveLoading?C.amber:C.text3 }}>
            {liveStats ? 'LIVE STATS' : liveLoading ? 'LOADING…' : 'STATIC'}
          </span>
        </div>
      </div>

      {view === 'top100' && (
        <div className="skip-prospect-workspace-grid" style={{ display:'grid',gridTemplateColumns:'1fr 260px',gap:14,alignItems:'start' }}>
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>

            {/* ── Batter / Pitcher toggle ── */}
            <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
              <div style={{ display:'flex',gap:2,alignSelf:'flex-start',background:C.surface2,borderRadius:6,padding:3,border:`0.5px solid ${C.border}` }}>
                {[['bat','Batters'],['pit','Pitchers']].map(([k,l])=>(
                  <button key={k} onClick={()=>{ setBatPit(k); setSortKey('rank'); setSortAsc(true); setSelId(null); setCompareIds([]); setLevelFilter('all'); setPositionFilter('all'); setAgeFilter('all'); setEtaFilter('all'); }}
                    style={{ padding:'5px 16px',fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:700,
                      color:batPit===k?'#fff':C.text3,background:batPit===k?C.amber:'transparent',
                      border:'none',borderRadius:4,cursor:'pointer' }}>{l}</button>
                ))}
              </div>

              <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} title="Filter by level — combine with the Age column to find the youngest players at a level"
                style={{ padding:'6px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text,
                  fontFamily:"'DM Mono',monospace", fontSize:10.5, cursor:'pointer' }}>
                <option value="all">All Levels</option>
                {(batPit === 'bat' ? batterLevels : pitcherLevels).map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>

              <select aria-label="Filter by position" value={positionFilter} onChange={e => setPositionFilter(e.target.value)}
                style={{ padding:'6px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text, fontFamily:"'DM Mono',monospace", fontSize:10.5, cursor:'pointer' }}>
                <option value="all">All Positions</option>
                {positionOptions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
              </select>

              <select aria-label="Filter by age" value={ageFilter} onChange={e => setAgeFilter(e.target.value)}
                style={{ padding:'6px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text, fontFamily:"'DM Mono',monospace", fontSize:10.5, cursor:'pointer' }}>
                <option value="all">All Ages</option>
                <option value="under21">Under 21</option>
                <option value="21to22">Age 21–22</option>
                <option value="23to24">Age 23–24</option>
                <option value="25plus">25+</option>
              </select>

              <select aria-label="Filter by projected ETA" value={etaFilter} onChange={e => setEtaFilter(e.target.value)}
                style={{ padding:'6px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text, fontFamily:"'DM Mono',monospace", fontSize:10.5, cursor:'pointer' }}>
                <option value="all">All ETAs</option>
                {etaOptions.map(eta => <option key={eta} value={eta}>{eta}</option>)}
              </select>

              <select aria-label="Sort prospects" value={sortKey} onChange={e => { setSortKey(e.target.value); setSortAsc(true); }}
                style={{ padding:'6px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text, fontFamily:"'DM Mono',monospace", fontSize:10.5, cursor:'pointer' }}>
                <option value="rank">Sort: Rank</option>
                <option value="age">Sort: Age</option>
                <option value="etaSort">Sort: ETA</option>
                <option value="fv">Sort: eFV</option>
                <option value="ops">Sort: OPS</option>
                <option value="era">Sort: ERA</option>
                <option value="projWar">Sort: Proj. WAR</option>
              </select>

              <button onClick={() => setWatchOnly(w => !w)} style={{
                padding:'6px 12px', borderRadius:6, cursor:'pointer',
                border:`1px solid ${watchOnly ? C.amber : C.border}`,
                background: watchOnly ? C.amberSoft : 'transparent',
                color: watchOnly ? C.amberDark : C.text2,
                fontFamily:"'DM Mono',monospace", fontSize:10.5, fontWeight:700,
              }}>★ Watchlist Only</button>

              <button onClick={() => setShowScatter(s => !s)} style={{
                padding:'6px 12px', borderRadius:6, cursor:'pointer',
                border:`1px solid ${showScatter ? C.purple : C.border}`,
                background: showScatter ? `color-mix(in srgb, ${C.purple} 10%, transparent)` : 'transparent',
                color: showScatter ? C.purple : C.text2,
                fontFamily:"'DM Mono',monospace", fontSize:10.5, fontWeight:700,
              }}>Scatterplot</button>

              {compareIds.length > 0 && (
                <button onClick={() => setShowCompare(true)} style={{
                  padding:'6px 12px', borderRadius:6, cursor:'pointer', border:`1px solid ${C.teal}`,
                  background:`color-mix(in srgb, ${C.teal} 12%, transparent)`, color:C.teal,
                  fontFamily:"'DM Mono',monospace", fontSize:10.5, fontWeight:700,
                }}>⇆ Compare ({compareIds.length})</button>
              )}
            </div>

            {showScatter && <ScatterBuilder batters={battersFV} pitchers={pitchersFV} onSelect={setCardId} />}

            {batPit === 'bat' ? (
              <Panel title="Top Prospect Batters" accent={C.amber} badge={`${sortedBatters.length} prospects · Live MLB.com`}>
                <div className="skip-long-table">
                  <table style={{ width:'100%',borderCollapse:'collapse',minWidth:1060 }}>
                    <thead>
                      <tr className="skip-table-group-row">
                        <th colSpan={5}>Identity</th><th colSpan={3}>Projection</th><th colSpan={10}>Hitting production</th>
                      </tr>
                      <tr style={{ background:C.surface2 }}>
                        <SortTh label="Rk"  k="rank" right={false} sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <th style={{ padding:'7px 8px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:'left',borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap' }}>Player</th>
                        <th style={{ padding:'7px 6px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:'center',borderBottom:`0.5px solid ${C.border}` }}>Tm</th>
                        <SortTh label="Age" k="age" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <th style={{ padding:'7px 6px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',color:C.text2,textAlign:'center',borderBottom:`0.5px solid ${C.border}` }}>Lvl</th>
                        <SortTh label="eFV" k="fv" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="Trend" k="fvDelta" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="ETA" k="etaSort" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="PA"  k="pa" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="HR"  k="hr" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="RBI" k="rbi" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="SB"  k="sb" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="BB%" k="bb" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="K%"  k="so" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="AVG" k="avg" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="OBP" k="obp" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="SLG" k="slg" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="OPS" k="ops" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBatters.map((pr) => {
                        const sel = selId === pr.mlbId;
                        const bbPct = pr.pa ? ((pr.bb / pr.pa) * 100).toFixed(1) : '—';
                        const kPct  = pr.pa ? ((pr.so / pr.pa) * 100).toFixed(1) : '—';
                        return (
                          <tr key={pr.mlbId}
                            style={{ borderBottom:`0.5px solid ${C.borderLight}`,background:sel?C.amberSoft:'transparent',cursor:'pointer' }}
                            onClick={() => setSelId(sel ? null : pr.mlbId)}
                            tabIndex={0} role="button" aria-expanded={sel}
                            aria-label={`${sel ? 'Collapse' : 'Expand'} ${pr.name} season detail`}
                            onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setSelId(sel ? null : pr.mlbId); } }}
                            onMouseEnter={e => { if(!sel) e.currentTarget.style.background=C.surface2; }}
                            onMouseLeave={e => { e.currentTarget.style.background=sel?C.amberSoft:'transparent'; }}>
                            <td style={{ padding:'6px 8px',textAlign:'left' }}>
                              <div style={px({ fontSize:12,fontWeight:800,color:C.amber })}>{pr.rank}</div>
                            </td>
                            <td style={{ padding:'6px 8px' }}>
                              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                                <ProspectPhoto mlbId={pr.mlbId} name={pr.name} size={32}/>
                                <div>
                                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                    <WatchStar watched={isWatched(pr.mlbId)} size={11}
                                      onToggle={() => toggleWatch({ mlbId:pr.mlbId, name:pr.name, pos:pr.pos, team:pr.team })} />
                                    <div style={sans({ fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap' })}>{pr.name}</div>
                                  </div>
                                  <div style={{ display:'flex',gap:4,alignItems:'center',marginTop:2 }}>
                                    <PosBadge pos={pr.pos}/>
                                    <button onClick={e => { e.stopPropagation(); setCardId(pr.mlbId); }}
                                      title="View scouting card"
                                      style={{ border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text3,
                                        borderRadius:4, fontSize:9, padding:'1px 5px', cursor:'pointer', lineHeight:1.4 }}>
                                      ▤ Card
                                    </button>
                                    <label onClick={e => e.stopPropagation()} title="Add to comparison"
                                      style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer' }}>
                                      <input type="checkbox" checked={compareIds.includes(pr.mlbId)}
                                        disabled={!compareIds.includes(pr.mlbId) && compareIds.length >= 4}
                                        onChange={() => toggleCompare(pr.mlbId)}
                                        style={{ width:11, height:11, cursor:'pointer', accentColor:C.teal }} />
                                      <span style={{ ...px({ fontSize:9, color:C.text3 }) }}>Cmp</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}>
                              <div style={{ display:'flex',alignItems:'center',justifyContent:'center' }}>
                                <TeamLogo abbr={pr.team} size={18}/>
                              </div>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.age}</td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}>
                              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,
                                color:pr.level==='MLB'?C.teal:pr.level==='AAA'?C.amber:C.slate,
                                background:pr.level==='MLB'?C.tealSoft:pr.level==='AAA'?C.amberSoft:C.surface3,
                                padding:'1px 5px',borderRadius:3 }}>{pr.level}</span>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}><FVBadge fv={pr.fv}/></td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}><TrendBadge trend={pr.trend} delta={pr.fvDelta}/></td>
                            <td style={{ padding:'6px 6px',textAlign:'center',...px({ fontSize:10.5, fontWeight:700, color:pr.eta==='MLB'?C.teal:C.text2 }) }}>{pr.eta}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.pa}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,fontWeight:pr.hr>=10?700:400,color:pr.hr>=10?C.rust:C.text }) }}>{pr.hr}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.rbi}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,fontWeight:pr.sb>=15?700:400,color:pr.sb>=15?C.teal:C.text }) }}>{pr.sb}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,color:parseFloat(bbPct)>=15?C.teal:C.text }) }}>{bbPct}%</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,color:parseFloat(kPct)>=30?C.rust:C.text }) }}>{kPct}%</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:12,fontWeight:700,color:pr.avg>=.300?C.teal:pr.avg>=.260?C.amber:C.slate }) }}>{fmt(pr.avg)}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:12,fontWeight:700,color:pr.obp>=.380?C.teal:pr.obp>=.340?C.amber:C.slate }) }}>{fmt(pr.obp)}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:12,fontWeight:700,color:pr.slg>=.500?C.teal:pr.slg>=.420?C.amber:C.slate }) }}>{fmt(pr.slg)}</td>
                            <td style={{ padding:'6px 8px',textAlign:'right',...px({ fontSize:13,fontWeight:800,color:pr.ops>=.900?C.teal:pr.ops>=.800?C.amber:pr.ops>=.700?C.slate:C.rust }) }}>{fmt(pr.ops)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding:'8px 14px',borderTop:`0.5px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <span style={sans({ fontSize:9.5,color:C.text4 })}>Source: MLB.com/prospects/stats/top-prospects · 2026 Cumulative Stats</span>
                  <span style={sans({ fontSize:9.5,color:C.text4 })}>Click any row to see detail · Click column to sort</span>
                </div>
              </Panel>
            ) : (
              <Panel title="Top Prospect Pitchers" accent={C.rust} badge={`${sortedPitchers.length} prospects · Live MLB.com`}>
                <div className="skip-long-table">
                  <table style={{ width:'100%',borderCollapse:'collapse',minWidth:920 }}>
                    <thead>
                      <tr className="skip-table-group-row">
                        <th colSpan={5}>Identity</th><th colSpan={3}>Projection</th><th colSpan={10}>Pitching performance</th>
                      </tr>
                      <tr style={{ background:C.surface2 }}>
                        <SortTh label="Rk"   k="rank" right={false} sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <th style={{ padding:'7px 8px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:'left',borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap' }}>Player</th>
                        <th style={{ padding:'7px 6px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',color:C.text2,textAlign:'center',borderBottom:`0.5px solid ${C.border}` }}>Tm</th>
                        <SortTh label="Age"  k="age" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <th style={{ padding:'7px 6px',fontSize:9.5,fontWeight:700,textTransform:'uppercase',color:C.text2,textAlign:'center',borderBottom:`0.5px solid ${C.border}` }}>Lvl</th>
                        <SortTh label="eFV" k="fv" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="Trend" k="fvDelta" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="ETA" k="etaSort" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="G"    k="g" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="IP"   k="ip" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="H"    k="h" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="BB"   k="bb" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="SO"   k="so" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="W"    k="w" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="L"    k="l" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="ERA"  k="era" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                        <SortTh label="WHIP" k="whip" sortKey={sortKey} sortAsc={sortAsc} toggleSort={toggleSort}/>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPitchers.map((pr) => {
                        const sel = selId === pr.mlbId;
                        return (
                          <tr key={pr.mlbId}
                            style={{ borderBottom:`0.5px solid ${C.borderLight}`,background:sel?`color-mix(in srgb, ${C.rust} 7%, transparent)`:'transparent',cursor:'pointer' }}
                            onClick={() => setSelId(sel ? null : pr.mlbId)}
                            tabIndex={0} role="button" aria-expanded={sel}
                            aria-label={`${sel ? 'Collapse' : 'Expand'} ${pr.name} season detail`}
                            onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setSelId(sel ? null : pr.mlbId); } }}
                            onMouseEnter={e => { if(!sel) e.currentTarget.style.background=C.surface2; }}
                            onMouseLeave={e => { e.currentTarget.style.background=sel?`color-mix(in srgb, ${C.rust} 7%, transparent)`:'transparent'; }}>
                            <td style={{ padding:'6px 8px' }}><div style={px({ fontSize:12,fontWeight:800,color:C.rust })}>{pr.rank}</div></td>
                            <td style={{ padding:'6px 8px' }}>
                              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                                <ProspectPhoto mlbId={pr.mlbId} name={pr.name} size={32}/>
                                <div>
                                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                    <WatchStar watched={isWatched(pr.mlbId)} size={11}
                                      onToggle={() => toggleWatch({ mlbId:pr.mlbId, name:pr.name, pos:pr.pos, team:pr.team })} />
                                    <div style={sans({ fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap' })}>{pr.name}</div>
                                  </div>
                                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,
                                    color:pr.pos==='LHP'?C.teal:C.slate,
                                    background:pr.pos==='LHP'?C.tealSoft:C.surface3,
                                    padding:'1px 5px',borderRadius:3 }}>{pr.pos}</span>
                                  <button onClick={e => { e.stopPropagation(); setCardId(pr.mlbId); }}
                                    title="View scouting card"
                                    style={{ border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text3,
                                      borderRadius:4, fontSize:9, padding:'1px 5px', cursor:'pointer', marginLeft:5, lineHeight:1.4 }}>
                                    ▤ Card
                                  </button>
                                  <label onClick={e => e.stopPropagation()} title="Add to comparison"
                                    style={{ display:'inline-flex', alignItems:'center', gap:2, cursor:'pointer', marginLeft:5 }}>
                                    <input type="checkbox" checked={compareIds.includes(pr.mlbId)}
                                      disabled={!compareIds.includes(pr.mlbId) && compareIds.length >= 4}
                                      onChange={() => toggleCompare(pr.mlbId)}
                                      style={{ width:11, height:11, cursor:'pointer', accentColor:C.rust }} />
                                    <span style={{ ...px({ fontSize:9, color:C.text3 }) }}>Cmp</span>
                                  </label>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}>
                              <div style={{ display:'flex',alignItems:'center',justifyContent:'center' }}>
                                <TeamLogo abbr={pr.team} size={18}/>
                              </div>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.age}</td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}>
                              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,
                                color:pr.level==='AAA'?C.amber:C.slate,
                                background:pr.level==='AAA'?C.amberSoft:C.surface3,
                                padding:'1px 5px',borderRadius:3 }}>{pr.level}</span>
                            </td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}><FVBadge fv={pr.fv}/></td>
                            <td style={{ padding:'6px 6px',textAlign:'center' }}><TrendBadge trend={pr.trend} delta={pr.fvDelta}/></td>
                            <td style={{ padding:'6px 6px',textAlign:'center',...px({ fontSize:10.5, fontWeight:700, color:pr.eta==='MLB'?C.teal:C.text2 }) }}>{pr.eta}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.g}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.ip}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.h}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11 }) }}>{pr.bb}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,fontWeight:pr.so>=70?700:400,color:pr.so>=70?C.teal:C.text }) }}>{pr.so}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,fontWeight:700,color:C.teal }) }}>{pr.w}</td>
                            <td style={{ padding:'6px 6px',textAlign:'right',...px({ fontSize:11,color:C.rust }) }}>{pr.l}</td>
                            <td style={{ padding:'6px 8px',textAlign:'right',...px({ fontSize:13,fontWeight:800,color:pr.era<=2.5?C.teal:pr.era<=3.5?C.amber:pr.era<=4.5?C.slate:C.rust }) }}>{fmtEra(pr.era)}</td>
                            <td style={{ padding:'6px 8px',textAlign:'right',...px({ fontSize:12,fontWeight:700,color:pr.whip<=0.90?C.teal:pr.whip<=1.20?C.amber:C.rust }) }}>{pr.whip?.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding:'8px 14px',borderTop:`0.5px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <span style={sans({ fontSize:9.5,color:C.text4 })}>Source: MLB.com/prospects/stats/top-prospects · 2026 Cumulative Stats</span>
                  <span style={sans({ fontSize:9.5,color:C.text4 })}>Click column header to sort</span>
                </div>
              </Panel>
            )}

            {/* ── Detail panel for selected batter ── */}
            {selBatter && batPit === 'bat' && (
              <Panel title={`${selBatter.name} — Season Detail`} accent={C.teal} badge={selBatter.level}>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0 }}>
                  <div style={{ borderRight:`0.5px solid ${C.border}` }}>
                    <LevelProgression currentLevel={selBatter.level}/>
                  </div>
                  <div style={{ borderRight:`0.5px solid ${C.border}`,padding:'10px 14px' }}>
                    <div style={sans({ fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8 })}>Slash Line</div>
                    {[
                      ['PA',  selBatter.pa],['AB',  selBatter.ab],['H',   selBatter.h],
                      ['2B',  selBatter.d],  ['3B',  selBatter.t],  ['HR',  selBatter.hr],
                      ['RBI', selBatter.rbi],['BB',  selBatter.bb], ['SO',  selBatter.so],
                      ['SB',  selBatter.sb], ['AVG', fmt(selBatter.avg)],['OBP', fmt(selBatter.obp)],
                      ['SLG', fmt(selBatter.slg)],['OPS', fmt(selBatter.ops)],
                    ].map(([l,v],i,arr)=>(
                      <div key={l} style={{ display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
                        <span style={sans({ fontSize:10,color:C.text3 })}>{l}</span>
                        <span style={px({ fontSize:11,fontWeight:700,color:['AVG','OBP','SLG','OPS'].includes(l)?C.amber:C.text })}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:'10px 14px' }}>
                    <div style={sans({ fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8 })}>Scouting Report</div>
                    {(SCOUTING[selBatter.name] || SCOUTING.default).map(({ tool,val,desc }) => {
                      const col = val>=70?C.teal:val>=60?C.amber:val>=50?C.slate:C.rust;
                      const pct = Math.max(0,Math.min(100,((val-20)/60)*100));
                      return (
                        <div key={tool} style={{ display:'flex',alignItems:'center',gap:6,marginBottom:7 }}>
                          <span style={{ ...px({ fontSize:9,fontWeight:700,color:col }),background:`color-mix(in srgb, ${col} 9%, transparent)`,padding:'1px 5px',borderRadius:3,minWidth:30,textAlign:'center' }}>{tool}</span>
                          <div style={{ flex:1,height:5,background:C.surface3,borderRadius:3,overflow:'hidden' }}>
                            <div style={{ height:'100%',width:`${pct}%`,background:col,borderRadius:3 }}/>
                          </div>
                          <span style={px({ fontSize:10,fontWeight:700,color:col,width:22,textAlign:'right' })}>{val}</span>
                        </div>
                      );
                    })}
                    <div style={{ marginTop:8,padding:'8px 10px',background:C.surface2,borderRadius:6,borderLeft:`2px solid ${C.amber}` }}>
                      <div style={sans({ fontSize:10,color:C.text3,marginBottom:2 })}>Team</div>
                      <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                        <TeamLogo abbr={selBatter.team} size={20}/>
                        <span style={sans({ fontSize:11,fontWeight:700,color:C.text })}>{selBatter.team} · Age {selBatter.age}</span>
                      </div>
                    </div>
                    <div style={{ marginTop:8,padding:'8px 10px',background:C.surface2,borderRadius:6,borderLeft:`2px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
                      <div>
                        <div style={sans({ fontSize:10,color:C.text3,marginBottom:3 })}>SKIP eFV</div>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <FVBadge fv={selBatter.fv}/>
                          <RiskDot risk={selBatter.risk}/>
                          <span style={sans({ fontSize:10,color:C.text3 })}>{selBatter.risk} risk</span>
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={sans({ fontSize:10,color:C.text3,marginBottom:2 })}>Proj. WAR · ETA</div>
                        <div style={px({ fontSize:12,fontWeight:700,color:C.teal })}>{selBatter.projWar} · {selBatter.eta}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {/* ── Detail panel for selected pitcher ── */}
            {selPitcher && batPit === 'pit' && (
              <Panel title={`${selPitcher.name} — Season Detail`} accent={C.rust} badge={selPitcher.level}>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:0 }}>
                  <div style={{ borderRight:`0.5px solid ${C.border}` }}>
                    <LevelProgression currentLevel={selPitcher.level}/>
                    <div style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
                        <TeamLogo abbr={selPitcher.team} size={24}/>
                        <span style={sans({ fontSize:12,fontWeight:700,color:C.text })}>{selPitcher.team} · {selPitcher.pos} · Age {selPitcher.age}</span>
                      </div>
                      <div style={{ padding:'8px 10px',background:C.surface2,borderRadius:6,borderLeft:`2px solid ${C.teal}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
                        <div>
                          <div style={sans({ fontSize:10,color:C.text3,marginBottom:3 })}>SKIP eFV</div>
                          <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                            <FVBadge fv={selPitcher.fv}/>
                            <RiskDot risk={selPitcher.risk}/>
                            <span style={sans({ fontSize:10,color:C.text3 })}>{selPitcher.risk} risk</span>
                          </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={sans({ fontSize:10,color:C.text3,marginBottom:2 })}>Proj. WAR · ETA</div>
                          <div style={px({ fontSize:12,fontWeight:700,color:C.teal })}>{selPitcher.projWar} · {selPitcher.eta}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding:'10px 14px' }}>
                    <div style={sans({ fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8 })}>Pitching Line</div>
                    {[
                      ['G',    selPitcher.g],   ['IP',   selPitcher.ip],
                      ['H',    selPitcher.h],   ['BB',   selPitcher.bb],
                      ['SO',   selPitcher.so],  ['W',    selPitcher.w],
                      ['L',    selPitcher.l],   ['ERA',  fmtEra(selPitcher.era)],
                      ['WHIP', selPitcher.whip?.toFixed(2)],
                      ['K/9',  trueIP(selPitcher.ip) ? ((selPitcher.so/trueIP(selPitcher.ip))*9).toFixed(1) : '—'],
                      ['BB/9', trueIP(selPitcher.ip) ? ((selPitcher.bb/trueIP(selPitcher.ip))*9).toFixed(1) : '—'],
                    ].map(([l,v],i,arr)=>(
                      <div key={l} style={{ display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
                        <span style={sans({ fontSize:10,color:C.text3 })}>{l}</span>
                        <span style={px({ fontSize:11,fontWeight:700,color:['ERA','WHIP'].includes(l)?C.rust:['SO','K/9'].includes(l)?C.teal:C.text })}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
            <Panel title="MiLB Standouts" accent={C.teal} badge="SKIP editorial">
              {MILB_STANDOUTS.map((s,i)=>(
                <div key={i} style={{ padding:'12px 14px',borderBottom:i<MILB_STANDOUTS.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
                    <div>
                      <div style={sans({ fontSize:12,fontWeight:800,color:C.text })}>{s.name}</div>
                      <div style={sans({ fontSize:10,color:C.text3 })}>{s.pos} · {s.team}</div>
                    </div>
                    <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9.5,fontWeight:700,color:s.levelColor,background:`color-mix(in srgb, ${s.levelColor} 9%, transparent)`,padding:'2px 8px',borderRadius:4 }}>{s.level}</span>
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 10px',marginBottom:7 }}>
                    {s.stats.map(({ lbl,val,color })=>(
                      <div key={lbl} style={{ display:'flex',justifyContent:'space-between' }}>
                        <span style={sans({ fontSize:9.5,color:C.text3 })}>{lbl}</span>
                        <span style={px({ fontSize:10.5,fontWeight:700,color })}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:'5px 8px',background:C.surface2,borderRadius:5,borderLeft:`2px solid ${C.amber}` }}>
                    <span style={sans({ fontSize:10,color:C.text2,lineHeight:1.4 })}>{s.note}</span>
                  </div>
                </div>
              ))}
              <div style={{ padding:'8px 14px',borderTop:`0.5px solid ${C.borderLight}` }}>
                <div style={sans({ fontSize:9.5,color:C.text3,lineHeight:1.5 })}>Editorial scouting snapshot. Live MLB.com stats appear in the table above; connected MiLB Statcast batted-ball coverage is unavailable.</div>
              </div>
            </Panel>

            <Panel title="ETA Breakdown" accent={C.amber}>
              <div style={{ padding:'12px 14px',display:'flex',flexDirection:'column',gap:10 }}>
                {[['MLB Ready (2025–26)',18,C.teal],['Near-Term (2026–27)',34,C.amber],['Developmental (2027+)',48,C.slate]].map(([l,n,c])=>(
                  <div key={l}>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                      <span style={sans({ fontSize:11,fontWeight:600,color:c })}>{l}</span>
                      <span style={px({ fontSize:12,fontWeight:700,color:C.text })}>{n}</span>
                    </div>
                    <div style={{ height:5,background:C.surface3,borderRadius:3,overflow:'hidden' }}>
                      <div style={{ height:'100%',width:`${n}%`,background:c,borderRadius:3 }}/>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Top Farm Systems" accent={C.amber} badge="Unavailable">
              <div style={{padding:'22px 14px',textAlign:'center',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
                A current, source-backed farm-system ranking is not connected. The prior snapshot is hidden.
              </div>
            </Panel>

            <Panel title="Position Scarcity" accent={C.rust}>
              {[['Catcher','Scarce',C.rust],['Shortstop','Record Depth',C.amber],['SP Arm','Normal',C.slate],['Outfield','Deep',C.teal],['Corner INF','Deep',C.teal]].map(([pos,v,c])=>(
                <div key={pos} style={{ display:'flex',justifyContent:'space-between',padding:'7px 14px',borderBottom:`0.5px solid ${C.borderLight}` }}>
                  <span style={sans({ fontSize:11,color:C.text2 })}>{pos}</span>
                  <span style={px({ fontSize:11,fontWeight:700,color:c })}>{v}</span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}

      {view === 'byteam' && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12 }}>
          {[
            ['AL East',   [['BOS','A+ (4)','↑ Franklin Arias OF'],['BAL','A (2)','↑ Nate George SS'],['TOR','A- (2)','↑ Arjun Nimmala SS']]],
            ['AL Central',[['MIN','A- (3)','↑ Walker Jenkins OF'],['CLE','A (3)','↑ Angel Genao SS'],['KC','B+ (2)','↑ Blake Mitchell C']]],
            ['AL West',   [['SEA','A+ (5)','↑ Colt Emerson SS'],['TEX','B+ (1)','↑ Caden Scarborough RHP'],['HOU','B (2)','↑ Kevin Alvarez 3B']]],
            ['NL East',   [['NYM','A- (2)','↑ A.J. Ewing SS'],['WSH','A (3)','↑ Eli Willits SS'],['PHI','B (1)','↑ Gage Wood RHP']]],
            ['NL Central',[['MIL','A+ (3)','↑ Jesús Made SS'],['STL','A- (2)','↑ Rainiel Rodriguez 2B'],['CHC','B+ (2)','↑ Jefferson Rojas OF']]],
            ['NL West',   [['LAD','A (5)','↑ Josue De Paula OF'],['SD','B (1)','↑ Ethan Salas C'],['OAK','B+ (2)','↑ Leo De Vries SS']]],
          ].map(([div,teams])=>(
            <Panel key={div} title={div} accent={C.amber}>
              {teams.map(([abbr,grade,top])=>(
                <div key={abbr}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 14px 3px',borderTop:`0.5px solid ${C.borderLight}` }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <TeamLogo abbr={abbr} size={18}/>
                      <span style={sans({ fontSize:12,fontWeight:700,color:C.text })}>{abbr}</span>
                    </div>
                    <span style={px({ fontSize:11,fontWeight:700,color:C.teal })}>{grade}</span>
                  </div>
                  <div style={{ padding:'2px 14px 9px',...sans({ fontSize:11,fontWeight:600,color:C.amber }) }}>{top}</div>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}

      {view === 'breakouts' && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
          <Panel title="Breakout Model — Hitters" accent={C.amber} badge="SKIP editorial">
            {[
              ['Konnor Griffin','SS','PIT',91,'Bat speed elite · Chase rate improving · MLB debut on horizon',C.teal],
              ['Roman Anthony','OF','BOS',83,'Contact% improving · Exit velo 92.1 avg · Hit tool emerging',C.amber],
              ['Josue De Paula','OF','LAD',78,'.971 OPS at AA · Elite walk rate · Power-contact combo',C.teal],
              ['Eli Willits','SS','WSH',71,'.918 OPS · 38 BB · Speed-patience combo extraordinary',C.teal],
              ['Jhonny Level','OF','SF',62,'.958 OPS · .330 AVG · Power at A+ ahead of schedule',C.amber],
            ].map(([n,pos,t,prob,note,c])=>(
              <div key={n} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px 3px',background:prob>=74?`color-mix(in srgb, ${c} 8%, transparent)`:'transparent' }}>
                  <span style={sans({ fontSize:12,fontWeight:700,color:prob>=74?c:C.text })}>↑ {n} · {pos} · {t}</span>
                  <span style={px({ fontSize:11,fontWeight:700,color:prob>=74?c:C.text3 })}>{prob}%</span>
                </div>
                <div style={{ padding:'2px 14px 9px',...sans({ fontSize:11,color:C.text2,lineHeight:1.5 }) }}>{note}</div>
              </div>
            ))}
          </Panel>
          <Panel title="Breakout Model — Pitchers" accent={C.rust} badge="SKIP editorial">
            {[
              ['Kade Anderson','LHP','SEA',92,'1.29 ERA · 0.69 WHIP · Best prospect ERA in minors',C.teal],
              ['Anthony Eyanson','RHP','BOS',86,'1.17 ERA · Elite contact suppression · MLB ready',C.teal],
              ['Kendry Chourio','RHP','KC',79,'1.71 ERA at age 18 · Elite command · Velo developing',C.teal],
              ['Robby Snelling','LHP','MIA',68,'2.38 ERA · 46 K in 34 IP · Swing-and-miss stuff',C.amber],
              ['River Ryan','RHP','LAD',58,'2.89 ERA at AAA · Returning to form · LAD pipeline talent',C.slate],
            ].map(([n,h,t,prob,note,c])=>(
              <div key={n} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px 3px',background:prob>=74?`color-mix(in srgb, ${c} 8%, transparent)`:'transparent' }}>
                  <span style={sans({ fontSize:12,fontWeight:700,color:prob>=74?c:C.text })}>↑ {n} · {h} · {t}</span>
                  <span style={px({ fontSize:11,fontWeight:700,color:prob>=74?c:C.text3 })}>{prob}%</span>
                </div>
                <div style={{ padding:'2px 14px 9px',...sans({ fontSize:11,color:C.text2,lineHeight:1.5 }) }}>{note}</div>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {view === 'risers' && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
          <Panel title="▲ Top Risers — 2026" accent={C.teal} badge="SKIP editorial">
            {[
              ['Josue De Paula OF LAD','+18 ranks','.971 OPS at AA · 10 HR · 37 BB · Dodgers pipeline star'],
              ['Eli Willits SS WSH','+14 ranks','.918 OPS · 38 walks · Elite patience at age 18'],
              ['Franklin Arias OF BOS','+11 ranks','.977 OPS · 13 HR · 12.8% K rate elite for any level'],
              ['Theo Gillen OF TB','+9 ranks','1.005 OPS at A+ · 22 SB · 5-tool profile emerging'],
              ['Jhonny Level OF SF','+8 ranks','.958 OPS · .330 AVG · Power-speed combo exciting'],
            ].map(([n,m,note])=>(
              <div key={n} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px 3px' }}>
                  <span style={sans({ fontSize:12,fontWeight:700,color:C.text })}>{n}</span>
                  <span style={px({ fontSize:11,fontWeight:700,color:C.teal })}>{m}</span>
                </div>
                <div style={{ padding:'2px 14px 9px',...sans({ fontSize:11,color:C.text2,lineHeight:1.5 }) }}>{note}</div>
              </div>
            ))}
          </Panel>
          <Panel title="▼ Top Fallers — 2026" accent={C.rust} badge="SKIP editorial">
            {[
              ['Jordan Walker OF STL','-15 ranks','K-rate 32% · Chase rate elevated · Mechanical issues'],
              ['Druw Jones OF ARI','-11 ranks','Shoulder concern · Timeline extended to 2027'],
              ['Ricky Tiedemann LHP TOR','-8 ranks','Forearm tightness again · IP limit precautionary'],
              ['Chase DeLauter OF CLE','-6 ranks','Hamstring strain — 4-6 weeks · Lost development time'],
              ['Dax Kilby OF NYY','-5 ranks','0-for-2 at ROK level · Signability concerns linger'],
            ].map(([n,m,note])=>(
              <div key={n} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px 3px' }}>
                  <span style={sans({ fontSize:12,fontWeight:700,color:C.text })}>{n}</span>
                  <span style={px({ fontSize:11,fontWeight:700,color:C.rust })}>{m}</span>
                </div>
                <div style={{ padding:'2px 14px 9px',...sans({ fontSize:11,color:C.text2,lineHeight:1.5 }) }}>{note}</div>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>

    {cardId != null && (() => {
      const cardBatter  = battersFV.find(b => b.mlbId === cardId);
      const cardPitcher = pitchersFV.find(p => p.mlbId === cardId);
      if (cardBatter)  return <ProspectCard prospect={cardBatter}  isPitcher={false} pool={battersFV}  onClose={() => setCardId(null)} />;
      if (cardPitcher) return <ProspectCard prospect={cardPitcher} isPitcher={true}  pool={pitchersFV} onClose={() => setCardId(null)} />;
      return null;
    })()}

    {showCompare && compareIds.length > 0 && (() => {
      const pool = batPit === 'bat' ? battersFV : pitchersFV;
      const selected = compareIds.map(id => pool.find(p => p.mlbId === id)).filter(Boolean);
      if (selected.length === 0) return null;
      return (
        <CompareModal
          prospects={selected}
          isPitcher={batPit === 'pit'}
          onClose={() => setShowCompare(false)}
          onRemove={id => setCompareIds(prev => {
            const next = prev.filter(x => x !== id);
            if (next.length === 0) setShowCompare(false);
            return next;
          })}
        />
      );
    })()}
    </>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(ProspectsPage);
