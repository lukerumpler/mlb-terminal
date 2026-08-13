import React, { useState, memo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { PITCH_TYPES, pitchColor } from '../constants/pitchTypes.js';
import { usePitchChart, RESULTS } from '../lib/pitchChart.js';
import { Panel, Badge } from './atoms.jsx';

const fieldLabel = { display:'block', ...sans({ fontSize:9.5, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:3 }) };
const fieldInput = { width:'100%', height:32, padding:'0 9px', border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface, color:C.text, boxSizing:'border-box' };
const btnGhost = { padding:'6px 11px', borderRadius:7, border:`1px solid ${C.border}`, background:C.surface, color:C.text2, cursor:'pointer', ...sans({ fontSize:10.5, fontWeight:700 }), whiteSpace:'nowrap' };
const btnPrimary = { padding:'6px 11px', borderRadius:7, border:`1px solid ${C.amber}`, background:C.amber, color:'#fff', cursor:'pointer', ...sans({ fontSize:10.5, fontWeight:700 }), whiteSpace:'nowrap' };
const sideToggle = (active) => ({
  padding:'5px 10px', borderRadius:6, border:`1px solid ${active ? C.amber : C.border}`,
  background: active ? C.amberSoft : C.surface, color: active ? C.amberDark : C.text2,
  cursor:'pointer', ...sans({ fontSize:10.5, fontWeight:700 }),
});

// 9-zone core (standard scouting numbering, 1–9 top-left to bottom-right)
// plus 4 outer "expanded zone" strips (High/Low/In/Out) for well-outside
// pitches — a simplified stand-in for the reference UI's full 17-zone grid
// (9 core + 8 individually-numbered outer cells). Labeled by absolute
// direction (High/Low/In/Out), not arm-side/glove-side, so this doesn't
// need to know or assume pitcher handedness to be correct.
const CORE_ZONES = Array.from({ length: 9 }, (_, i) => ({
  zone: i + 1, x: 50 + (i % 3) * (100 / 3), y: 50 + Math.floor(i / 3) * (100 / 3), w: 100 / 3, h: 100 / 3,
}));
const OUTER_ZONES = [
  { zone:10, label:'High', x:50,  y:5,   w:100, h:45 },
  { zone:11, label:'Low',  x:50,  y:150, w:100, h:45 },
  { zone:12, label:'In',   x:5,   y:50,  w:45,  h:100 },
  { zone:13, label:'Out',  x:150, y:50,  w:45,  h:100 },
];

function ZoneGrid({ selected, onTap }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height={220} style={{ display:'block', maxWidth:220, margin:'0 auto' }}>
      {OUTER_ZONES.map(z => (
        <g key={z.zone} role="button" tabIndex={0} aria-label={`Zone ${z.zone} (${z.label})`}
          aria-pressed={selected === z.zone} style={{ cursor:'pointer' }}
          onClick={() => onTap(z.zone)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onTap(z.zone); }}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h}
            fill={selected === z.zone ? C.amberSoft : C.surface2} stroke={C.borderLight} strokeWidth="1" />
          <text x={z.x + z.w / 2} y={z.y + z.h / 2} textAnchor="middle" dominantBaseline="central"
            fontSize="7.5" fill={C.text4} fontFamily="'Plus Jakarta Sans',sans-serif">{z.label}</text>
        </g>
      ))}
      {CORE_ZONES.map(z => (
        <g key={z.zone} role="button" tabIndex={0} aria-label={`Zone ${z.zone}`}
          aria-pressed={selected === z.zone} style={{ cursor:'pointer' }}
          onClick={() => onTap(z.zone)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onTap(z.zone); }}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h}
            fill={selected === z.zone ? C.amber : C.surface} stroke={C.border} strokeWidth="1" />
          <text x={z.x + z.w / 2} y={z.y + z.h / 2} textAnchor="middle" dominantBaseline="central"
            fontSize="12" fontWeight="700" fill={selected === z.zone ? '#fff' : C.text2}
            fontFamily="'DM Mono',monospace">{z.zone}</text>
        </g>
      ))}
    </svg>
  );
}

// Completed at-bats only ever grow by prepending (newest first — see
// lib/pitchChart.js) or reset to empty on a new session; a closed at-bat's
// own `pitches` is never mutated afterward. So length + the newest id fully
// determine "did the visible list actually change" — cheaper and, unlike
// the default reference-equality check React.memo would otherwise use,
// actually effective: `usePitchChart` re-`load()`s the whole session from
// localStorage on every commit (even ones that only touch e.g.
// pitcherName), so `atBats` gets a brand-new array reference on every
// keystroke regardless of whether its own content changed. Without this
// custom comparator, this section — which can grow to dozens of entries
// across a full game — would silently re-render and re-reconcile in full
// on every unrelated interaction, including every keystroke while typing a
// name. That's exactly the kind of lag that wouldn't show up in casual
// testing (a fresh, empty session) but would get progressively more felt
// deeper into the one scenario this tool exists for: keeping up with a
// live game in person.
export function atBatsUnchanged(prev, next) {
  return prev.atBats.length === next.atBats.length && prev.atBats[0]?.id === next.atBats[0]?.id;
}

const PitchLog = memo(function PitchLog({ atBats }) {
  if (!atBats.length) {
    return <div style={sans({ fontSize:10.5, color:C.text4 })}>Completed at-bats will appear here.</div>;
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
      {atBats.map(ab => (
        <div key={ab.id} style={{ border:`0.5px solid ${C.borderLight}`, borderRadius:7, padding:'7px 9px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <span style={sans({ fontSize:11, fontWeight:700, color:C.text })}>
              {ab.batterName || 'Batter'} <span style={{ color:C.text4, fontWeight:400 }}>vs</span> {ab.pitcherName || 'Pitcher'}
            </span>
            <Badge color={C.slate} bg={C.surface3} border={C.border}>{ab.outcome}</Badge>
            <span style={{ marginLeft:'auto', ...px({ fontSize:9.5, color:C.text4 }) }}>{ab.pitches.length} pitch{ab.pitches.length === 1 ? '' : 'es'}</span>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            {ab.pitches.map(p => <PitchBadge key={p.id} pitch={p} />)}
          </div>
        </div>
      ))}
    </div>
  );
}, atBatsUnchanged);

function PitchBadge({ pitch }) {
  const resultDef = RESULTS.find(r => r.key === pitch.result);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:5, background:C.surface3, border:`0.5px solid ${C.border}` }}>
      <span style={{ width:6, height:6, borderRadius:2, flexShrink:0, background: pitch.type ? pitchColor(pitch.type) : C.text4 }} />
      <span style={px({ fontSize:9.5, color:C.text2 })}>Z{pitch.zone ?? '—'}</span>
      <span style={sans({ fontSize:9.5, color:C.text3 })}>{resultDef?.lbl || pitch.result}</span>
    </span>
  );
}

/* ─── Live pitch-charting tool (Roadmap #8) ───────────────────────────
   v1 scope, per this item's own "what to build" note: strike-zone tap UI
   + pitch type/result logging + a running pitch log, persisted locally.
   Deliberately deferred to a later pass, same as the roadmap item says:
   catcher-target-zone and a pitcher/catcher view toggle. Also simplified
   from the reference UI: 13 zones (9 core + 4 directional outer strips)
   rather than a full 17-zone grid, and pitcher/batter identity are just
   editable text fields (autocompleting off the same `skip-known-players`
   datalist Scouting Notes already renders) rather than a separate
   "Change Pitcher" modal — both are v1 scope-trims, not missing pieces
   anyone's tracked as a gap the way #1/#3's deferred pieces are.
------------------------------------------------------------------------ */
export default function PitchChartTool() {
  const { session, setField, logPitch, newAtBat, recordOut, advanceInning, resetCount, newSession } = usePitchChart();
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [confirmingNewSession, setConfirmingNewSession] = useState(false);

  const handleLog = (resultKey) => {
    if (selectedZone == null) return;
    logPitch(selectedZone, selectedType, resultKey);
    setSelectedZone(null);
    setSelectedType(null);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <Panel title="Pitch Chart Setup" accent={C.amber}>
        <div style={{ padding:'10px 14px', display:'flex', flexWrap:'wrap', gap:12 }}>
          <div style={{ flex:'1 1 160px', minWidth:140 }}>
            <label style={fieldLabel}>Pitcher</label>
            <input list="skip-known-players" value={session.pitcherName} placeholder="Pitcher name"
              onChange={e => setField({ pitcherName:e.target.value })} style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Throws</label>
            <div style={{ display:'flex', gap:4 }}>
              {['R', 'L'].map(s => (
                <button key={s} style={sideToggle(session.pitcherThrows === s)} onClick={() => setField({ pitcherThrows:s })}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ flex:'1 1 160px', minWidth:140 }}>
            <label style={fieldLabel}>Batter</label>
            <input list="skip-known-players" value={session.batterName} placeholder="Batter name"
              onChange={e => setField({ batterName:e.target.value })} style={fieldInput} />
          </div>
          <div>
            <label style={fieldLabel}>Bats</label>
            <div style={{ display:'flex', gap:4 }}>
              {['R', 'L', 'S'].map(s => (
                <button key={s} style={sideToggle(session.batterBats === s)} onClick={() => setField({ batterBats:s })}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Pitch Chart" accent={C.rust} badge={`${session.atBats.length} at-bat${session.atBats.length === 1 ? '' : 's'} logged`}>
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Count / outs / inning + controls */}
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
            <div style={px({ fontSize:22, fontWeight:800, color:C.text, letterSpacing:'-.02em' })}>
              {session.balls}-{session.strikes}
            </div>
            <div style={sans({ fontSize:11, color:C.text3 })}>
              Inning {session.inning} · {session.outs} out{session.outs === 1 ? '' : 's'}
            </div>
            <div style={{ display:'flex', gap:6, marginLeft:'auto', flexWrap:'wrap' }}>
              <button onClick={recordOut} style={btnGhost}>Record Out</button>
              <button onClick={advanceInning} style={btnGhost}>Advance Inning</button>
              <button onClick={resetCount} style={btnGhost}>Reset Count</button>
              <button onClick={newAtBat} style={btnGhost}>New At-Bat</button>
              {confirmingNewSession ? (
                <span style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={sans({ fontSize:10.5, color:C.rust })}>Archive & start over?</span>
                  <button onClick={() => { newSession(); setConfirmingNewSession(false); }} style={{ ...btnPrimary, background:C.rust, borderColor:C.rust }}>Confirm</button>
                  <button onClick={() => setConfirmingNewSession(false)} style={btnGhost}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmingNewSession(true)} style={btnPrimary}>New Session</button>
              )}
            </div>
          </div>

          {/* Zone grid + pitch type + result */}
          <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
            <div style={{ flex:'0 0 220px' }}>
              <div style={{ ...fieldLabel, textAlign:'center' }}>Strike Zone — tap to select</div>
              <ZoneGrid selected={selectedZone} onTap={z => setSelectedZone(z === selectedZone ? null : z)} />
            </div>
            <div style={{ flex:'1 1 240px', minWidth:220, display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={fieldLabel}>Pitch Type (optional)</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                  {PITCH_TYPES.map(pt => (
                    <button key={pt.code} aria-pressed={selectedType === pt.code}
                      onClick={() => setSelectedType(pt.code === selectedType ? null : pt.code)}
                      style={{
                        padding:'5px 9px', borderRadius:6,
                        border:`1.5px solid ${selectedType === pt.code ? pitchColor(pt.code) : C.border}`,
                        background: selectedType === pt.code ? pitchColor(pt.code) : C.surface,
                        color: selectedType === pt.code ? '#fff' : C.text2,
                        cursor:'pointer', ...sans({ fontSize:10.5, fontWeight:700 }),
                      }}>
                      {pt.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Result {selectedZone == null && <span style={{ fontWeight:400, textTransform:'none' }}>— pick a zone first</span>}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                  {RESULTS.map(r => (
                    <button key={r.key} disabled={selectedZone == null} onClick={() => handleLog(r.key)}
                      style={{
                        padding:'7px 11px', borderRadius:6, border:`1px solid ${C.border}`,
                        background: selectedZone == null ? C.surface2 : C.surface,
                        color: selectedZone == null ? C.text4 : C.text,
                        cursor: selectedZone == null ? 'not-allowed' : 'pointer',
                        opacity: selectedZone == null ? 0.55 : 1,
                        ...sans({ fontSize:11, fontWeight:700 }),
                      }}>
                      {r.lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Current at-bat, in progress */}
          <div>
            <div style={fieldLabel}>Current At-Bat</div>
            {session.currentPitches.length === 0 ? (
              <div style={sans({ fontSize:10.5, color:C.text4 })}>No pitches logged yet this at-bat.</div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {session.currentPitches.map(p => <PitchBadge key={p.id} pitch={p} />)}
              </div>
            )}
          </div>

          {/* Completed at-bat log */}
          <div>
            <div style={fieldLabel}>Pitch Log</div>
            <PitchLog atBats={session.atBats} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
