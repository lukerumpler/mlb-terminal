import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { PROSPECT_BATTERS, PROSPECT_PITCHERS, DRAFT_CLASS_2026 } from '../constants/data.js';
import { Panel, Badge, PosBadge, RiskDot, GradeBar, FVBadge } from '../components/atoms.jsx';
import PitchChartTool from '../components/PitchChartTool.jsx';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth.js';
/* ── Scouting Notes ───────────────────────────────────────────────────
   Personal scouting notebook: quick freeform notes and structured, full
   scouting reports (20–80 tool grades, FV, risk, ETA) tied to any player.
   Persisted to localStorage the same way App.jsx persists the theme
   choice — this is client-only data, nothing round-trips to a server. */

const STORAGE_KEY = 'skip-scouting-notes';

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; } // private browsing / storage disabled — degrade to empty
}
function persistNotes(notes) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch { /* best effort */ }
}

const HITTER_TOOLS = [
  ['hit',      'Hit',      'Contact ability, bat-to-ball skill'],
  ['power',    'Power',    'Raw and in-game power'],
  ['run',      'Run',      'Speed, baserunning value'],
  ['arm',      'Arm',      'Arm strength'],
  ['field',    'Field',    'Defensive actions and range'],
];
const PITCHER_TOOLS = [
  ['fb',       'Fastball', 'Velocity, life, command of the pitch'],
  ['breaking', 'Breaking', 'Slider/curveball quality'],
  ['change',   'Changeup', 'Changeup/offspeed quality'],
  ['control',  'Control',  'Ability to throw strikes'],
  ['command',  'Command',  'Ability to locate within the zone'],
];

// Merge real roster/prospect/draft names into one lookup so the player
// field can autocomplete and auto-fill position/team on an exact match.
const KNOWN_PLAYERS = (() => {
  const map = new Map();
  for (const p of PROSPECT_BATTERS)  map.set(p.name.toLowerCase(), { name: p.name, pos: p.pos, team: p.team });
  for (const p of PROSPECT_PITCHERS) map.set(p.name.toLowerCase(), { name: p.name, pos: p.pos, team: p.team });
  for (const p of DRAFT_CLASS_2026)  if (!map.has(p.name.toLowerCase())) map.set(p.name.toLowerCase(), { name: p.name, pos: '', team: p.school });
  return map;
})();
const KNOWN_NAMES = [...KNOWN_PLAYERS.values()].map(p => p.name).sort();

function uid() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

const emptyDraft = (type) => ({
  id: null, type, player: '', team: '', pos: '', pinned: false,
  text: '', summary: '', isPitcher: false,
  grades: {}, fv: '', risk: '', eta: '',
});

const fieldLabel = { display:'block', ...sans({ fontSize:10, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }) };
const fieldInput = { width:'100%', height:34, padding:'0 10px', border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface, color:C.text, boxSizing:'border-box' };
const fieldTextarea = { ...fieldInput, height:'auto', minHeight:70, padding:'8px 10px', lineHeight:1.5, resize:'vertical' };
const btnGhost = { padding:'7px 14px', borderRadius:7, border:`1px solid ${C.border}`, background:C.surface, color:C.text2, cursor:'pointer', ...sans({ fontSize:11.5, fontWeight:700 }) };
const btnPrimary = { padding:'7px 14px', borderRadius:7, border:`1px solid ${C.amber}`, background:C.amber, color:'#fff', cursor:'pointer', ...sans({ fontSize:11.5, fontWeight:700 }) };
const linkBtn = { background:'none', border:'none', padding:0, cursor:'pointer', color:C.text3, ...sans({ fontSize:11, fontWeight:700 }) };

function NoteForm({ draft, onChange, onSave, onCancel }) {
  const isReport = draft.type === 'report';
  const tools = draft.isPitcher ? PITCHER_TOOLS : HITTER_TOOLS;
  const set = (patch) => onChange({ ...draft, ...patch });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handlePlayerChange = (name) => {
    const known = KNOWN_PLAYERS.get(name.toLowerCase());
    if (known && !draft.team && !draft.pos) {
      set({ player: name, team: known.team || '', pos: known.pos || '' });
    } else {
      set({ player: name });
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ width:'100%', maxWidth:540, maxHeight:'88vh', overflowY:'auto', background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,.28)' }}>

        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={sans({ fontSize:13, fontWeight:800, color:C.text })}>
            {draft.id ? 'Edit ' : 'New '}{isReport ? 'Scouting Report' : 'Quick Note'}
          </div>
          <button onClick={onCancel} aria-label="Close" style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:C.text3, lineHeight:1 }}>✕</button>
        </div>

        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:2 }}>
              <label style={fieldLabel}>Player</label>
              <input list="skip-known-players" value={draft.player} placeholder="Player name"
                onChange={e => handlePlayerChange(e.target.value)} style={fieldInput} autoFocus />
            </div>
            <div style={{ flex:1 }}>
              <label style={fieldLabel}>Pos</label>
              <input value={draft.pos} placeholder="SS" onChange={e => set({ pos:e.target.value })} style={fieldInput} />
            </div>
            <div style={{ flex:1 }}>
              <label style={fieldLabel}>Team</label>
              <input value={draft.team} placeholder="NYY" onChange={e => set({ team:e.target.value })} style={fieldInput} />
            </div>
          </div>

          {isReport && (
            <>
              <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', ...sans({ fontSize:11, color:C.text2 }) }}>
                <input type="checkbox" checked={draft.isPitcher} onChange={e => set({ isPitcher:e.target.checked, grades:{} })} />
                Pitcher (swap tool grades to pitch grades)
              </label>

              <div>
                <label style={fieldLabel}>Tool grades (20–80 scale, optional)</label>
                <div style={{ border:`0.5px solid ${C.border}`, borderRadius:8, overflow:'hidden' }}>
                  {tools.map(([key, lbl]) => (
                    <div key={key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderBottom:`0.5px solid ${C.borderLight}` }}>
                      <div style={sans({ fontSize:11, fontWeight:700, color:C.text, width:74, flexShrink:0 })}>{lbl}</div>
                      <input type="range" min="20" max="80" step="5" value={draft.grades[key] ?? 50}
                        onChange={e => set({ grades:{ ...draft.grades, [key]: +e.target.value } })}
                        style={{ flex:1 }} />
                      <div style={px({ fontSize:12, fontWeight:700, width:24, textAlign:'right', color:C.text })}>{draft.grades[key] ?? 50}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1 }}>
                  <label style={fieldLabel}>FV / Overall (20–80)</label>
                  <input value={draft.fv} placeholder="50" inputMode="numeric"
                    onChange={e => set({ fv:e.target.value.replace(/[^0-9]/g,'').slice(0,2) })} style={fieldInput} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={fieldLabel}>Risk</label>
                  <select value={draft.risk} onChange={e => set({ risk:e.target.value })} style={{ ...fieldInput, cursor:'pointer' }}>
                    <option value="">—</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={fieldLabel}>ETA</label>
                  <input value={draft.eta} placeholder="2027" onChange={e => set({ eta:e.target.value })} style={fieldInput} />
                </div>
              </div>
            </>
          )}

          <div>
            <label style={fieldLabel}>{isReport ? 'Report summary' : 'Note'}</label>
            <textarea
              value={isReport ? draft.summary : draft.text}
              onChange={e => set(isReport ? { summary:e.target.value } : { text:e.target.value })}
              rows={isReport ? 5 : 3}
              placeholder={isReport ? 'Overall evaluation, tools breakdown, projection…' : 'Quick observation…'}
              style={fieldTextarea} />
          </div>

          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', ...sans({ fontSize:11, color:C.text2 }) }}>
            <input type="checkbox" checked={draft.pinned} onChange={e => set({ pinned:e.target.checked })} />
            Pin to top
          </label>
        </div>

        <div style={{ padding:'12px 18px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
          <button onClick={onSave} disabled={!draft.player.trim()}
            style={{ ...btnPrimary, opacity: draft.player.trim() ? 1 : 0.5, cursor: draft.player.trim() ? 'pointer' : 'not-allowed' }}>
            {draft.id ? 'Save changes' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete, onTogglePin, confirmingDelete, onConfirmDelete, onCancelDelete }) {
  const isReport = note.type === 'report';
  const tools = note.isPitcher ? PITCHER_TOOLS : HITTER_TOOLS;
  const hasGrades = isReport && note.grades && Object.keys(note.grades).length > 0;

  return (
    <div style={{ background:C.surface, border:`0.5px solid ${note.pinned ? C.amber : C.border}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ padding:'10px 14px', borderBottom:`0.5px solid ${C.border}`, background:C.surface2, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {note.pinned && <span title="Pinned" style={{ fontSize:11, color:C.amber }}>★</span>}
        <span style={sans({ fontSize:12.5, fontWeight:800, color:C.text })}>{note.player}</span>
        {note.pos && <PosBadge pos={note.pos} />}
        {note.team && <Badge color={C.text2} bg={C.surface3} border={C.border}>{note.team}</Badge>}
        <Badge color={isReport ? C.teal : C.slate} bg={isReport ? C.tealSoft : C.surface3} border={C.border}>
          {isReport ? 'REPORT' : 'QUICK NOTE'}
        </Badge>
        {isReport && note.risk && <RiskDot risk={note.risk} />}
        {isReport && note.risk && <span style={sans({ fontSize:10, color:C.text3 })}>{note.risk} risk</span>}
        {isReport && note.eta && <span style={sans({ fontSize:10, color:C.text3 })}>· ETA {note.eta}</span>}
        <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {isReport && note.fv && <FVBadge fv={+note.fv} />}
          <span style={px({ fontSize:10, color:C.text4 })}>
            {note.isDirty && <span style={{ color: C.amber, marginRight: 4 }} title="Pending sync">●</span>}
            {timeAgo(note.updatedAt)}
          </span>
        </span>
      </div>

      {hasGrades && (
        <div>
          {tools.filter(([key]) => note.grades[key] != null).map(([key, lbl, desc]) => (
            <GradeBar key={key} lbl={lbl} val={note.grades[key]} desc={desc} />
          ))}
        </div>
      )}

      {(isReport ? note.summary : note.text) && (
        <div style={{ padding:'10px 14px', ...sans({ fontSize:12, color:C.text2, lineHeight:1.6, whiteSpace:'pre-wrap' }) }}>
          {isReport ? note.summary : note.text}
        </div>
      )}

      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.borderLight}`, display:'flex', gap:14, alignItems:'center' }}>
        <button onClick={onTogglePin} style={linkBtn}>{note.pinned ? 'Unpin' : 'Pin'}</button>
        <button onClick={onEdit} style={linkBtn}>Edit</button>
        {confirmingDelete ? (
          <span style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={sans({ fontSize:11, color:C.rust })}>Delete this note?</span>
            <button onClick={onConfirmDelete} style={{ ...linkBtn, color:C.rust, fontWeight:800 }}>Confirm</button>
            <button onClick={onCancelDelete} style={linkBtn}>Cancel</button>
          </span>
        ) : (
          <button onClick={onDelete} style={{ ...linkBtn, color:C.rust }}>Delete</button>
        )}
      </div>
    </div>
  );
}

function ScoutingNotesPage({ voiceNoteDraft, onVoiceNoteConsumed }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState(() => loadNotes());
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | quick | report
  const [draft, setDraft] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);

  const syncMutation = trpc.notes.sync.useMutation();

  // Network status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const performSync = useCallback(async (currentNotes = notes) => {
    if (!user || !isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const payload = currentNotes.map(n => ({
        ...n,
        grades: JSON.stringify(n.grades),
        updatedAt: n.updatedAt,
        deletedAt: n.deletedAt || null,
      }));
      const serverNotes = await syncMutation.mutateAsync(payload);
      
      const merged = serverNotes.map(n => ({
        ...n,
        grades: typeof n.grades === 'string' ? JSON.parse(n.grades) : (n.grades || {}),
        updatedAt: new Date(n.updatedAt).getTime(),
        deletedAt: n.deletedAt ? new Date(n.deletedAt).getTime() : null,
        isDirty: false,
      })).filter(n => !n.deletedAt);

      setNotes(merged);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user, isOnline, isSyncing, notes, syncMutation]);

  // Auto-sync when coming online or logging in
  useEffect(() => {
    if (isOnline && user && notes.some(n => n.isDirty)) {
      performSync();
    }
  }, [isOnline, user]);

  useEffect(() => {
    if (voiceNoteDraft) {
      setDraft({ ...emptyDraft('quick'), text: voiceNoteDraft });
      onVoiceNoteConsumed();
    }
  }, [voiceNoteDraft, onVoiceNoteConsumed]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Roadmap #8 (live pitch-charting tool) lives as a sub-tab of this page
  // rather than a new top-level nav item, per that item's own "what to
  // build" note — it's a different *category* of feature (manual live
  // data entry vs. read-only stats aggregation), but pairs naturally with
  // Scouting Notes' existing localStorage-only, personal-device scope.
  const [subTab, setSubTab] = useState('notes'); // notes | chart

  // Persist on every change — mirrors the theme-persistence pattern in App.jsx.
  useEffect(() => { persistNotes(notes); }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter(n => filterType === 'all' || n.type === filterType)
      .filter(n => !q || n.player.toLowerCase().includes(q) || (n.team || '').toLowerCase().includes(q))
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  }, [notes, query, filterType]);

  const counts = useMemo(() => ({
    all: notes.length,
    quick: notes.filter(n => n.type === 'quick').length,
    report: notes.filter(n => n.type === 'report').length,
  }), [notes]);

  const openNew  = (type) => setDraft(emptyDraft(type));
  const openEdit = (note) => setDraft({ ...emptyDraft(note.type), ...note, grades: { ...note.grades } });
  const closeForm = () => setDraft(null);

  const saveDraft = () => {
    if (!draft.player.trim()) return;
    const now = Date.now();
    const newNote = draft.id
      ? { ...draft, player: draft.player.trim(), updatedAt: now, isDirty: true }
      : { ...draft, id: uid(), player: draft.player.trim(), createdAt: now, updatedAt: now, isDirty: true };
    
    setNotes(prev => {
      const next = draft.id
        ? prev.map(n => n.id === draft.id ? newNote : n)
        : [newNote, ...prev];
      if (isOnline && user) performSync(next);
      return next;
    });
    setDraft(null);
  };

  const deleteNote = (id) => {
    const now = Date.now();
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, deletedAt: now, isDirty: true } : n);
      if (isOnline && user) performSync(next);
      return next;
    });
    setConfirmDeleteId(null);
  };
  const togglePin = (id) => {
    const now = Date.now();
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: now, isDirty: true } : n);
      if (isOnline && user) performSync(next);
      return next;
    });
  };

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <datalist id="skip-known-players">
        {KNOWN_NAMES.map(n => <option key={n} value={n} />)}
      </datalist>

      <div style={{ display:'flex', gap:6 }}>
        {[['notes', 'Notes'], ['chart', 'Pitch Chart']].map(([key, lbl]) => (
          <button key={key} onClick={() => setSubTab(key)} aria-pressed={subTab === key}
            style={{
              padding:'7px 14px', borderRadius:7, border:`1px solid ${subTab === key ? C.amber : C.border}`,
              background: subTab === key ? C.amberSoft : C.surface, color: subTab === key ? C.amberDark : C.text2,
              cursor:'pointer', ...sans({ fontSize:11.5, fontWeight:700 }),
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {subTab === 'chart' && <PitchChartTool />}

      {subTab === 'notes' && (<>
      <Panel title="Scouting Notes" accent={C.amber} badge={`${notes.length} saved`}>
        <div style={{ padding:'12px 14px', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={sans({ fontSize: 11, color: C.text3, maxWidth: 480, lineHeight: 1.5 })}>
              Quick notes and full scouting reports on any player — saved on this device.
            </div>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: !isOnline ? C.rust : (isSyncing ? C.amber : C.teal),
                  boxShadow: isSyncing ? `0 0 6px ${C.amber}` : 'none'
                }} />
                <span style={sans({ fontSize: 9, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.02em' })}>
                  {!isOnline ? 'Offline' : (isSyncing ? 'Syncing' : 'Cloud Sync')}
                </span>
              </div>
            )}
          </div>
          <div style={sans({ fontSize:11, color:C.text3, maxWidth:480, lineHeight:1.5 })}>
            Quick notes and full scouting reports on any player — saved on this device.
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => openNew('quick')} style={btnGhost}>+ Quick Note</button>
            <button onClick={() => openNew('report')} style={btnPrimary}>+ Scouting Report</button>
          </div>
        </div>
      </Panel>

      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search notes by player or team" placeholder="Search by player or team…"
          style={{ ...fieldInput, maxWidth:260 }} />
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All',counts.all],['report','Reports',counts.report],['quick','Quick Notes',counts.quick]].map(([key, lbl, n]) => (
            <button key={key} onClick={() => setFilterType(key)} aria-pressed={filterType === key}
              style={{
                padding:'6px 12px', borderRadius:7, border:`1px solid ${filterType === key ? C.amber : C.border}`,
                background: filterType === key ? C.amberSoft : C.surface, color: filterType === key ? C.amberDark : C.text2,
                cursor:'pointer', ...sans({ fontSize:11.5, fontWeight:700 }),
              }}>
              {lbl} <span style={{ opacity:.6 }}>({n})</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel title={notes.length === 0 ? 'No notes yet' : 'No matches'} accent={C.text3}>
          <div style={{ padding:'28px 16px', textAlign:'center' }}>
            <div style={sans({ fontSize:12, color:C.text3, marginBottom:10 })}>
              {notes.length === 0
                ? 'Start with a quick note or a full scouting report on any player.'
                : 'Try a different search or filter.'}
            </div>
            {notes.length === 0 && (
              <button onClick={() => openNew('quick')} style={btnPrimary}>+ Add your first note</button>
            )}
          </div>
        </Panel>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(note => (
            <NoteCard key={note.id} note={note}
              onEdit={() => openEdit(note)}
              onDelete={() => setConfirmDeleteId(note.id)}
              onTogglePin={() => togglePin(note.id)}
              confirmingDelete={confirmDeleteId === note.id}
              onConfirmDelete={() => deleteNote(note.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </div>
      )}

      </>)}

      {draft && <NoteForm draft={draft} onChange={setDraft} onSave={saveDraft} onCancel={closeForm} />}
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this page to re-render while it's on screen.
export default memo(ScoutingNotesPage);
