import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../../constants/colors.js';
import { Panel } from '../../components/atoms.jsx';
import { buildDataQualityPayload, buildReconciliationRows, downloadDataQualityExport } from '../../lib/dataQuality.js';
import {
  BOXSCORE_PAGE_SIZE, filterAndSortBoxscoreGames, formatBoxscoreRate,
  readBoxscoreFilterPresets, saveBoxscoreFilterPresets,
} from './boxscore.js';

function ProfileStatusState({ status = 'Unavailable', message, detail }) {
  return <div className="skip-overview-empty-state" role="status"><span className="skip-overview-empty-mark" aria-hidden="true">—</span><div className="skip-overview-empty-copy"><span className="skip-overview-empty-status">{status}</span><strong>{message}</strong><span>{detail}</span></div></div>;
}

export function ReconciliationPanel({ player }) {
  const isPitcher = Boolean(player?.isPitcher);
  const boxscore = player?.boxscoreSplits;
  const aggregate = player?.stats || {};
  const boxscoreRows = isPitcher ? (boxscore?.pitching || []) : (boxscore?.batting || []);
  const all = boxscoreRows.find(row => row.label === 'All');
  const rows = buildReconciliationRows({ aggregate, boxscore: all, isPitcher });
  const payload = buildDataQualityPayload({ player, rows, context: 'Player Profile reconciliation' });
  const hasBoxscore = boxscore?.status === 'live' && Boolean(all);
  const filenameBase = `skip-${String(player?.fullName || player?.name || 'player').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'player'}-reconciliation-${player?.statSeason || 'current'}`;
  return (
    <Panel title="Aggregate vs Boxscore Reconciliation" accent={C.purple} badge={hasBoxscore ? 'Verified comparison' : 'Unavailable'}>
      <div className="skip-reconciliation-toolbar"><div className="skip-reconciliation-copy">Compares MLB season aggregates with the most recent official boxscore window. Variances are shown, not silently corrected.</div><div className="skip-reconciliation-actions"><button type="button" onClick={() => downloadDataQualityExport(payload, 'csv', filenameBase)} disabled={!rows.length}>CSV</button><button type="button" onClick={() => downloadDataQualityExport(payload, 'json', filenameBase)} disabled={!rows.length}>JSON</button></div></div>
      {!hasBoxscore ? <div className="skip-reconciliation-empty" role="status"><strong>Boxscore comparison unavailable</strong><span>{boxscore?.reason || 'No verified official boxscore window is available for this player.'}</span></div> : <><div className="skip-long-table"><table className="skip-profile-splits-table skip-reconciliation-table"><thead><tr><th>Metric</th><th>Aggregate</th><th>Boxscore</th><th>Variance</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.metric}><td>{row.metric}</td><td>{row.aggregate == null ? '—' : row.aggregate}</td><td>{row.boxscore == null ? '—' : row.boxscore}</td><td>{row.variance == null ? '—' : row.variance > 0 ? `+${row.variance}` : row.variance}</td><td><span className={`skip-reconciliation-status is-${row.status}`}>{row.status === 'match' ? 'Match' : row.status === 'variance' ? 'Variance' : 'Incomplete'}</span></td></tr>)}</tbody></table></div><div className="skip-profile-source-strip">Aggregate: {payload.sources.aggregate.source} · retrieved {payload.sources.aggregate.retrievedAt ? new Date(payload.sources.aggregate.retrievedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : 'not retrieved'} · Boxscores: {payload.sources.boxscore.source} · retrieved {payload.sources.boxscore.retrievedAt ? new Date(payload.sources.boxscore.retrievedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : 'not retrieved'}</div></>}
    </Panel>
  );
}

export function BoxscoreSplitPanel({ player }) {
  const data = player?.boxscoreSplits;
  const isPitcher = Boolean(player?.isPitcher);
  const rows = isPitcher ? (data?.pitching || []) : (data?.batting || []);
  const [dateFilter, setDateFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [page, setPage] = useState(0);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState([]);
  const [activePresetId, setActivePresetId] = useState('');
  const recentGames = useMemo(() => filterAndSortBoxscoreGames(data?.recentGames, { date: dateFilter, team: teamFilter, sort: sortOrder }), [data?.recentGames, dateFilter, teamFilter, sortOrder]);
  const pageCount = Math.max(1, Math.ceil(recentGames.length / BOXSCORE_PAGE_SIZE));
  const pagedGames = recentGames.slice(page * BOXSCORE_PAGE_SIZE, (page + 1) * BOXSCORE_PAGE_SIZE);
  useEffect(() => { setPresets(readBoxscoreFilterPresets(player?.id)); setActivePresetId(''); setPage(0); }, [player?.id]);
  useEffect(() => { setPage(0); }, [dateFilter, teamFilter, sortOrder]);
  const savePreset = () => {
    const name = presetName.trim();
    if (!name || !player?.id) return;
    const next = [...presets.filter(preset => preset.name.toLowerCase() !== name.toLowerCase()), { id: `preset-${Date.now()}`, name, date: dateFilter, team: teamFilter, sort: sortOrder }].slice(-12);
    setPresets(next); saveBoxscoreFilterPresets(player.id, next); setPresetName('');
  };
  const applyPreset = preset => { if (preset) { setDateFilter(preset.date || ''); setTeamFilter(preset.team || ''); setSortOrder(preset.sort || 'date-desc'); setActivePresetId(preset.id || ''); } };
  const deletePreset = presetId => { const next = presets.filter(preset => preset.id !== presetId); setPresets(next); saveBoxscoreFilterPresets(player?.id, next); if (activePresetId === presetId) setActivePresetId(''); };
  const title = isPitcher ? 'Boxscore ERA Splits' : 'Boxscore OPS Splits';
  const detail = isPitcher ? 'Earned runs and innings are aggregated from official MLB game boxscores in the recent sample.' : 'At-bats, walks, hit-by-pitch, sacrifice flies, and total bases are aggregated from official MLB game boxscores in the recent sample.';
  if (!data || data.status === 'loading') return <Panel title={title} accent={C.teal} badge="Loading"><ProfileStatusState status="Loading" message="Checking official boxscores" detail="The player profile is retrieving the current verified game sample." /></Panel>;
  if (data.status !== 'live' || !rows.length) return <Panel title={title} accent={C.teal} badge="Unavailable"><ProfileStatusState message={title} detail={data?.reason || 'No verified official MLB boxscore rows are available for this player.'} /></Panel>;
  return <Panel title={title} accent={C.teal} badge={`${data.games} games`}>
    <div className="skip-profile-source-strip">{data.source} · {data.windowLabel || 'Recent completed games'} · retrieved {data.retrievedAt ? new Date(data.retrievedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : 'not retrieved'}</div>
    <div className="skip-data-controls" aria-label="MLB boxscore game filters"><label>Date<input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></label><label>Team<input type="search" value={teamFilter} onChange={event => setTeamFilter(event.target.value)} placeholder="Search opponent" /></label><label>Sort<select value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="date-desc">Newest date</option><option value="date-asc">Oldest date</option><option value="team-asc">Team A–Z</option><option value="team-desc">Team Z–A</option></select></label>{(dateFilter || teamFilter) && <button type="button" onClick={() => { setDateFilter(''); setTeamFilter(''); setActivePresetId(''); }}>Clear</button>}<div className="skip-boxscore-presets" aria-label="Saved boxscore filter presets"><input aria-label="Preset name" value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="Preset name" /><button type="button" onClick={savePreset} disabled={!presetName.trim()}>SAVE PRESET</button>{presets.length > 0 && <select aria-label="Apply saved preset" value={activePresetId} onChange={event => applyPreset(presets.find(preset => preset.id === event.target.value))}><option value="">Apply preset…</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>}{activePresetId && <button type="button" onClick={() => deletePreset(activePresetId)}>DELETE PRESET</button>}</div></div>
    <div className="skip-long-table"><table className="skip-profile-splits-table"><thead><tr className="skip-table-group-row"><th>Split</th><th>G</th>{isPitcher ? <><th>GS</th><th>IP</th><th>ER</th><th>K</th><th>BB</th><th>ERA</th><th>WHIP</th></> : <><th>PA</th><th>AB</th><th>H</th><th>HR</th><th>BB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th></>}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.games}</td>{isPitcher ? <><td>{row.gamesStarted || '—'}</td><td>{row.inningsPitched ? row.inningsPitched.toFixed(1) : '—'}</td><td>{row.earnedRuns || '—'}</td><td>{row.strikeOuts || '—'}</td><td>{row.walksAllowed || '—'}</td><td>{formatBoxscoreRate(row.era, 2)}</td><td>{formatBoxscoreRate(row.whip, 3)}</td></> : <><td>{row.plateAppearances || '—'}</td><td>{row.atBats || '—'}</td><td>{row.hits || '—'}</td><td>{row.homeRuns || '—'}</td><td>{row.walks || '—'}</td><td>{formatBoxscoreRate(row.avg)}</td><td>{formatBoxscoreRate(row.obp)}</td><td>{formatBoxscoreRate(row.slg)}</td><td>{formatBoxscoreRate(row.ops)}</td></>}</tr>)}</tbody></table></div>
    {recentGames.length > 0 && <div className="skip-recent-boxscore-games" aria-label="Recent MLB boxscore games"><div className="skip-profile-panel-note">Filtered recent games: {recentGames.length} · Page {Math.min(page + 1, pageCount)} of {pageCount}</div><div className="skip-long-table"><table className="skip-profile-splits-table"><thead><tr><th>Date</th><th>Opponent</th><th>{isPitcher ? 'ERA' : 'OPS'}</th></tr></thead><tbody>{pagedGames.map(game => <tr key={game.gamePk || `${game.date}-${game.opponent}`}><td>{game.date ? new Date(game.date).toLocaleDateString() : '—'}</td><td>{game.opponent || 'Team unavailable'}</td><td>{formatBoxscoreRate(isPitcher ? game.pitching?.era : game.batting?.ops, isPitcher ? 2 : 3)}</td></tr>)}</tbody></table></div><div className="skip-boxscore-pagination" aria-label="Boxscore table pagination"><button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0}>PREVIOUS</button><span>Page {Math.min(page + 1, pageCount)} / {pageCount}</span><button type="button" onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>NEXT</button></div></div>}
    <div className="skip-profile-panel-note">{detail} Values remain unavailable when the official boxscore does not supply the required denominator.</div>
  </Panel>;
}
