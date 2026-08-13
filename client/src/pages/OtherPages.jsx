import React, { useState, useRef, useMemo, useEffect, memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { C, px, sans, WARM_TOOLTIP } from '../constants/colors.js';
import {
  DRAFT_BOARD, DRAFT_CLASS_2026, TEAMS, SEASON, NOTABLE_TRADES,
} from '../constants/data.js';
import {
  Badge, PosBadge, FVBadge,
  Panel, StatStrip, KVRow, SkeletonRows,
} from '../components/atoms.jsx';
import { searchAndGetStats, getTodaysGames, getStandings, getAllLeaders, getAllTeamStats, getFirstRoundResults, getCareerSplits } from '../api/mlb.js';
import { getScoreboard, getRankings } from '../api/ncaa.js';
import { fmt } from '../lib/formatting.js';

// FIX: Global tooltip config — z-index 9999 prevents clip behind sibling panels
const TT = {
  ...WARM_TOOLTIP,
  wrapperStyle: { zIndex: 9999 },
};

// Module-scope, not defined inside DraftMoversPanel: a component defined
// inside another component's render body gets a brand-new function identity
// every render, so React treats it as a different component type and fully
// unmounts/remounts every instance instead of just diffing props — wasted
// work on every re-render even though this one takes no closures beyond its
// own props. See `TradeSortableTh` below for the same fix where it actually
// mattered (that one re-renders on every sort click).
function DraftMoverRow({ p, kind }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px', borderBottom:`0.5px solid ${C.borderLight}` }}>
      <span style={{ ...px({ fontSize:10, color:C.text3, width:22, flexShrink:0 }) }}>#{p.actualPick}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={sans({ fontSize:11.5, color:C.text, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' })}>{p.name}</div>
        <div style={sans({ fontSize:9.5, color:C.text3 })}>{p.pos} · {p.school}</div>
      </div>
      <span style={{ ...px({ fontSize:11, fontWeight:700, color: kind === 'riser' ? C.teal : C.rust }) }}>
        {kind === 'riser' ? '▲' : '▼'} {Math.abs(p.delta)}
      </span>
    </div>
  );
}

// Module-scope for the same reason as DraftMoverRow above — this one closed
// over TradeAnalyticsPanel's sortKey/toggleSort, which change on every sort
// click, so it was being redefined (and every <th> fully remounted, losing
// hover/focus state) on the exact interaction path where re-render cost
// matters most. sortKey/onSort now passed as explicit props instead.
function TradeSortableTh({ label, k, align = 'right', activeKey, ascending, onSort }) {
  return (
    <th onClick={() => onSort(k)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSort(k); }}
      style={{ padding:'6px 8px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em',
        color: activeKey === k ? C.amber : C.text2, textAlign:align, borderBottom:`0.5px solid ${C.border}`,
        cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
      {label}{activeKey === k ? (ascending ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

/* ─── NCAA Watch — live D1 college baseball panel ──────────────────── */
function NcaaWatchPanel() {
  const [games,    setGames]    = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [gamesRes, ranksRes] = await Promise.allSettled([
          getScoreboard(),
          getRankings('d1baseball'),
        ]);
        if (!alive) return;
        setGames(gamesRes.status === 'fulfilled' ? (gamesRes.value || []) : []);
        setRankings(ranksRes.status === 'fulfilled' ? (ranksRes.value || []).slice(0, 5) : []);
        if (gamesRes.status === 'rejected' && ranksRes.status === 'rejected') {
          setError('Could not reach the NCAA API right now.');
        }
      } catch (err) {
        if (alive) setError(err.message || 'Could not load college baseball data.');
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const liveOrRecent = useMemo(() => {
    const filtered = games.filter(g => g && (g.status === 'live' || g.status === 'final'));
    // Live games first, then most recent finals
    return filtered.sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0)).slice(0, 5);
  }, [games]);

  return (
    <Panel title="NCAA Watch" accent={C.teal} badge="D1 Baseball">
      {loading && (
        <div style={{ padding:'10px 14px' }}><SkeletonRows count={3} height={30} /></div>
      )}

      {!loading && error && (
        <div role="alert" style={{ padding:'14px' }}>
          <div style={sans({ fontSize:11, color:C.text3, lineHeight:1.5 })}>
            {error} The proxy may be rate-limited or temporarily down — try again shortly.
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Live / recent scores */}
          <div style={{ padding:'8px 14px 4px' }}>
            <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.text3 })}>
              Scores
            </div>
          </div>
          {liveOrRecent.length === 0 && (
            <div style={{ padding:'4px 14px 12px' }}>
              <div style={sans({ fontSize:11, color:C.text3 })}>No games found for the current window.</div>
            </div>
          )}
          {liveOrRecent.map((g, i) => (
            <div key={g.gameId || i} style={{
              padding:'7px 14px', borderBottom: i < liveOrRecent.length - 1 ? `0.5px solid ${C.borderLight}` : 'none',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>
                  {g.away.short || g.away.name || 'TBD'} @ {g.home.short || g.home.name || 'TBD'}
                </span>
                {g.status === 'live'
                  ? <Badge color={C.rust} bg={C.rustSoft} border={C.rust}>LIVE</Badge>
                  : <Badge color={C.text3} bg={C.surface3} border={C.border}>FINAL</Badge>
                }
              </div>
              {(g.away.score != null && g.home.score != null) && (
                <div style={px({ fontSize:12, fontWeight:700, color:C.text2, marginTop:2 })}>
                  {g.away.score} – {g.home.score}
                </div>
              )}
            </div>
          ))}

          {/* Top 5 rankings */}
          <div style={{ padding:'10px 14px 4px', borderTop:`0.5px solid ${C.border}` }}>
            <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.text3 })}>
              D1Baseball Top 5
            </div>
          </div>
          {rankings.length === 0 && (
            <div style={{ padding:'4px 14px 12px' }}>
              <div style={sans({ fontSize:11, color:C.text3 })}>Rankings unavailable right now.</div>
            </div>
          )}
          {rankings.map((r, i) => (
            <div key={r.seo || r.name || i} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'6px 14px', borderBottom: i < rankings.length - 1 ? `0.5px solid ${C.borderLight}` : 'none',
            }}>
              <span style={sans({ fontSize:11.5, color:C.text2 })}>
                <span style={px({ fontWeight:700, color:C.amber, marginRight:6 })}>{r.rank || i + 1}</span>
                {r.name || '—'}
              </span>
              {r.record && <span style={px({ fontSize:11, color:C.text3 })}>{r.record}</span>}
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}

/* ── Full 2026 Draft Class — searchable name/school directory ──────────
   Separate from the ranked Big Board on purpose: SKIP has real stats and
   scouting opinions on the top 10, but not on all 210 draft-eligible names
   here, so this stays an unranked, ungraded directory rather than
   pretending to have a grade for everyone. */
// Real actual-pick vs. pre-draft-rank comparison for the ~50 prospects in
// DRAFT_CLASS_2026 that have confirmed Round 1 results. A negative delta
// means the player went earlier (better) than SKIP's pre-draft rank — a
// riser; positive means they slid past where SKIP had them — a faller.
// This is a factual post-draft comparison, not a projection. Deliberately
// built on the static actualPick field rather than the live
// getFirstRoundResults() fetch used by the Official Results panel below —
// this keeps working (with whatever results were captured at data-entry
// time) even if that live fetch fails, is rate-limited, or MLB's draft
// feed is temporarily down.
function DraftMoversPanel() {
  const drafted = useMemo(() => {
    const canonicalRanks = new Map(DRAFT_BOARD.map(row => [normName(row.name), row.rank]));
    return DRAFT_CLASS_2026
      .filter(p => p.actualPick != null && (canonicalRanks.get(normName(p.name)) ?? p.myRank) != null)
      .map(p => {
        const skipRank = canonicalRanks.get(normName(p.name)) ?? p.myRank;
        return { ...p, skipRank, delta: p.actualPick - skipRank };
      });
  }, []);

  if (drafted.length === 0) return null;

  const risers  = [...drafted].sort((a, b) => a.delta - b.delta).slice(0, 5);
  const fallers = [...drafted].sort((a, b) => b.delta - a.delta).slice(0, 5);

  return (
    <Panel title="Draft Day Movers" accent={C.teal} badge={`${drafted.length} picks tracked`}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
        <div style={{ borderRight:`0.5px solid ${C.border}` }}>
          <div style={{ padding:'8px 14px 4px', ...sans({ fontSize:9.5, fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'.05em' }) }}>
            Beat SKIP&rsquo;s Rank
          </div>
          {risers.map(p => <DraftMoverRow key={p.name} p={p} kind="riser" />)}
        </div>
        <div>
          <div style={{ padding:'8px 14px 4px', ...sans({ fontSize:9.5, fontWeight:700, color:C.rust, textTransform:'uppercase', letterSpacing:'.05em' }) }}>
            Slid Past SKIP&rsquo;s Rank
          </div>
          {fallers.map(p => <DraftMoverRow key={p.name} p={p} kind="faller" />)}
        </div>
      </div>
      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.border}` }}>
        <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
          Actual Round 1 pick number vs. SKIP&rsquo;s pre-draft rank, for the {drafted.length} names
          with confirmed picks so far. ▲ = went earlier than ranked, ▼ = fell past where ranked.
        </div>
      </div>
    </Panel>
  );
}

function DraftClassPanel() {
  const [q, setQ] = useState('');
  const ranked = useMemo(() => {
    const canonicalRanks = new Map(DRAFT_BOARD.map(row => [normName(row.name), row.rank]));
    return [...DRAFT_CLASS_2026]
      .filter(p => (canonicalRanks.get(normName(p.name)) ?? p.myRank) != null)
      .map(p => ({ ...p, skipRank: canonicalRanks.get(normName(p.name)) ?? p.myRank }))
      .sort((a, b) => a.skipRank - b.skipRank);
  }, []);
  const unranked = useMemo(() =>
    DRAFT_CLASS_2026.filter(p => p.myRank == null).sort((a, b) => a.name.localeCompare(b.name)),
  []);

  const term = q.trim().toLowerCase();
  // Memoized for consistency with every other search/filter in this app
  // (FollowListPage, CommandPalette, etc. all wrap their filtered lists in
  // useMemo) — at ~210 names this recompute was cheap either way, but this
  // component would otherwise re-filter and re-sort-order both lists on
  // every render of DraftClassPanel for any reason, not just a real query
  // change, which is what useMemo's dependency array is for.
  const filteredRanked = useMemo(() => (
    term
      ? ranked.filter(p => p.name.toLowerCase().includes(term) || p.school.toLowerCase().includes(term))
      : ranked
  ), [ranked, term]);
  const filteredUnranked = useMemo(() => (
    term
      ? unranked.filter(p => p.name.toLowerCase().includes(term) || p.school.toLowerCase().includes(term))
      : unranked
  ), [unranked, term]);

  const boardNames = useMemo(() => new Set(DRAFT_BOARD.map(d => d.name)), []);

  return (
    <Panel title="2026 Draft Class" accent={C.slate} badge={`${DRAFT_CLASS_2026.length} tracked · ${ranked.length} scouted`}>
      <div style={{ padding:'10px 14px 8px' }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Search draft class by name or school"
          placeholder="Search by name or school…"
          style={{
            width:'100%', padding:'7px 10px', borderRadius:7, border:`0.5px solid ${C.border}`,
            background:C.surface2, color:C.text, outline:'none', transition:'border-color .15s ease',
            ...sans({ fontSize:12 }),
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.amber}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
        />
      </div>

      {filteredRanked.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['SKIP Rk','Pos','Name','School','B/T','Crowd','Actual','Move'].map(h => (
                  <th key={h} style={{ padding:'6px 10px', fontSize:9.5, fontWeight:700, textTransform:'uppercase',
                    letterSpacing:'.05em', color:C.text2, textAlign:h==='Name'||h==='School'?'left':'right',
                    borderBottom:`0.5px solid ${C.border}`, whiteSpace:'nowrap', position:'sticky', top:0, background:C.surface }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRanked.map(p => {
                const move = p.actualPick != null ? p.actualPick - p.skipRank : null; // positive = the actual pick came later than SKIP's rank
                return (
                  <tr key={p.name} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:11, fontWeight:700, color:C.text }) }}>{p.skipRank}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{p.pos}</td>
                    <td style={{ padding:'5px 10px', ...sans({ fontSize:11.5, color:C.text, fontWeight: boardNames.has(p.name) ? 700 : 500, whiteSpace:'nowrap' }) }}>
                      {p.name}{boardNames.has(p.name) && <span style={{ color:C.amber }}> ★</span>}
                    </td>
                    <td style={{ padding:'5px 10px', ...sans({ fontSize:10.5, color:C.text3, whiteSpace:'nowrap' }) }}>{p.school}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{p.bt || '—'}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{p.crowdRank ?? '—'}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:10.5, fontWeight:p.actualPick!=null?700:400, color:p.actualPick!=null?C.teal:C.text4 }) }}>
                      {p.actualPick != null ? `#${p.actualPick}` : '—'}
                    </td>
                    <td style={{ padding:'5px 10px', textAlign:'right', ...px({ fontSize:10, fontWeight:700,
                      color: move > 0 ? C.teal : move < 0 ? C.rust : C.text4 }) }}>
                      {move > 0 ? `↑${move}` : move < 0 ? `↓${Math.abs(move)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredUnranked.length > 0 && (
        <div style={{ maxHeight:200, overflowY:'auto', borderTop:`0.5px solid ${C.borderLight}` }}>
          <div style={{ padding:'8px 14px 4px', ...sans({ fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.05em' }) }}>
            Tracked, not yet individually scouted
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {filteredUnranked.map(p => (
              <div key={p.name} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
                padding:'6px 14px', borderBottom:`0.5px solid ${C.borderLight}`,
              }}>
                <span style={sans({ fontSize:11.5, color:C.text, fontWeight:500 })}>{p.name}</span>
                <span style={sans({ fontSize:10.5, color:C.text3, whiteSpace:'nowrap' })}>{p.school}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredRanked.length === 0 && filteredUnranked.length === 0 && (
        <div style={{ padding:'14px' }}>
          <div style={sans({ fontSize:11, color:C.text3 })}>No prospects match &ldquo;{q}&rdquo;.</div>
        </div>
      )}

      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.border}` }}>
        <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
          ★ = on the SKIP Big Board with full scouting grades. SKIP Rk is the canonical editorial rank shared with the Big Board. Actual = the official Round 1 pick number where confirmed. Move compares the actual pick to SKIP Rk (↑ earlier than rank, ↓ later than rank). &ldquo;Prep&rdquo; means high school.
        </div>
      </div>
    </Panel>
  );
}

function fmtBonus(v) {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(v / 1000)}K`;
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeDraftTrend(splits, isPitcher) {
  const seasons = new Set([SEASON - 2, SEASON - 1, SEASON]);
  const bySeason = new Map();
  (splits || []).forEach(split => {
    const season = Number(split?.season || split?.stat?.season);
    const stat = split?.stat || {};
    const raw = isPitcher
      ? stat.era ?? stat.earnedRunAverage
      : stat.ops ?? stat.onBasePlusSlugging;
    const value = Number(raw);
    if (!seasons.has(season) || !Number.isFinite(value) || bySeason.has(season)) return;
    bySeason.set(season, { season, value });
  });
  return Array.from(bySeason.values()).sort((a, b) => a.season - b.season);
}

function DraftTrendSparkline({ history = [], loading = false, isPitcher = false }) {
  const metric = isPitcher ? 'ERA' : 'OPS';
  if (loading) return <span role="status" aria-label="Loading three-season history" style={px({ fontSize:10, color:C.text4 })}>…</span>;
  if (history.length < 3) return <span title="No complete source-backed three-season history is available for this player" style={px({ fontSize:10, color:C.text4 })}>—</span>;
  const values = history.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const tooltipText = history.map(p => `${p.season}: ${p.value.toFixed(3)}`).join(' | ');
  return (
    <div title={`Exact season values — ${tooltipText}`} style={{ display:'inline-flex', alignItems:'center', gap:4, cursor:'help' }} tabIndex={0} aria-label={`Trend sparkline. ${tooltipText}`}>
      <LineChart width={76} height={28} data={history} margin={{ top:3, right:2, bottom:3, left:2 }}>
        <Line type="monotone" dataKey="value" stroke={isPitcher ? C.teal : C.amber} strokeWidth={2} dot={{ r:2, fill:isPitcher ? C.teal : C.amber }} isAnimationActive={false} />
      </LineChart>
      <span style={px({ fontSize:8.5, color:C.text3, fontWeight:700 })} title={tooltipText}>{metric} {min === max ? min.toFixed(3) : `${min.toFixed(3)}–${max.toFixed(3)}`}</span>
    </div>
  );
}

function DraftPage() {
  const [officialPicks, setOfficialPicks] = useState([]);
  const [officialLoading, setOfficialLoading] = useState(true);
  const [officialError, setOfficialError] = useState(false);
  const [boardPosition, setBoardPosition] = useState('all');
  const [boardSort, setBoardSort] = useState('rank-asc');
  const [draftTrends, setDraftTrends] = useState({});
  const [draftTrendLoading, setDraftTrendLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { picks } = await getFirstRoundResults(SEASON);
      if (!alive) return;
      if (picks.length === 0) setOfficialError(true);
      setOfficialPicks(picks);
      setOfficialLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Match SKIP's pre-draft Big Board against real results by normalized name.
  // Falls back to '—' per-row if the live fetch failed — the board still
  // renders SKIP's own ranking either way, this just adds "what actually
  // happened" alongside it when available.
  const officialByName = useMemo(() => {
    const m = new Map();
    officialPicks.forEach(p => m.set(normName(p.name), p));
    return m;
  }, [officialPicks]);

  useEffect(() => {
    let alive = true;
    const rowsWithIds = DRAFT_BOARD.filter(row => officialByName.get(normName(row.name))?.id);
    if (!rowsWithIds.length) {
      setDraftTrends({});
      setDraftTrendLoading(false);
      return () => { alive = false; };
    }
    setDraftTrendLoading(true);
    Promise.all(rowsWithIds.map(async row => {
      const official = officialByName.get(normName(row.name));
      const isPitcher = row.pos.includes('P');
      try {
        const splits = await getCareerSplits(official.id, isPitcher ? 'pitching' : 'hitting');
        return [row.name, normalizeDraftTrend(splits, isPitcher)];
      } catch {
        return [row.name, []];
      }
    })).then(entries => {
      if (alive) setDraftTrends(Object.fromEntries(entries));
    }).finally(() => {
      if (alive) setDraftTrendLoading(false);
    });
    return () => { alive = false; };
  }, [officialByName]);

  // Real signing bonuses by pick number, for the slot-value panel — replaces
  // the pre-draft estimates with actuals once results are in.
  const bonusByPick = useMemo(() => {
    const m = new Map();
    officialPicks.forEach(p => { if (p.signingBonus) m.set(p.pick, p.signingBonus); });
    return m;
  }, [officialPicks]);
  const hasLiveBonuses = bonusByPick.size > 0;

  const draftComplete = !officialLoading && !officialError && officialPicks.length > 0;
  const boardPositions = useMemo(() => ['all', ...Array.from(new Set(DRAFT_BOARD.map(row => row.pos))).sort()], []);
  const visibleDraftBoard = useMemo(() => {
    const rows = DRAFT_BOARD.filter(row => boardPosition === 'all' || row.pos === boardPosition);
    return [...rows].sort((a, b) => {
      if (boardSort === 'position') return a.pos.localeCompare(b.pos) || a.rank - b.rank;
      if (boardSort === 'rank-desc') return b.rank - a.rank;
      if (boardSort === 'trend-up' || boardSort === 'trend-down') {
        const histA = draftTrends[a.name] || [];
        const histB = draftTrends[b.name] || [];
        const slopeA = histA.length >= 2 ? histA[histA.length - 1].value - histA[0].value : 0;
        const slopeB = histB.length >= 2 ? histB[histB.length - 1].value - histB[0].value : 0;
        // For hitters, higher OPS slope is up (+); for pitchers, lower ERA slope is up (+).
        const adjA = a.pos.includes('P') ? -slopeA : slopeA;
        const adjB = b.pos.includes('P') ? -slopeB : slopeB;
        return boardSort === 'trend-up' ? adjB - adjA : adjA - adjB;
      }
      return a.rank - b.rank;
    });
  }, [boardPosition, boardSort, draftTrends]);
  const trackedDraftCount = DRAFT_CLASS_2026.length;
  const scoutedDraftCount = DRAFT_CLASS_2026.filter(p => p.myRank != null).length;
  const collegeDraftPct = trackedDraftCount ? Math.round(DRAFT_CLASS_2026.filter(p => p.school !== 'Prep').length / trackedDraftCount * 100) : null;

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <StatStrip items={[
        { val:String(DRAFT_BOARD.length), lbl:'Big Board',    sub:'SKIP Ranked'     },
        { val:String(trackedDraftCount),  lbl:'Draft Pool',   sub:`${scoutedDraftCount} scouted` },
        { val:draftComplete ? '✓ Jul 11' : 'Jul 11', lbl:'Draft Date', sub: draftComplete ? 'Results in' : 'Philadelphia PA' },
        { val:'20',     lbl:'Rounds',       sub:'Official format' },
        { val:collegeDraftPct == null ? '—' : `${collegeDraftPct}%`, lbl:'College', sub:collegeDraftPct == null ? 'Unavailable' : `${100 - collegeDraftPct}% Prep` },
        { val: hasLiveBonuses ? 'Live' : '$332M', lbl: hasLiveBonuses ? 'Bonuses' : 'Signing Pool', sub: hasLiveBonuses ? 'Official — Rd 1' : 'Est. Total' },
      ]} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr minmax(230px,260px)', gap:12, alignItems:'start' }}>

        {/* Big board */}
          <Panel title={`SKIP Big Board — ${visibleDraftBoard.length} of ${DRAFT_BOARD.length}`} accent={C.amber} badge="SKIP Editorial">
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', padding:'10px 14px', borderBottom:`0.5px solid ${C.borderLight}` }} role="group" aria-label="Draft board controls">
            <label htmlFor="draft-position-filter" style={sans({ fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.05em' })}>Position</label>
            <select id="draft-position-filter" aria-label="Filter Draft board by position" value={boardPosition} onChange={e => setBoardPosition(e.target.value)} style={{ height:27, padding:'0 8px', border:`1px solid ${C.border}`, borderRadius:5, fontSize:10.5, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface2, color:C.text, cursor:'pointer' }}>
              {boardPositions.map(position => <option key={position} value={position}>{position === 'all' ? 'All positions' : position}</option>)}
            </select>
            <label htmlFor="draft-sort" style={sans({ fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.05em', marginLeft:4 })}>Sort</label>
            <select id="draft-sort" aria-label="Sort Draft board" value={boardSort} onChange={e => setBoardSort(e.target.value)} style={{ height:27, padding:'0 8px', border:`1px solid ${C.border}`, borderRadius:5, fontSize:10.5, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface2, color:C.text, cursor:'pointer' }}>
              <option value="rank-asc">SKIP rank · 1 → 100</option>
              <option value="rank-desc">SKIP rank · 100 → 1</option>
              <option value="position">Position · A → Z</option>
              <option value="trend-up">Trajectory · Improving / Upward</option>
              <option value="trend-down">Trajectory · Declining / Downward</option>
            </select>
            <span style={px({ fontSize:9.5, color:C.text4, marginLeft:'auto' })}>{visibleDraftBoard.length} player{visibleDraftBoard.length === 1 ? '' : 's'} shown</span>
          </div>
          {/* FIX: overflowX on the table wrapper, not Panel itself */}
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
              <thead>
                <tr style={{ background:C.surface2 }}>
                  {['Rk','Player','Pos','School / Org','FV','Risk','ETA','Trend','Actual'].map(h => (
                    <th key={h} style={{
                      padding:'7px 10px', fontSize:10, fontWeight:700,
                      textTransform:'uppercase', letterSpacing:'.07em', color:C.text3,
                      textAlign: h==='Player'||h==='School / Org' ? 'left' : 'center',
                      borderBottom:`0.5px solid ${C.border}`, whiteSpace:'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDraftBoard.map((d, i) => {
                  const actual = officialByName.get(normName(d.name));
                  return (
                  <tr key={d.name}
                    style={{ borderBottom: i < visibleDraftBoard.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding:'7px 10px', textAlign:'center', ...px({ fontSize:13, fontWeight:800, color:i < 3 ? C.amber : C.text3 }) }}>{d.rank}</td>
                    <td style={{ padding:'7px 10px' }}>
                      <div style={sans({ fontSize:11, fontWeight:700, color:C.text })}>{d.name}</div>
                      <div style={sans({ fontSize:11, color:C.text2, marginTop:2 })}>{d.note}</div>
                    </td>
                    <td style={{ padding:'7px 10px', textAlign:'center' }}><PosBadge pos={d.pos} /></td>
                    <td style={{ padding:'7px 10px', ...sans({ fontSize:12, color:C.text2 }) }}>{d.school}</td>
                    <td style={{ padding:'7px 10px', textAlign:'center' }}><FVBadge fv={d.fv} /></td>
                    <td style={{ padding:'7px 10px', textAlign:'center' }}>
                      <Badge
                        color={d.risk==='Low'?C.teal:d.risk==='Medium'?C.amber:C.rust}
                        bg={d.risk==='Low'?C.tealSoft:d.risk==='Medium'?C.amberSoft:C.rustSoft}
                        border={C.border}
                      >{d.risk}</Badge>
                    </td>
                    <td style={{ padding:'7px 10px', textAlign:'center', ...px({ fontSize:10 }) }}>{d.eta}</td>
                    <td style={{ padding:'7px 10px', textAlign:'center', minWidth:115 }}><DraftTrendSparkline history={draftTrends[d.name]} loading={draftTrendLoading && Boolean(officialByName.get(normName(d.name))?.id)} isPitcher={d.pos.includes('P')} /></td>
                    <td style={{ padding:'7px 10px', textAlign:'center' }}>
                      {officialLoading ? (
                        <span style={px({ fontSize:10, color:C.text4 })}>…</span>
                      ) : actual ? (
                        <div>
                          <div style={px({ fontSize:11, fontWeight:800, color: actual.pick <= d.rank ? C.teal : actual.pick <= d.rank + 3 ? C.amber : C.rust })}>
                            #{actual.pick}
                          </div>
                          <div style={sans({ fontSize:9, color:C.text4 })}>{actual.team || '—'}</div>
                        </div>
                      ) : (
                        <span style={px({ fontSize:10, color:C.text4 })}>—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {draftComplete && (
            <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.borderLight}` }}>
              <span style={sans({ fontSize:9.5, color:C.text4 })}>
                SKIP ranks are editorial scouting opinions. Use the controls above to filter by position or sort by rank. Trend uses MLB Stats year-by-year history only when the official draft feed provides a player ID; rows without a source-backed history show —. The Actual column is live from MLB's official draft results; green = earlier than the SKIP rank, amber = close, red = later.
              </span>
            </div>
          )}
        </Panel>

        {/* Sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <Panel title="2026 Class Overview" accent={C.rust} badge="SKIP editorial">
            {[
              ['Class Strength','Elite at the top',C.teal],
              ['Top Tier (FV 60+)','5 players',C.amber],
              ['Second Tier (FV 55)','5 players',C.amber],
              ['College Pitching','Flora leads, thin after',C.amber],
              ['College Hitting','Deep — Cholowsky, Lackey',C.teal],
              ['HS Position Players','Emerson generational',C.teal],
              ['Prep Arms','Rojas headlines, volatile',C.rust],
            ].map(([l,v,c], i, arr) => (
              <KVRow key={l} label={l} value={v} color={c} last={i===arr.length-1} />
            ))}
          </Panel>

          <Panel title={hasLiveBonuses ? 'Slot Values — Official' : 'Slot Values (Est.)'} accent={C.amber} badge={hasLiveBonuses ? 'Live' : undefined}>
            {(hasLiveBonuses
              ? [1, 5, 10, 15, 20, 30].map(pick => [
                  `Pick #${pick}`,
                  fmtBonus(bonusByPick.get(pick)) ?? '—',
                ])
              : [
                  ['Pick #1','$10.4M'],['Pick #5','$7.9M'],['Pick #10','$5.2M'],
                  ['Pick #15','$3.8M'],['Pick #30','$2.1M'],['Comp Round','$1.2–1.9M'],
                ]
            ).map(([l,v], i, arr) => (
              <KVRow key={l} label={l} value={v} color={C.teal} last={i===arr.length-1} />
            ))}
          </Panel>

          <Panel title="SKIP Value Picks" accent={C.teal} badge="SKIP editorial">
            {[
              ['Vahn Lackey · C',    '▲ vs slot','Elite two-way catcher — power/speed rare at the position'],
              ['Justin Lebron · SS', '▲ vs slot','High-probability college SS floor, underpriced relative to safe college track record'],
              ['Tyler Bell · SS',    '= slot',   'Consensus college talent — safe, steady everyday profile'],
            ].map(([n,v,note], i, arr) => (
              <div key={n} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none', padding:'7px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={sans({ fontSize:10.5, fontWeight:700, color:C.text })}>{n}</span>
                  <span style={px({ fontSize:10, fontWeight:700, color:C.teal })}>{v}</span>
                </div>
                <div style={sans({ fontSize:11, color:C.text2, marginTop:2 })}>{note}</div>
              </div>
            ))}
          </Panel>

          <NcaaWatchPanel />
        </div>
      </div>

      {/* Official live results — full Round 1, straight from MLB's draft feed */}
      <Panel title="Official Round 1 Results" accent={C.navy} badge={
        officialLoading
          ? <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.text3 }}>Loading…</span>
          : officialError
          ? <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.rust }}>Unavailable</span>
          : <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:C.teal }}/>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.teal }}>LIVE · MLB.com</span>
            </div>
      }>
        {officialLoading && (
          <div style={{ padding:'10px 14px' }}><SkeletonRows count={5} height={36} /></div>
        )}
        {!officialLoading && officialError && (
          <div style={{ padding:'16px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
            Official results unavailable right now — MLB's draft feed may be temporarily down. SKIP's Big Board above is unaffected.
          </div>
        )}
        {!officialLoading && !officialError && (
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
              <thead>
                <tr style={{ background:C.surface2 }}>
                  {['Pk','Player','Pos','B/T','School / Hometown','Team','Bonus'].map(h => (
                    <th key={h} style={{
                      padding:'6px 10px', fontSize:10, fontWeight:700, textTransform:'uppercase',
                      letterSpacing:'.06em', color:C.text3,
                      textAlign: h==='Player'||h==='School / Hometown' ? 'left' : 'center',
                      borderBottom:`0.5px solid ${C.border}`, whiteSpace:'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {officialPicks.map((p, i) => (
                  <tr key={p.id ?? i}
                    style={{ borderBottom: i < officialPicks.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding:'6px 10px', textAlign:'center', ...px({ fontSize:11, fontWeight:700, color:C.text3 }) }}>{p.pick}</td>
                    <td style={{ padding:'6px 10px', ...sans({ fontSize:11.5, fontWeight:700, color:C.text }) }}>{p.name}</td>
                    <td style={{ padding:'6px 10px', textAlign:'center' }}>{p.pos ? <PosBadge pos={p.pos} /> : <span style={px({ fontSize:10, color:C.text4 })}>—</span>}</td>
                    <td style={{ padding:'6px 10px', textAlign:'center', ...px({ fontSize:10, color:C.text3 }) }}>{p.bats && p.throws ? `${p.bats}/${p.throws}` : '—'}</td>
                    <td style={{ padding:'6px 10px', ...sans({ fontSize:11, color:C.text2 }) }}>
                      {p.school}{p.homeState ? ` · ${p.homeState}` : ''}
                    </td>
                    <td style={{ padding:'6px 10px', textAlign:'center', ...sans({ fontSize:11, fontWeight:600, color:C.text2 }) }}>{p.team || '—'}</td>
                    <td style={{ padding:'6px 10px', textAlign:'center', ...px({ fontSize:11, fontWeight:700, color:C.teal }) }}>{fmtBonus(p.signingBonus) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <DraftMoversPanel />

      <DraftClassPanel />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LEAGUE
═══════════════════════════════════════════════════════ */
function LeaguePage() {
  const [liveGames,   setLiveGames]   = useState([]);
  const [standings,   setStandings]   = useState({});
  const [leaders,     setLeaders]     = useState({});
  const [teamStats,   setTeamStats]   = useState({ hitting:{}, pitching:{} });
  const [gamesLoading,setGamesLoading]= useState(true);
  const [stdLoading,  setStdLoading]  = useState(true);

  // Static leaderboard state (Statcast-enriched data)
  const [lbTab,    setLbTab]    = useState('hitting');
  const [lbSort,   setLbSort]   = useState('ops');
  const [lbFilter, setLbFilter] = useState('all');

  const liveHitterRows = useMemo(() => {
    const byId = new Map();
    const add = (category, key) => (leaders[category] || []).forEach(entry => {
      const id = entry.id || entry.name;
      const row = byId.get(id) || { id, name:entry.name, team:entry.team, rank:entry.rank };
      row[key] = Number(entry.value);
      row.rank = row.rank == null ? entry.rank : Math.min(row.rank, entry.rank);
      byId.set(id, row);
    });
    add('battingAverage', 'avg');
    add('onBasePlusSlugging', 'ops');
    add('homeRuns', 'hr');
    add('runsBattedIn', 'rbi');
    add('stolenBases', 'sb');
    return [...byId.values()];
  }, [leaders]);

  const livePitcherRows = useMemo(() => {
    const byId = new Map();
    const add = (category, key) => (leaders[category] || []).forEach(entry => {
      const id = entry.id || entry.name;
      const row = byId.get(id) || { id, name:entry.name, team:entry.team, rank:entry.rank };
      row[key] = Number(entry.value);
      row.rank = row.rank == null ? entry.rank : Math.min(row.rank, entry.rank);
      byId.set(id, row);
    });
    add('earnedRunAverage', 'era');
    add('whip', 'whip');
    add('strikeouts', 'k');
    add('wins', 'wins');
    add('saves', 'saves');
    return [...byId.values()];
  }, [leaders]);

  const sortedHitters = useMemo(() => {
    const rows = lbFilter === 'all' ? liveHitterRows : liveHitterRows.filter(r => r.team === lbFilter);
    return [...rows].sort((a,b) => {
      if (lbSort === 'ops') return (b.ops ?? -Infinity) - (a.ops ?? -Infinity);
      if (lbSort === 'avg') return (b.avg ?? -Infinity) - (a.avg ?? -Infinity);
      if (lbSort === 'hr')  return (b.hr  ?? -Infinity) - (a.hr  ?? -Infinity);
      if (lbSort === 'rbi') return (b.rbi ?? -Infinity) - (a.rbi ?? -Infinity);
      if (lbSort === 'sb')  return (b.sb  ?? -Infinity) - (a.sb  ?? -Infinity);
      return (b.ops ?? -Infinity) - (a.ops ?? -Infinity);
    });
  }, [lbSort, lbFilter, liveHitterRows]);

  const sortedPitchers = useMemo(() => {
    return [...livePitcherRows].sort((a,b) => {
      if (lbSort === 'era')  return a.era  - b.era;
      if (lbSort === 'wins') return b.wins - a.wins;
      if (lbSort === 'saves')return b.saves - a.saves;
      if (lbSort === 'whip') return a.whip - b.whip;
      if (lbSort === 'k')    return b.k    - a.k;
      return a.era - b.era;
    });
  }, [lbSort, livePitcherRows]);

  const lbTeams = ['all', ...new Set(liveHitterRows.map(r => r.team).filter(Boolean))].sort();

  const HIT_COLS = [
    { key:'avg',  label:'AVG', fmt:v=>v.toFixed(3).replace('0.','.') },
    { key:'ops',  label:'OPS', fmt:v=>v.toFixed(3).replace('0','') },
    { key:'hr',   label:'HR',  fmt:v=>String(v) },
    { key:'rbi',  label:'RBI', fmt:v=>String(v) },
    { key:'sb',   label:'SB',  fmt:v=>String(v) },
  ];

  const PIT_COLS = [
    { key:'era',   label:'ERA',   fmt:v=>v.toFixed(2) },
    { key:'whip',  label:'WHIP',  fmt:v=>v.toFixed(2) },
    { key:'k',     label:'K',     fmt:v=>String(v) },
    { key:'wins',  label:'W',     fmt:v=>String(v) },
    { key:'saves', label:'SV',    fmt:v=>String(v) },
  ];

  const { opsSorted, eraSorted, opsMin, opsMax, eraMin, eraMax } = useMemo(() => {
    const teamBarData = Object.values(TEAMS).map(t => {
      const hitting = teamStats.hitting[t.id] || {};
      const pitching = teamStats.pitching[t.id] || {};
      return {
        team: t.abbr,
        ops: hitting.ops != null ? Math.round(Number(hitting.ops) * 1000) : null,
        era: pitching.era != null ? Number(pitching.era) : null,
      };
    }).filter(t => t.ops != null || t.era != null);
    const opsSorted = [...teamBarData].sort((a,b) => b.ops - a.ops).slice(0,6);
    const eraSorted = [...teamBarData].sort((a,b) => a.era - b.era).slice(0,6);
    return {
      opsSorted, eraSorted,
      opsMin: opsSorted.length ? Math.floor(opsSorted[opsSorted.length-1].ops / 10) * 10 - 10 : 0,
      opsMax: opsSorted.length ? Math.ceil(opsSorted[0].ops / 10) * 10 + 10 : 1,
      eraMin: eraSorted.length ? Math.floor(eraSorted[0].era * 10) / 10 - 0.2 : 0,
      eraMax: eraSorted.length ? Math.ceil(eraSorted[eraSorted.length-1].era * 10) / 10 + 0.3 : 1,
    };
  }, [teamStats]);

  const leagueTeamSummary = useMemo(() => {
    const hitting = Object.values(teamStats.hitting).filter(s => s.ops != null);
    const pitching = Object.values(teamStats.pitching).filter(s => s.era != null);
    return {
      avgOps: hitting.length ? (hitting.reduce((sum, s) => sum + Number(s.ops), 0) / hitting.length).toFixed(3) : '—',
      avgEra: pitching.length ? (pitching.reduce((sum, s) => sum + Number(s.era), 0) / pitching.length).toFixed(2) : '—',
      homeRuns: hitting.length ? hitting.reduce((sum, s) => sum + Number(s.homeRuns || 0), 0).toLocaleString() : '—',
    };
  }, [teamStats]);

  // Fetch live games
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const games = await getTodaysGames();
        if (alive) setLiveGames(games.slice(0, 12));
      } catch { /* best effort */ }
      if (alive) setGamesLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [std, ldr, hitting, pitching] = await Promise.allSettled([
          getStandings(), getAllLeaders(), getAllTeamStats('hitting'), getAllTeamStats('pitching'),
        ]);
        if (alive) {
          if (std.status === 'fulfilled') setStandings(std.value);
          if (ldr.status === 'fulfilled') setLeaders(ldr.value);
          setTeamStats({
            hitting: hitting.status === 'fulfilled' ? hitting.value : {},
            pitching: pitching.status === 'fulfilled' ? pitching.value : {},
          });
        }
      } catch { /* best effort */ }
      if (alive) setStdLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const hasStandings = Object.keys(standings).length > 0;
  const hasLeaders   = Object.keys(leaders).length > 0;

  function gameStatusLabel(g) {
    if (g.statusCode === 'F' || g.status === 'Final') return 'Final';
    if (g.inning) return `${g.inningHalf === 'top' ? '▲' : '▼'}${g.inning}`;
    return g.status || 'Pre';
  }
  function isLive(g) { return g.inning && g.status !== 'Final' && g.statusCode !== 'F'; }

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <StatStrip items={[
        { val:'30',     lbl:'Teams',          sub:'MLB'         },
        { val:gamesLoading ? '…' : String(liveGames.length), lbl:'Games Today', sub:'Live/Final' },
        { val:leagueTeamSummary.avgOps,  lbl:'Avg Team OPS',   sub:'Live season' },
        { val:leagueTeamSummary.avgEra,   lbl:'Avg ERA',        sub:'Live season' },
        { val:leagueTeamSummary.homeRuns, lbl:'Total HRs',      sub:'Live season' },
        { val:'—',                        lbl:'Avg Attendance', sub:'Unavailable' },
      ]}/>

      {/* ── Live Scoreboard ── */}
      <Panel title="Today's Scoreboard" accent={C.rust} badge={
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          {gamesLoading
            ? <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.text3 }}>Loading…</span>
            : <><div style={{ width:6, height:6, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }}/><span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.teal }}>LIVE</span></>
          }
        </div>
      }>
        {gamesLoading && (
          <div style={{ padding:'10px 14px' }}>
            <SkeletonRows count={4} height={40} />
          </div>
        )}
        {!gamesLoading && liveGames.length === 0 && (
          <div style={{ padding:'16px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
            No games scheduled today or API unavailable
          </div>
        )}
        {!gamesLoading && liveGames.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:0 }}>
            {liveGames.map((g, i) => {
              const live = isLive(g);
              const status = gameStatusLabel(g);
              const awayWin = g.away.runs != null && g.home.runs != null && g.away.runs > g.home.runs;
              const homeWin = g.away.runs != null && g.home.runs != null && g.home.runs > g.away.runs;
              return (
                <div key={g.gamePk} style={{
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

      {/* ── Standings ── */}
      {stdLoading && (
        <div style={{ padding:'10px 14px' }}><SkeletonRows count={6} height={26} /></div>
      )}
      {!stdLoading && hasStandings && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:12 }}>
          {Object.entries(standings).map(([div, teams]) => (
            <Panel key={div} title={div} accent={C.navy}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:C.surface2 }}>
                    {['Team','W','L','PCT','GB','L10','RS','RA'].map(h => (
                      <th key={h} style={{ padding:'5px 8px', fontSize:9.5, fontWeight:700, textTransform:'uppercase',
                        letterSpacing:'.05em', color:C.text2, textAlign:h==='Team'?'left':'right',
                        borderBottom:`0.5px solid ${C.border}`,
                        borderLeft: h==='Team' ? '3px solid transparent' : 'none',
                        whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t, i) => {
                    const teamColor = TEAMS[(t.abbr || '').toLowerCase()]?.color;
                    return (
                    <tr key={t.id} style={{ borderBottom:i<teams.length-1?`0.5px solid ${C.borderLight}`:'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding:'5px 8px', ...sans({ fontSize:11, fontWeight:700, color:C.text }),
                        borderLeft: teamColor ? `3px solid ${teamColor}` : '3px solid transparent' }}>
                        <span style={{ ...px({ fontSize:9, color:C.text3, marginRight:6 })}}>{t.divRank}</span>
                        {t.abbr || (t.name||'').split(' ').pop()}
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:11, fontWeight:700, color:teamColor || C.teal }) }}>{t.w}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:11, color:C.text }) }}>{t.l}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:11, color:C.text }) }}>{(t.pct||0).toFixed(3)}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{t.gb === '-' || !t.gb ? '—' : t.gb}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{t.l10||'—'}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{t.rs||'—'}</td>
                      <td style={{ padding:'5px 8px', textAlign:'right', ...px({ fontSize:10, color:C.text3 }) }}>{t.ra||'—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      )}
      {!stdLoading && !hasStandings && (
        <Panel title="Standings" accent={C.navy} badge="Unavailable">
          <div style={{padding:'16px 14px',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
            Official MLB standings are unavailable right now. Static snapshots are intentionally hidden so stale records are not presented as current.
          </div>
        </Panel>
      )}

      {/* ── Stat charts row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <Panel title="Competitive Balance Index" accent={C.amber} badge="Unavailable">
          <div style={{padding:'28px 14px',textAlign:'center',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
            No authoritative league-wide parity source is connected. The prior snapshot is hidden.
          </div>
        </Panel>

        <Panel title="Team OPS Leaders" accent={C.teal}>
          <div style={{ padding:'8px 0 4px' }}>
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={opsSorted} layout="vertical" margin={{ top:2,right:40,bottom:2,left:4 }}>
                <CartesianGrid stroke={C.borderLight} horizontal={false}/>
                <XAxis type="number" domain={[opsMin,opsMax]}
                  tickFormatter={v=>(v/1000).toFixed(3).replace('0.','. ')}
                  tick={{ fontSize:10,fill:C.text3 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="team"
                  tick={{ fontSize:11,fill:C.text2,fontFamily:"'DM Mono',monospace",fontWeight:600 }}
                  width={38} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={v=>[(v/1000).toFixed(3),'OPS']}/>
                <Bar isAnimationActive={false} dataKey="ops" fill={C.amber} radius={[0,3,3,0]} maxBarSize={20}
                  label={{ position:'right',fontSize:10,fill:C.amberDark,fontFamily:"'DM Mono',monospace",
                    formatter:v=>(v/1000).toFixed(3).replace('0.','.')}}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Best Team ERAs" accent={C.rust}>
          <div style={{ padding:'8px 0 4px' }}>
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={eraSorted} layout="vertical" margin={{ top:2,right:40,bottom:2,left:4 }}>
                <CartesianGrid stroke={C.borderLight} horizontal={false}/>
                <XAxis type="number" domain={[eraMin,eraMax]}
                  tickFormatter={v=>v.toFixed(2)} tick={{ fontSize:10,fill:C.text3 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="team"
                  tick={{ fontSize:11,fill:C.text2,fontFamily:"'DM Mono',monospace",fontWeight:600 }}
                  width={38} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={v=>[v.toFixed(2),'ERA']}/>
                <Bar isAnimationActive={false} dataKey="era" fill={C.rust} radius={[0,3,3,0]} maxBarSize={20}
                  label={{ position:'right',fontSize:10,fill:C.rust,fontFamily:"'DM Mono',monospace",
                    formatter:v=>v.toFixed(2)}}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ── Live MLB Leaderboard ── */}
      <Panel title="Leaderboard" accent={C.amber} badge={`2026 · ${hasLeaders ? 'Live' : 'Unavailable'}`}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          borderBottom:`0.5px solid ${C.border}`, padding:'0 14px', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex' }}>
            {[['hitting','Hitting'],['pitching','Pitching']].map(([k,l])=>(
              <button key={k} onClick={()=>{ setLbTab(k); setLbSort(k==='hitting'?'ops':'era'); }}
                style={{ padding:'8px 16px', fontSize:11, fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:600,
                  color:lbTab===k?C.amber:C.text3, borderBottom:lbTab===k?`2px solid ${C.amber}`:'2px solid transparent',
                  background:'transparent', border:'none', cursor:'pointer', transition:'all .12s' }}>
                {l}
              </button>
            ))}
          </div>
          {lbTab === 'hitting' && (
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:4 }}>
              <span style={sans({ fontSize:10, color:C.text3 })}>Team:</span>
              <select value={lbFilter} onChange={e=>setLbFilter(e.target.value)}
                style={{ height:26, padding:'0 8px', border:`1px solid ${C.border}`, borderRadius:5, fontSize:11,
                  fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface, color:C.text, cursor:'pointer' }}>
                {lbTeams.map(t => <option key={t} value={t}>{t === 'all' ? 'All Teams' : t}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:C.surface2 }}>
                <th style={{ padding:'6px 14px', textAlign:'left', ...sans({ fontSize:10, fontWeight:700, color:C.text3 }) }}>Player</th>
                <th style={{ padding:'6px 8px', textAlign:'center', ...sans({ fontSize:10, fontWeight:700, color:C.text3 }) }}>Team</th>
                {(lbTab === 'hitting' ? HIT_COLS : PIT_COLS).map(col=>(
                  <th key={col.key} onClick={()=>setLbSort(col.key)}
                    tabIndex={0} role="button" aria-pressed={lbSort===col.key}
                    onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setLbSort(col.key); } }}
                    style={{ padding:'6px 8px', textAlign:'right', cursor:'pointer', whiteSpace:'nowrap',
                      ...px({ fontSize:10, fontWeight:700, color:lbSort===col.key?C.amber:C.text3 }) }}>
                    {col.label}{lbSort===col.key?' ↑':''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(lbTab === 'hitting' ? sortedHitters : sortedPitchers).length === 0 ? (
                <tr><td colSpan={(lbTab === 'hitting' ? HIT_COLS : PIT_COLS).length + 2} style={{padding:'18px 14px',color:C.text3,textAlign:'center'}}>
                  Live MLB leader data is unavailable; static snapshot rows are intentionally hidden.
                </td></tr>
              ) : (lbTab === 'hitting' ? sortedHitters : sortedPitchers).map((r,i,arr) => (
                <tr key={r.name} style={{ background:i%2===0?C.surface:C.surface2 }}>
                  <td style={{ padding:'6px 14px', whiteSpace:'nowrap', ...sans({ fontSize:12, fontWeight:600, color:C.text }) }}>
                    <span style={{ ...px({ fontSize:10, color:C.text3 }), marginRight:8 }}>{r.rank}</span>{r.name}
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'center', ...sans({ fontSize:11, fontWeight:700, color:C.text2 }) }}>{r.team}</td>
                  {(lbTab === 'hitting' ? HIT_COLS : PIT_COLS).map(col => {
                    const v = r[col.key];
                    const isActive = lbSort === col.key;
                    return (
                      <td key={col.key} style={{ padding:'6px 8px', textAlign:'right', whiteSpace:'nowrap',
                        ...px({ fontSize:12, fontWeight:isActive?700:400, color:isActive?C.amber:C.text }) }}>
                        {v != null ? col.fmt(v) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Stat leaders + trends + injury + farm ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <Panel title="League Trends 2026" accent={C.amber} badge="Unavailable">
          <div style={{padding:'28px 14px',textAlign:'center',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
            No verified trend feed is connected. The prior editorial snapshot is hidden.
          </div>
        </Panel>

        <Panel title="Injury Overview" accent={C.rust} badge="Unavailable">
          <div style={{padding:'28px 14px',textAlign:'center',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
            No authoritative injury feed is connected. Static injury counts are intentionally hidden.
          </div>
        </Panel>

        <Panel title="Farm System Rankings" accent={C.teal} badge="Unavailable">
          <div style={{padding:'28px 14px',textAlign:'center',...sans({fontSize:11,color:C.text3,lineHeight:1.5})}}>
            A current, source-backed farm-system ranking is not connected. The prior snapshot is hidden.
          </div>
        </Panel>
      </div>

      {/* ── Live stat leaders (when available) ── */}
      {hasLeaders && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12 }}>
          {[
            ['HR Leaders',          leaders.homeRuns,           C.rust],
            ['AVG Leaders',         leaders.battingAverage,     C.amber],
            ['OPS Leaders',         leaders.onBasePlusSlugging, C.teal],
            ['RBI Leaders',         leaders.runsBattedIn,       C.navy],
            ['SB Leaders',          leaders.stolenBases,        C.purple],
            ['ERA Leaders',         leaders.earnedRunAverage,   C.rust],
            ['K Leaders',           leaders.strikeouts,         C.slate],
            ['WHIP Leaders',        leaders.whip,               C.amber],
            ['Win Leaders',         leaders.wins,               C.teal],
            ['Saves Leaders',       leaders.saves,              C.navy],
          ].filter(([,data])=>data?.length>0).map(([title,data,color])=>(
            <Panel key={title} title={title} accent={color} badge="Live">
              {data.slice(0,5).map((r,i,arr)=>(
                <div key={r.id||i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'6px 14px',borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
                  <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                    <span style={{...px({fontSize:10,color:C.text4}),minWidth:14}}>{r.rank}</span>
                    <div>
                      <div style={sans({ fontSize:11,fontWeight:700,color:C.text })}>{r.name.split(' ').slice(-1)[0]}</div>
                      <div style={sans({ fontSize:9.5,color:C.text3 })}>{r.team}</div>
                    </div>
                  </div>
                  <span style={px({ fontSize:13,fontWeight:800,color })}>{r.value}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   INTELLIGENCE
═══════════════════════════════════════════════════════ */

// Module-scope formatter — avoids re-creation on every render
// (fmt comes from ../lib/formatting.js)
// Team-abbr -> full team record lookup, built once. TEAMS is keyed by a
// lowercase code (e.g. 'ath') that doesn't always match the abbr string
// used elsewhere (e.g. 'ATH') — this indexes by abbr directly so trade
// records (which only carry the abbr) can look up color/name in O(1).
const TEAM_BY_ABBR = Object.fromEntries(Object.values(TEAMS).map(t => [t.abbr, t]));

function TradeTeamChip({ abbr }) {
  const color = TEAM_BY_ABBR[abbr]?.color || C.slate;
  return (
    <span style={{
      ...px({ fontSize:9.5, fontWeight:800, color }),
      background:`color-mix(in srgb, ${color} 12%, transparent)`,
      padding:'2px 6px', borderRadius:4, whiteSpace:'nowrap',
    }}>{abbr}</span>
  );
}

// Team success-rate leaderboard (Roadmap #5), computed from NOTABLE_TRADES
// itself rather than a second, separately-sourced dataset — every team that
// appears on either side of a trade gets one tally: a "win" if their side
// of that specific deal came out ahead on netWar. This is deliberately NOT
// a claim about a team's full trade history the way the Freylitics
// reference chart's 2021-present sample is — it's a small, self-consistent
// record across only the trades tracked below, and the panel caption says
// so rather than implying broader coverage than the data actually has.
const TRADE_TEAM_RECORDS = (() => {
  const rec = {};
  const bump = (abbr, won) => {
    rec[abbr] = rec[abbr] || { wins: 0, total: 0 };
    rec[abbr].total += 1;
    if (won) rec[abbr].wins += 1;
  };
  NOTABLE_TRADES.forEach(t => {
    // No trade in this dataset actually lands on an exact 0, but guard it
    // rather than silently crediting either side a win it didn't earn.
    if (t.netWar === 0) { bump(t.fromTeam, false); bump(t.toTeam, false); return; }
    const fromWon = t.netWar > 0;
    bump(t.fromTeam, fromWon);
    bump(t.toTeam, !fromWon);
  });
  return Object.entries(rec)
    .map(([abbr, { wins, total }]) => ({ abbr, wins, total, pct: Math.round((wins / total) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
})();

function TradeAnalyticsPanel() {
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(false); // newest first by default

  const sortedTrades = useMemo(() => [...NOTABLE_TRADES].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortAsc ? cmp : -cmp;
  }), [sortKey, sortAsc]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <Panel title="Team Success Rate — Notable Deadline Trades" accent={C.purple}
        badge={`${NOTABLE_TRADES.length} trades tracked`}>
        <div style={{ padding:'10px 14px 4px' }}>
          <ResponsiveContainer width="100%" height={Math.max(160, TRADE_TEAM_RECORDS.length * 26)}>
            <BarChart data={TRADE_TEAM_RECORDS} layout="vertical" margin={{ left:8, right:24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize:10, fill:C.text3 }} unit="%" />
              <YAxis type="category" dataKey="abbr" width={44} tick={{ fontSize:11, fontWeight:700, fill:C.text }} />
              <Tooltip {...TT} formatter={(v, n, p) => [`${p.payload.wins}/${p.payload.total} trades (${v}%)`, 'Success rate']} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {TRADE_TEAM_RECORDS.map((r, i) => <Cell key={i} fill={r.pct >= 50 ? C.teal : C.rust} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ padding:'4px 14px 10px' }}>
          <div style={sans({ fontSize:9.5, color:C.text4, lineHeight:1.4 })}>
            Record across the {NOTABLE_TRADES.length} trades tracked below — not each team&rsquo;s full
            trade history. &ldquo;Win&rdquo; = that team&rsquo;s side of a specific deal outproduced the
            other side on netWAR from the trade date forward.
          </div>
        </div>
      </Panel>

      <Panel title="Notable Trades — High-End Starting Pitchers" accent={C.purple} badge="netWAR from sending team's POV">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
            <thead>
              <tr>
                <TradeSortableTh label="Date" k="date" align="left" activeKey={sortKey} ascending={sortAsc} onSort={toggleSort} />
                <TradeSortableTh label="From" k="fromTeam" align="center" activeKey={sortKey} ascending={sortAsc} onSort={toggleSort} />
                <TradeSortableTh label="To" k="toTeam" align="center" activeKey={sortKey} ascending={sortAsc} onSort={toggleSort} />
                <th style={{ padding:'6px 8px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em',
                  color:C.text2, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>Trade</th>
                <TradeSortableTh label="netWAR" k="netWar" align="right" activeKey={sortKey} ascending={sortAsc} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map(t => (
                <tr key={`${t.date}-${t.headliner}`} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                  <td style={{ padding:'7px 8px', ...px({ fontSize:10.5, color:C.text3, whiteSpace:'nowrap' }) }}>{t.date}</td>
                  <td style={{ padding:'7px 8px', textAlign:'center' }}><TradeTeamChip abbr={t.fromTeam} /></td>
                  <td style={{ padding:'7px 8px', textAlign:'center' }}><TradeTeamChip abbr={t.toTeam} /></td>
                  <td style={{ padding:'7px 8px', ...sans({ fontSize:10.5, color:C.text }) }}>
                    <div style={{ fontWeight:700 }}>{t.sent.join(', ')}</div>
                    <div style={{ color:C.text3, marginTop:1 }}>for {t.received.join(', ')}</div>
                  </td>
                  <td style={{ padding:'7px 8px', textAlign:'right', ...px({ fontSize:11.5, fontWeight:800,
                    color: t.netWar > 0 ? C.teal : t.netWar < 0 ? C.rust : C.text3 }) }}>
                    {t.netWar > 0 ? '+' : ''}{t.netWar.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.border}` }}>
          <div style={sans({ fontSize:9.5, color:C.text4, lineHeight:1.4 })}>
            netWAR is shown from the perspective of the team trading away the headliner: positive means
            that team&rsquo;s return outproduced the headliner from the trade date forward, negative means
            the acquiring team won the deal. Fixed dataset of real trades — WAR outcomes are as of
            compilation time, not live-updating.
          </div>
        </div>
      </Panel>
    </div>
  );
}

function IntelligencePage() {
  const [p1, setP1]             = useState('');
  const [p2, setP2]             = useState('');
  const [compData, setCompData] = useState(null);
  const [compLoading, setLoading] = useState(false);
  const [compError, setError]   = useState(null);
  const running                 = useRef(false);
  const mountedRef              = useRef(true);

  // Same "don't setState after unmount" convention used by PlayersPage's
  // search/pickPlayer handlers — runComp is triggered from a button click
  // rather than an effect, so there's no natural cleanup function to hang
  // this off of otherwise.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // fmt hoisted to module scope — see top of file

  const runComp = async () => {
    if (!p1.trim() || !p2.trim() || running.current) return;
    if (p1.trim().toLowerCase() === p2.trim().toLowerCase()) {
      setError('Enter two different players to compare.');
      return;
    }
    running.current = true;
    setLoading(true);
    setCompData(null);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        searchAndGetStats(p1.trim(), SEASON),
        searchAndGetStats(p2.trim(), SEASON),
      ]);
      if (!mountedRef.current) { running.current = false; return; }
      if (!r1 || !r2) {
        setError('Could not find one or both players. Check spelling and try again.');
        setLoading(false);
        running.current = false;
        return;
      }
      const s1 = r1.stats, s2 = r2.stats;
      const seasonNote = (r1.isFallback || r2.isFallback)
        ? ` (using ${r1.season}/${r2.season} data)` : '';
      // Display a real 0 as "0", not "—" (em dash is reserved for genuinely missing data)
      const dash = (v) => (v === null || v === undefined || v === '') ? '—' : v;
      if (mountedRef.current) setCompData({
        n1: r1.name, n2: r2.name, seasonNote,
        rows: [
          ['AVG', fmt(s1.avg),           fmt(s2.avg),           parseFloat(s1.avg)||0,       parseFloat(s2.avg)||0],
          ['OBP', fmt(s1.obp),           fmt(s2.obp),           parseFloat(s1.obp)||0,       parseFloat(s2.obp)||0],
          ['SLG', fmt(s1.slg),           fmt(s2.slg),           parseFloat(s1.slg)||0,       parseFloat(s2.slg)||0],
          ['OPS', fmt(s1.ops),           fmt(s2.ops),           parseFloat(s1.ops)||0,       parseFloat(s2.ops)||0],
          ['HR',  dash(s1.homeRuns),     dash(s2.homeRuns),     parseInt(s1.homeRuns)||0,    parseInt(s2.homeRuns)||0],
          ['RBI', dash(s1.rbi),          dash(s2.rbi),          parseInt(s1.rbi)||0,         parseInt(s2.rbi)||0],
          ['SB',  dash(s1.stolenBases),  dash(s2.stolenBases),  parseInt(s1.stolenBases)||0, parseInt(s2.stolenBases)||0],
          ['K',   dash(s1.strikeOuts),   dash(s2.strikeOuts),   parseInt(s1.strikeOuts)||0,  parseInt(s2.strikeOuts)||0, true],
          ['BB',  dash(s1.baseOnBalls),  dash(s2.baseOnBalls),  parseInt(s1.baseOnBalls)||0, parseInt(s2.baseOnBalls)||0],
        ],
      });
    } catch (err) {
      if (mountedRef.current) setError(`API error: ${err.message}`);
      setLoading(false);
      running.current = false;
      return;
    }
    if (mountedRef.current) setLoading(false);
    running.current = false;
  };

  const hitters = [
    ['Aaron Judge','RF','.285',48,115,'1.018',8.4],
    ['Shohei Ohtani','DH','.292',27,74,'.937',6.4],
    ['Freddie Freeman','1B','.306',24,96,'.921',6.2],
    ['Juan Soto','RF','.291',31,98,'.967',7.1],
    ['Gunnar Henderson','SS','.272',36,98,'.918',6.8],
    ['Mookie Betts','SS','.296',26,84,'.932',6.4],
  ];
  const pitchers = [
    ['Gerrit Cole','R',2.88,11.2,'1.03',14,6.8],
    ['Spencer Strider','R',2.76,13.1,'0.99',15,7.2],
    ['Tarik Skubal','L',2.92,10.8,'1.06',16,6.5],
    ['Yoshinobu Yamamoto','R',2.98,10.4,'1.07',14,5.6],
    ['Zack Wheeler','R',3.04,9.8,'1.09',13,5.4],
    ['Dylan Cease','R',3.22,10.6,'1.18',12,4.8],
  ];
  const injuryRisks = [
    ['Ricky Tiedemann LHP TOR',82,'High','Recurring forearm · Velo monitoring flagged',C.rust],
    ['Hunter Greene RHP CIN',71,'High','High velo profile correlates with arm fatigue',C.rust],
    ['Corbin Burnes RHP BAL',48,'Medium','Innings load entering age-31 season',C.amber],
    ['Julio Rodríguez OF SEA',39,'Medium','Aggressive runner — hamstring history',C.amber],
    ['Freddie Freeman 1B LAD',12,'Low','Clean history, optimal workload management',C.teal],
    ['Zack Wheeler RHP PHI',14,'Low','Durable profile, consistent mechanics',C.teal],
  ];

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

        {/* Comparison */}
        <Panel title="Player Comparison Engine" accent={C.amber} badge={`${SEASON} Season`}>
          <div style={{ padding:'12px 14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              {[[p1,setP1,'Player 1 (e.g. Aaron Judge)'],[p2,setP2,'Player 2 (e.g. Juan Soto)']].map(([v,set,ph])=>(
                <input key={ph} value={v} onChange={e=>set(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&runComp()} placeholder={ph}
                  style={{ height:34, padding:'0 10px', border:`1px solid ${C.border}`, borderRadius:6, fontSize:11, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface2, color:C.text }}/>
              ))}
            </div>
            <button onClick={runComp} disabled={compLoading}
              style={{ width:'100%', height:34, background:compLoading?C.surface3:C.navy, color:compLoading?C.text3:'#fff', border:'none', borderRadius:6, cursor:compLoading?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, fontWeight:700 }}>
              {compLoading ? 'Fetching from MLB API…' : 'Compare Players →'}
            </button>
            {compError && (
              <div style={{ marginTop:8, padding:'6px 10px', background:C.rustSoft, border:`0.5px solid ${C.rustMid}`, borderRadius:6, ...sans({ fontSize:10, color:C.rust }) }}>
                {compError}
              </div>
            )}
          </div>
          {compData && (
            <>
              {compData.seasonNote && (
                <div style={{ padding:'3px 14px 1px', ...px({ fontSize:11, color:C.amber }) }}>
                  Fallback year{compData.seasonNote}
                </div>
              )}
              {/* FIX: minWidth on table prevents layout collapse when names are short */}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:280 }}>
                  <thead>
                    <tr style={{ background:C.surface2 }}>
                      <th style={{ padding:'6px 10px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:C.text2, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>Metric</th>
                      {[compData.n1, compData.n2].map(n=>(
                        <th key={n} style={{ padding:'6px 10px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:C.text2, textAlign:'center', borderBottom:`0.5px solid ${C.border}` }}>
                          {n.split(' ').slice(-1)[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compData.rows.map(([m,v1,v2,n1,n2,lowerIsBetter],i,arr)=>{
                      const p1Wins = lowerIsBetter ? (n1>0 && n1<n2) : n1>n2;
                      const p2Wins = lowerIsBetter ? (n2>0 && n2<n1) : n2>n1;
                      return (
                      <tr key={m} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
                        <td style={{ padding:'6px 10px', ...sans({ fontSize:12, color:C.text2 }) }}>{m}</td>
                        <td style={{ padding:'6px 10px', textAlign:'center', ...px({ fontSize:12, fontWeight:700, color:p1Wins?C.teal:C.text }) }}>{v1}</td>
                        <td style={{ padding:'6px 10px', textAlign:'center', ...px({ fontSize:12, fontWeight:700, color:p2Wins?C.teal:C.text }) }}>{v2}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        {/* Injury risk — FIX: bar transition added, consistent layout */}
        <Panel title="Injury Risk Model" accent={C.rust} badge="SKIP Model">
          {injuryRisks.map(([n,pct,risk,note,c],i,arr)=>(
            <div key={n} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none', padding:'7px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={sans({ fontSize:10.5, fontWeight:600, color:C.text })}>{n}</span>
                <span style={px({ fontSize:11, fontWeight:700, color:c })}>{pct}%</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                <div style={{ flex:1, height:3, background:C.surface3, borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:2, transition:'width 0.7s ease' }} />
                </div>
                <span style={sans({ fontSize:11, color:C.text3, minWidth:36 })}>{risk} risk</span>
              </div>
              <div style={sans({ fontSize:11, color:C.text2, marginTop:3 })}>{note}</div>
            </div>
          ))}
        </Panel>

        {/* Hitter projections */}
        <Panel title={`${SEASON} Projections — Hitters`} accent={C.teal} badge="SKIP Model">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:380 }}>
              <thead>
                <tr style={{ background:C.surface2 }}>
                  {['Player','Pos','AVG','HR','RBI','OPS','WAR'].map(h=>(
                    <th key={h} style={{ padding:'5px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:C.text2, textAlign:h==='Player'?'left':'right', borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hitters.map(([n,pos,a,h,r,o,w],i,arr)=>(
                  <tr key={n} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background=C.amberSoft}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'6px 8px', ...sans({ fontSize:11, fontWeight:700, color:C.text }) }}>{n}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}><PosBadge pos={pos} /></td>
                    {[a,h,r,o].map((v,j)=><td key={j} style={{ padding:'6px 8px', textAlign:'right', ...px({ fontSize:11 }) }}>{v}</td>)}
                    <td style={{ padding:'6px 8px', textAlign:'right', ...px({ fontSize:11, fontWeight:700, color:C.teal }) }}>{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Pitcher projections */}
        <Panel title={`${SEASON} Projections — Pitchers`} accent={C.rust} badge="SKIP Model">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:340 }}>
              <thead>
                <tr style={{ background:C.surface2 }}>
                  {['Player','H','ERA','K/9','WHIP','W','WAR'].map(h=>(
                    <th key={h} style={{ padding:'5px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:C.text2, textAlign:h==='Player'?'left':'right', borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pitchers.map(([n,h,e,k,w,wins,war],i,arr)=>(
                  <tr key={n} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}
                    onMouseEnter={ev=>ev.currentTarget.style.background=C.amberSoft}
                    onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'6px 8px', ...sans({ fontSize:11, fontWeight:700, color:C.text }) }}>{n}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}><PosBadge pos={h==='L'?'LHP':'RHP'} /></td>
                    {[e.toFixed(2),k.toFixed(1),w,wins].map((v,j)=><td key={j} style={{ padding:'6px 8px', textAlign:'right', ...px({ fontSize:11 }) }}>{v}</td>)}
                    <td style={{ padding:'6px 8px', textAlign:'right', ...px({ fontSize:11, fontWeight:700, color:C.teal }) }}>{war}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      {/* ── Trade Value Simulator ── */}
      <Panel title="Trade Value Simulator" accent={C.purple} badge="SKIP Model">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
          {/* Side A */}
          <div style={{ padding:'14px', borderRight:`0.5px solid ${C.border}` }}>
            <div style={sans({ fontSize:10,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 })}>Team A Offers</div>
            {[
              { name:'Jackson Holliday SS', war:14.3, fv:70, tag:'Prospect', color:C.teal },
              { name:'Pick #8 (2026 Draft)', war:0, fv:60, tag:'Pick', color:C.amber },
            ].map(p=>(
              <div key={p.name} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div>
                  <div style={sans({ fontSize:11,fontWeight:700,color:C.text })}>{p.name}</div>
                  <div style={{ display:'flex',gap:5,marginTop:2 }}>
                    <span style={{...px({fontSize:9,fontWeight:700,color:p.color}),background:`color-mix(in srgb, ${p.color} 9%, transparent)`,padding:'1px 5px',borderRadius:3}}>{p.tag}</span>
                    {p.fv>0&&<span style={{...px({fontSize:9,fontWeight:700,color:C.slate}),background:C.surface3,padding:'1px 5px',borderRadius:3}}>FV {p.fv}</span>}
                  </div>
                </div>
                {p.war>0&&<span style={px({ fontSize:12,fontWeight:800,color:C.teal })}>{p.war} WAR</span>}
              </div>
            ))}
            <div style={{ marginTop:10,padding:'8px 10px',background:C.amberSoft,borderRadius:6,display:'flex',justifyContent:'space-between' }}>
              <span style={sans({ fontSize:11,fontWeight:700,color:C.amberDark })}>Total Value</span>
              <span style={px({ fontSize:13,fontWeight:800,color:C.amber })}>~$82M surplus</span>
            </div>
          </div>
          {/* Side B */}
          <div style={{ padding:'14px' }}>
            <div style={sans({ fontSize:10,fontWeight:700,color:C.rust,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 })}>Team B Offers</div>
            {[
              { name:'Gerrit Cole SP', war:6.8, tag:'MLB Veteran', color:C.rust },
              { name:'Pick #22 (2026 Draft)', war:0, fv:55, tag:'Pick', color:C.amber },
            ].map(p=>(
              <div key={p.name} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:`0.5px solid ${C.borderLight}` }}>
                <div>
                  <div style={sans({ fontSize:11,fontWeight:700,color:C.text })}>{p.name}</div>
                  <div style={{ display:'flex',gap:5,marginTop:2 }}>
                    <span style={{...px({fontSize:9,fontWeight:700,color:p.color}),background:`color-mix(in srgb, ${p.color} 9%, transparent)`,padding:'1px 5px',borderRadius:3}}>{p.tag}</span>
                    {p.fv>0&&<span style={{...px({fontSize:9,fontWeight:700,color:C.slate}),background:C.surface3,padding:'1px 5px',borderRadius:3}}>FV {p.fv}</span>}
                  </div>
                </div>
                {p.war>0&&<span style={px({ fontSize:12,fontWeight:800,color:C.rust })}>{p.war} WAR</span>}
              </div>
            ))}
            <div style={{ marginTop:10,padding:'8px 10px',background:C.rustSoft,borderRadius:6,display:'flex',justifyContent:'space-between' }}>
              <span style={sans({ fontSize:11,fontWeight:700,color:C.rust })}>Total Value</span>
              <span style={px({ fontSize:13,fontWeight:800,color:C.rust })}>~$61M surplus</span>
            </div>
          </div>
        </div>
        {/* Verdict bar */}
        <div style={{ padding:'10px 14px',borderTop:`0.5px solid ${C.border}`,background:C.tealSoft,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ display:'flex',gap:10,alignItems:'center' }}>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:700,color:C.teal,background:C.teal+'22',padding:'2px 8px',borderRadius:4 }}>SKIP SAYS</span>
            <span style={sans({ fontSize:11,color:C.text,fontStyle:'italic' })}>"Team A wins this trade. $21M in surplus value advantage. Holliday's ceiling alone justifies the deal — Cole is a rental."</span>
          </div>
          <span style={px({ fontSize:13,fontWeight:800,color:C.teal,whiteSpace:'nowrap',marginLeft:12 })}>Team A +21M</span>
        </div>
      </Panel>

      <TradeAnalyticsPanel />
    </div>
  );
}
function SettingsPage({ theme, toggleTheme }) {
  const infoRows = [
    ['Version','SKIP MARK5'],
    ['Season',String(SEASON)],
    ['Data Source','MLB Stats API (statsapi.mlb.com)'],
    ['MiLB Levels','Triple-A (11) · Double-A (12) · High-A (13) · Single-A (14)'],
    ['Savant Proxy','/api/savant — Vercel serverless'],
    ['NCAA Proxy', '/api/ncaa — henrygd/ncaa-api'],
    ['Design','Warm palette · DM Mono + Plus Jakarta Sans'],
    ['Framework','React 18 + Recharts 2.12'],
    ['Engine','Rule-Based Decision Engine v2'],
    ['Status','Live · All systems operational'],
  ];
  const roadmap = [
    ['Phase 1','KPIs · SKIP Engine · Player Search · Team Overview',C.teal],
    ['Phase 2','Prospects · Draft Board · Comparisons · League Intel',C.teal],
    ['Phase 3','MiLB API Layer · NCAA API · PBP · Standings at all levels',C.teal],
    ['Phase 4','Live standings · Full 30-team data · Sortable leaderboards',C.teal],
    ['Phase 4b (planned)','Trade Sim · Standalone WAR projection model',C.amber],
    ['Phase 5 (planned)','LLM Scout Reports · Statcast layer · Historical comps',C.text3],
    ['Phase 6 (planned)','User accounts · PDF export · Team branding · Mobile',C.text4],
  ];
  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <Panel title="Preferences" accent={C.amber}>
        <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={sans({ fontSize:12.5, fontWeight:700, color:C.text })}>Appearance</div>
            <div style={sans({ fontSize:11, color:C.text3, marginTop:2 })}>
              Switch between light and dark theme. This is also always one click away from the sidebar.
            </div>
          </div>
          {toggleTheme && (
            <button onClick={toggleTheme} title="Toggle light / dark theme"
              style={{ flexShrink:0, padding:'7px 14px', display:'flex', alignItems:'center', gap:8, background:C.surface3, border:`0.5px solid ${C.border}`, borderRadius:7, cursor:'pointer', color:C.text2 }}>
              <span style={{ fontSize:14 }}>{theme === 'dark' ? '☀' : '☾'}</span>
              <span style={sans({ fontSize:12, fontWeight:600 })}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
          )}
        </div>
      </Panel>
      <Panel title="System Information" accent={C.amber}>
        {infoRows.map(([l,v],i,arr)=><KVRow key={l} label={l} value={v} last={i===arr.length-1} />)}
      </Panel>
      <Panel title="Roadmap" accent={C.teal}>
        {roadmap.map(([p,d,c],i,arr)=>(
          <div key={p} style={{ display:'flex', gap:12, padding:'8px 14px', borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
            <span style={sans({ fontSize:10.5, fontWeight:700, color:c, minWidth:80, flexShrink:0 })}>{p}</span>
            <span style={sans({ fontSize:12, color:C.text2 })}>{d}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// Memoized: DraftPage/LeaguePage/IntelligencePage take no props, so App
// re-rendering (e.g. the 30s live-ticker poll) doesn't force whichever one
// is on screen to re-render along with it. SettingsPage takes theme +
// toggleTheme, but both are stable references (useState value + a
// useCallback-wrapped setter in App.jsx), so memo still holds here too.
const MemoDraftPage = memo(DraftPage);
const MemoLeaguePage = memo(LeaguePage);
const MemoIntelligencePage = memo(IntelligencePage);
const MemoSettingsPage = memo(SettingsPage);
export {
  MemoDraftPage as DraftPage,
  MemoLeaguePage as LeaguePage,
  MemoIntelligencePage as IntelligencePage,
  MemoSettingsPage as SettingsPage,
};
