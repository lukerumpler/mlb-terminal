import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { TEAMS } from '../constants/data.js';
import { getAllOrganizationRosters, getOrganizationRoster } from '../api/mlb.js';
import TeamLogo from './TeamLogo.jsx';
import { Panel, SkeletonRows } from './atoms.jsx';
import { openPlayerProfile } from '../lib/navigation.js';

function normalize(value) {
  return String(value || '').toLocaleLowerCase('en-US').trim();
}

function statusTone(status = '') {
  const value = normalize(status);
  if (value.includes('active')) return { color: C.teal, background: C.tealSoft };
  if (value.includes('injured') || value.includes('inactive')) return { color: C.rust, background: `color-mix(in srgb, ${C.rust} 10%, transparent)` };
  return { color: C.slate, background: C.surface3 };
}

function formatRetrievedAt(timestamp) {
  if (!timestamp) return 'Not loaded';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? 'Not loaded' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function OrganizationRosterDirectory() {
  const teams = useMemo(() => Object.entries(TEAMS)
    .map(([key, team]) => ({ key, ...team }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })), []);
  const [selectedKey, setSelectedKey] = useState(() => teams[0]?.key || '');
  const [recordsByOrganization, setRecordsByOrganization] = useState({});
  const [query, setQuery] = useState('');
  const [loadingKey, setLoadingKey] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [failures, setFailures] = useState([]);
  const [error, setError] = useState('');

  const selectedTeam = teams.find(team => team.key === selectedKey) || teams[0];
  const selectedRecord = selectedTeam ? recordsByOrganization[selectedTeam.key] : null;
  const loadedOrganizations = Object.keys(recordsByOrganization).length;
  const loadedPlayers = Object.values(recordsByOrganization).reduce((total, record) => total + (record.players?.length || 0), 0);

  const loadTeam = useCallback(async team => {
    if (!team || loadingKey || bulkLoading) return;
    setError('');
    setLoadingKey(team.key);
    try {
      const record = await getOrganizationRoster(team);
      setRecordsByOrganization(previous => ({ ...previous, [team.key]: record }));
      setFailures(previous => previous.filter(item => item.organization !== team.key));
    } catch (loadError) {
      setError(`The official ${team.name} roster could not be loaded. ${loadError?.message || 'Try again.'}`);
    } finally {
      setLoadingKey('');
    }
  }, [bulkLoading, loadingKey]);

  useEffect(() => {
    if (selectedTeam && !recordsByOrganization[selectedTeam.key] && !loadingKey && !bulkLoading) {
      void loadTeam(selectedTeam);
    }
  }, [selectedTeam, recordsByOrganization, loadingKey, bulkLoading, loadTeam]);

  const loadAll = useCallback(async () => {
    if (bulkLoading || loadingKey) return;
    setError('');
    setBulkLoading(true);
    try {
      const result = await getAllOrganizationRosters(teams);
      setRecordsByOrganization(previous => ({ ...previous, ...result.byOrganization }));
      setFailures(result.failures);
      if (result.failures.length) setError(`${result.failures.length} official roster${result.failures.length === 1 ? '' : 's'} could not be loaded. Select an organization and retry it.`);
    } catch (loadError) {
      setError(`The all-team directory could not be loaded. ${loadError?.message || 'Try again.'}`);
    } finally {
      setBulkLoading(false);
    }
  }, [bulkLoading, loadingKey, teams]);

  const visiblePlayers = useMemo(() => {
    const term = normalize(query);
    const players = selectedRecord?.players || [];
    if (!term) return players;
    return players.filter(player => [player.name, player.position, player.rosterStatus, player.currentTeamName]
      .some(value => normalize(value).includes(term)));
  }, [query, selectedRecord]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <Panel title="Organization Player Directory" accent={C.teal} badge="Official MLB API">
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8, alignItems:'flex-start', flexWrap:'wrap', padding:'10px 12px', borderRadius:8, background:C.surface2, border:`0.5px solid ${C.border}` }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:C.teal, marginTop:5, flexShrink:0 }} />
            <div style={{ flex:1, minWidth:220 }}>
              <div style={sans({ fontSize:12, fontWeight:800, color:C.text })}>Verified organization roster membership</div>
              <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.5, marginTop:3 })}>
                Names, player IDs, positions, and current roster status come from MLB Stats API’s <code>fullRoster</code> contract. This directory is <strong>not MLB Pipeline Top 30</strong>: the public API does not provide a prospect rank or ranked-list membership field.
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ display:'flex', alignItems:'center', gap:7, minWidth:220, flex:'1 1 250px' }}>
              <span style={sans({ fontSize:10, fontWeight:800, color:C.text3, textTransform:'uppercase', letterSpacing:'.06em' })}>Organization</span>
              <select aria-label="Organization roster" value={selectedTeam?.key || ''} onChange={event => setSelectedKey(event.target.value)} style={{ flex:1, padding:'7px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface, color:C.text, fontFamily:"'DM Mono',monospace", fontSize:10.5 }}>
                {teams.map(team => <option key={team.key} value={team.key}>{team.abbr} · {team.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void loadTeam(selectedTeam)} disabled={Boolean(loadingKey || bulkLoading)} style={{ padding:'7px 11px', borderRadius:6, cursor:loadingKey || bulkLoading ? 'wait' : 'pointer', border:`1px solid ${C.teal}`, background:C.tealSoft, color:C.teal, fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:800 }}>
              {loadingKey === selectedTeam?.key ? 'Loading…' : 'Refresh team'}
            </button>
            <button type="button" onClick={() => void loadAll()} disabled={Boolean(loadingKey || bulkLoading)} style={{ padding:'7px 11px', borderRadius:6, cursor:loadingKey || bulkLoading ? 'wait' : 'pointer', border:`1px solid ${C.amber}`, background:C.amberSoft, color:C.amberDark, fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:800 }}>
              {bulkLoading ? 'Loading all 30…' : 'Load all 30 official rosters'}
            </button>
          </div>

          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <span style={sans({ fontSize:10.5, color:C.text2 })}><strong style={{ color:C.teal }}>{loadedOrganizations}/30</strong> organizations loaded</span>
            <span style={sans({ fontSize:10.5, color:C.text2 })}><strong style={{ color:C.teal }}>{loadedPlayers.toLocaleString()}</strong> verified roster records in memory</span>
            <span style={sans({ fontSize:10.5, color:C.text3 })}>Selected source: {selectedRecord?.source || 'Waiting for official response'} · {formatRetrievedAt(selectedRecord?.retrievedAt)}</span>
          </div>

          {error && <div role="alert" style={{ padding:'8px 10px', borderRadius:6, border:`0.5px solid ${C.rust}`, background:`color-mix(in srgb, ${C.rust} 8%, transparent)`, color:C.rust, ...sans({ fontSize:10.5, lineHeight:1.45 }) }}>{error}</div>}
          {failures.length > 0 && <div style={sans({ fontSize:10, color:C.text3 })}>Unavailable: {failures.map(item => item.organization).join(', ')}.</div>}
        </div>
      </Panel>

      <Panel title={`${selectedTeam?.name || 'Organization'} roster`} accent={selectedTeam?.color || C.teal} badge={selectedRecord ? `${selectedRecord.players.length} verified players` : 'Official source'}>
        <div style={{ padding:'10px 14px', borderBottom:`0.5px solid ${C.border}`, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input aria-label="Search selected organization roster" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player, position, or roster status" style={{ flex:'1 1 260px', padding:'7px 9px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text, fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11 }} />
          <span style={sans({ fontSize:10.5, color:C.text3 })}>{visiblePlayers.length} match{visiblePlayers.length === 1 ? '' : 'es'}</span>
        </div>
        {!selectedRecord && <SkeletonRows rows={6} />}
        {selectedRecord && (
          <>
            <div className="skip-long-table">
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
                <thead><tr style={{ background:C.surface2 }}>
                  {['Player','Pos','Age','B/T','Roster status','Profile'].map((label, index) => <th key={label} style={{ padding:'8px 9px', textAlign:index === 0 ? 'left' : 'center', borderBottom:`0.5px solid ${C.border}`, color:C.text3, fontSize:9.5, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</th>)}
                </tr></thead>
                <tbody>
                  {visiblePlayers.slice(0, 150).map(player => {
                    const tone = statusTone(player.rosterStatus);
                    return <tr key={player.id} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                      <td style={{ padding:'8px 9px' }}><div style={{ display:'flex', alignItems:'center', gap:8 }}><TeamLogo abbr={selectedTeam?.abbr} size={18}/><span style={sans({ fontSize:11.5, fontWeight:750, color:C.text })}>{player.name}</span></div></td>
                      <td style={{ padding:'8px 9px', textAlign:'center', ...px({ fontSize:10.5, fontWeight:800, color:C.text2 }) }}>{player.position}</td>
                      <td style={{ padding:'8px 9px', textAlign:'center', ...px({ fontSize:10.5, color:C.text2 }) }}>{player.age ?? '—'}</td>
                      <td style={{ padding:'8px 9px', textAlign:'center', ...px({ fontSize:10.5, color:C.text2 }) }}>{player.bats || '—'}/{player.throws || '—'}</td>
                      <td style={{ padding:'8px 9px', textAlign:'center' }}><span style={{ display:'inline-flex', padding:'2px 6px', borderRadius:4, background:tone.background, color:tone.color, ...sans({ fontSize:9.5, fontWeight:750 }) }}>{player.rosterStatus}</span></td>
                      <td style={{ padding:'8px 9px', textAlign:'center' }}><button type="button" onClick={() => openPlayerProfile(player.id, player.name)} style={{ cursor:'pointer', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.teal, padding:'3px 7px', ...sans({ fontSize:9.5, fontWeight:800 }) }}>Open profile</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {visiblePlayers.length > 150 && <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.border}`, ...sans({ fontSize:10, color:C.text3 }) }}>Showing the first 150 matches. Refine the directory search to narrow results.</div>}
            {visiblePlayers.length === 0 && <div style={{ padding:'22px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>No verified roster record matches this search.</div>}
          </>
        )}
      </Panel>
    </div>
  );
}
