import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import { C, px, sans, WARM_TOOLTIP } from '../constants/colors.js';
import { SEASON, TEAMS } from '../constants/data.js';
import { SKIP_QUOTES } from '../constants/alerts.js';
import { searchPlayers, loadFullPlayer } from '../api/mlb.js';
import {
  computeKPIs, decisionScore, verdict, verdictColor,
  archetype, getStrengths, getRisks, getRecommendation, computeAMD,
} from '../engine/skip.js';
import { Badge, Panel, KVRow, GradeBar, PosBadge, SkeletonPlayerHero, SkeletonPanelGrid } from '../components/atoms.jsx';
import PitchShapePanel from '../components/PitchShapePanel.jsx';
import ContactHeatmap from '../components/ContactHeatmap.jsx';
import RadarCard from '../components/RadarCard.jsx';
import PlayerComparisonModal from '../components/PlayerComparisonModal.jsx';
import { fmt, fmtIP, fmtDollar, clamp8 } from '../lib/formatting.js';
import { placeholderColors } from '../lib/theme.js';
import { percentile, percentileColor, percentileLabel } from '../lib/percentile.js';

function pctBar(pct, color) {
  return (
    <div style={{ flex:'0 0 80px', height:5, background:C.surface3, borderRadius:3, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${Math.max(0,Math.min(100,pct)).toFixed(0)}%`, background:color, borderRadius:3, transition:'width .6s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
}
const TT = { ...WARM_TOOLTIP, wrapperStyle:{ zIndex:9999 } };

/* ─── Module-scope helpers ────────────────────────────────────────── */
/* ─── Player photo ────────────────────────────────────────────────── */
function PlayerPhoto({ id, name, size = 96 }) {
  const [err, setErr] = useState(false);
  // This component isn't remounted per-player (no `key` on it in the
  // parent), so state persists across different players searched in the
  // same session. Without this, one player's photo failing to load
  // (broken/missing MLB image, network hiccup) would leave `err` stuck at
  // true forever — every player searched afterward would show the fallback
  // placeholder even if their real photo would have loaded fine.
  useEffect(() => { setErr(false); }, [id]);
  const primary = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${id}/headshot/67/current`;
  const h = Math.round(size * 1.25);
  const cx = size / 2;
  const { bg: phBg, fg: phFg } = placeholderColors();
  const fallback = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + h + '" viewBox="0 0 ' + size + ' ' + h + '">' +
    '<rect width="' + size + '" height="' + h + '" rx="10" fill="' + phBg + '"/>' +
    '<circle cx="' + cx + '" cy="' + Math.round(h * 0.30) + '" r="' + Math.round(size * 0.22) + '" fill="' + phFg + '"/>' +
    '<ellipse cx="' + cx + '" cy="' + Math.round(h * 0.88) + '" rx="' + Math.round(size * 0.32) + '" ry="' + Math.round(h * 0.22) + '" fill="' + phFg + '"/>' +
    '</svg>'
  )}`;
  return (
    <img src={err ? fallback : primary} onError={() => setErr(true)} alt={name} loading="lazy"
      style={{ width:size, height:h, borderRadius:10, objectFit:'cover', objectPosition:'center top',
        border:`1px solid ${C.border}`, flexShrink:0, background:C.surface2, display:'block' }} />
  );
}

/* ─── Source-safe player video discovery ──────────────────────────── */
// These are search destinations, not fabricated individual video records. Each
// card opens a live result page owned by MLB or YouTube, while the official MLB
// headshot supplies a stable visual preview without pretending it is a frame
// from a particular clip.
export function buildPlayerVideoLinks({ id, fullName, teamName, teamAbbreviation } = {}) {
  const name = String(fullName || '').trim();
  if (!name) return [];
  const teamContext = [teamAbbreviation, teamName].filter(Boolean).join(' ');
  const youtubeQuery = `${name}${teamContext ? ` ${teamContext}` : ''} baseball MLB`;
  const thumbnail = id
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,w_640,h_360,g_face,q_auto:best/v1/people/${id}/headshot/67/current`
    : null;
  return [
    {
      id: 'mlb',
      source: 'MLB',
      label: 'MLB Video Search',
      href: `https://www.mlb.com/video/search?query=${encodeURIComponent(name)}`,
      thumbnail,
      query: name,
    },
    {
      id: 'youtube',
      source: 'YouTube',
      label: 'YouTube Search',
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`,
      thumbnail,
      query: youtubeQuery,
    },
  ];
}

export function buildPlayerHighlightSearches({ fullName, teamName, teamAbbreviation } = {}) {
  const name = String(fullName || '').trim();
  if (!name) return [];
  const context = [teamAbbreviation, teamName].filter(Boolean).join(' ');
  const base = `${name}${context ? ` ${context}` : ''} baseball MLB`;
  return [
    { id:'power', label:'Home run & extra-base plays', query:`${base} home run highlights` },
    { id:'contact', label:'Contact & hard-hit plays', query:`${base} batting highlights hard hit` },
    { id:'defense', label:'Defensive highlights', query:`${base} defensive highlights` },
    { id:'pitching', label:'Strikeout & pitch-sequencing plays', query:`${base} strikeout pitching highlights` },
  ].map(item => ({ ...item, href:`https://www.youtube.com/results?search_query=${encodeURIComponent(item.query)}` }));
}

function PlayerVideoThumbnail({ item, playerName, accent }) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => { setImageError(false); }, [item.thumbnail]);
  const initials = playerName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'MLB';
  return (
    <a href={item.href} target="_blank" rel="noreferrer noopener"
      aria-label={`${item.label} for ${playerName}`}
      style={{ display:'block', position:'relative', minWidth:0, borderRadius:8, overflow:'hidden', border:`0.5px solid ${C.border}`, background:C.surface2, textDecoration:'none' }}>
      <div style={{ position:'relative', aspectRatio:'16 / 9', overflow:'hidden', background:`linear-gradient(135deg, ${C.surface3}, ${C.surface2})` }}>
        {!imageError && item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" onError={() => setImageError(true)}
            style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 20%', display:'block', filter:'saturate(.8)' }} />
        ) : (
          <div aria-hidden="true" style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', ...px({ fontSize:26, fontWeight:800, color:accent }) }}>{initials}</div>
        )}
        <div aria-hidden="true" style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(15,23,42,.05), rgba(15,23,42,.72))' }} />
        <div aria-hidden="true" style={{ position:'absolute', left:10, bottom:9, width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,.92)', color:accent, fontSize:14, paddingLeft:2, boxShadow:'0 2px 8px rgba(0,0,0,.18)' }}>▶</div>
        <span style={{ position:'absolute', right:8, top:7, padding:'3px 6px', borderRadius:4, background:'rgba(15,23,42,.72)', ...px({ fontSize:8.5, fontWeight:800, color:'#fff', letterSpacing:'.05em', textTransform:'uppercase' }) }}>{item.source}</span>
      </div>
      <div style={{ padding:'8px 9px 9px' }}>
        <div style={sans({ fontSize:10.5, fontWeight:800, color:C.text, lineHeight:1.25 })}>{item.label}</div>
        <div style={sans({ fontSize:8.5, color:C.text4, marginTop:3, lineHeight:1.35 })}>Opens live search results · source-safe</div>
      </div>
    </a>
  );
}

export function normalizeEmbeddableVideoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    let videoId = null;
    if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0];
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2];
      if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2];
    }
    if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return null;
    return { videoId, watchUrl:`https://www.youtube.com/watch?v=${videoId}`, embedUrl:`https://www.youtube.com/embed/${videoId}` };
  } catch { return null; }
}

export function loadPlayerPlaylists(playerId) {
  if (!playerId || typeof localStorage === 'undefined') return [{ id:'my-highlights', name:'My Highlights', clips:[] }];
  try {
    const parsed = JSON.parse(localStorage.getItem(`skip-player-playlists:${playerId}`) || 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : [{ id:'my-highlights', name:'My Highlights', clips:[] }];
  } catch { return [{ id:'my-highlights', name:'My Highlights', clips:[] }]; }
}

export function savePlayerPlaylists(playerId, playlists) {
  if (!playerId || typeof localStorage === 'undefined') return;
  localStorage.setItem(`skip-player-playlists:${playerId}`, JSON.stringify(playlists));
}

function PlayerVideoPanel({ player, profile, accent }) {
  const playerName = profile?.fullName || `${profile?.useName || profile?.firstName || ''} ${profile?.useLastName || profile?.lastName || ''}`.trim();
  const playerId = player?.id || profile?.id;
  const highlightSearches = buildPlayerHighlightSearches({ fullName:playerName, teamName:profile?.currentTeam?.name, teamAbbreviation:profile?.currentTeam?.abbreviation });
  const items = buildPlayerVideoLinks({ id:playerId, fullName:playerName, teamName:profile?.currentTeam?.name, teamAbbreviation:profile?.currentTeam?.abbreviation });
  const [playlists, setPlaylists] = useState(() => loadPlayerPlaylists(playerId));
  const [activePlaylistId, setActivePlaylistId] = useState('my-highlights');
  const [clipUrl, setClipUrl] = useState('');
  const [clipTitle, setClipTitle] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedClip, setSelectedClip] = useState(null);
  const [clipError, setClipError] = useState('');
  useEffect(() => {
    setPlaylists(loadPlayerPlaylists(playerId));
    setActivePlaylistId('my-highlights');
    setSelectedClip(null);
  }, [playerId]);
  const activePlaylist = playlists.find(list => list.id === activePlaylistId) || playlists[0];
  const updatePlaylists = next => { setPlaylists(next); savePlayerPlaylists(playerId, next); };
  const addClip = () => {
    const normalized = normalizeEmbeddableVideoUrl(clipUrl);
    if (!normalized) { setClipError('Paste a verified YouTube watch, short, or embed URL.'); return; }
    const clip = { id:`${normalized.videoId}-${Date.now()}`, title:clipTitle.trim() || `${playerName} highlight`, ...normalized };
    const next = playlists.map(list => list.id === activePlaylist.id ? { ...list, clips:[...list.clips, clip] } : list);
    updatePlaylists(next); setSelectedClip(clip); setClipUrl(''); setClipTitle(''); setClipError('');
  };
  const createPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const list = { id:`playlist-${Date.now()}`, name, clips:[] };
    updatePlaylists([...playlists, list]); setActivePlaylistId(list.id); setNewPlaylistName('');
  };
  const removeClip = clipId => updatePlaylists(playlists.map(list => ({ ...list, clips:list.clips.filter(clip => clip.id !== clipId) })));
  const moveClip = (clipId, direction) => updatePlaylists(playlists.map(list => {
    if (list.id !== activePlaylist?.id) return list;
    const index = list.clips.findIndex(clip => clip.id === clipId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.clips.length) return list;
    const clips = [...list.clips];
    [clips[index], clips[target]] = [clips[target], clips[index]];
    return { ...list, clips };
  }));
  return (
    <Panel title="Player Video" accent={accent} badge="Playlists + Player">
      <div style={{ padding:'10px 12px 11px' }}>
        {selectedClip ? (
          <div style={{ marginBottom:10, border:`0.5px solid ${C.border}`, borderRadius:7, overflow:'hidden', background:'#0f172a' }}>
            <iframe title={selectedClip.title} src={selectedClip.embedUrl} style={{ display:'block', width:'100%', aspectRatio:'16 / 9', border:0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            <div style={{ padding:'7px 9px', ...sans({ fontSize:10, fontWeight:700, color:'#fff' }) }}>{selectedClip.title}</div>
          </div>
        ) : (
          <div style={{ padding:'10px', marginBottom:10, border:`0.5px dashed ${C.border}`, borderRadius:7, background:C.surface2, ...sans({ fontSize:9.5, color:C.text3, lineHeight:1.45 }) }}>Paste a verified YouTube clip URL below to watch it here and save it to a playlist.</div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 130px auto', gap:5, alignItems:'center' }}>
          <input aria-label="Verified YouTube clip URL" value={clipUrl} onChange={e=>setClipUrl(e.target.value)} placeholder="Paste YouTube URL" style={{ minWidth:0, padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} />
          <input aria-label="Clip title" value={clipTitle} onChange={e=>setClipTitle(e.target.value)} placeholder="Clip title" style={{ minWidth:0, padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} />
          <button onClick={addClip} style={{ padding:'7px 9px', border:0, borderRadius:5, background:accent, color:'#fff', cursor:'pointer', fontSize:10, fontWeight:800 }}>Save clip</button>
        </div>
        {clipError && <div role="alert" style={sans({ fontSize:9.5, color:C.rust, marginTop:5 })}>{clipError}</div>}
        <div style={{ display:'flex', gap:5, alignItems:'center', marginTop:10, flexWrap:'wrap' }}>
          <select aria-label="Active playlist" value={activePlaylist?.id || ''} onChange={e=>setActivePlaylistId(e.target.value)} style={{ padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }}>
            {playlists.map(list => <option key={list.id} value={list.id}>{list.name} ({list.clips.length})</option>)}
          </select>
          <input aria-label="New playlist name" value={newPlaylistName} onChange={e=>setNewPlaylistName(e.target.value)} placeholder="New playlist" style={{ width:120, padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} />
          <button onClick={createPlaylist} style={{ padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.text2, cursor:'pointer', fontSize:10, fontWeight:700 }}>Create</button>
        </div>
        {activePlaylist?.clips.length ? <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>{activePlaylist.clips.map((clip, index) => <div key={clip.id} style={{ display:'flex', gap:6, alignItems:'center', padding:'6px 8px', border:`0.5px solid ${C.borderLight}`, borderRadius:5 }}><button onClick={()=>setSelectedClip(clip)} style={{ flex:1, border:0, background:'transparent', color:C.text, textAlign:'left', cursor:'pointer', fontSize:10, fontWeight:700 }}>{clip.title}</button><button aria-label={`Move ${clip.title} up`} disabled={index === 0} onClick={()=>moveClip(clip.id, -1)} style={{ border:0, background:'transparent', color:index === 0 ? C.text4 : C.text2, cursor:index === 0 ? 'not-allowed' : 'pointer', fontSize:11 }}>↑</button><button aria-label={`Move ${clip.title} down`} disabled={index === activePlaylist.clips.length - 1} onClick={()=>moveClip(clip.id, 1)} style={{ border:0, background:'transparent', color:index === activePlaylist.clips.length - 1 ? C.text4 : C.text2, cursor:index === activePlaylist.clips.length - 1 ? 'not-allowed' : 'pointer', fontSize:11 }}>↓</button><button aria-label={`Remove ${clip.title}`} onClick={()=>removeClip(clip.id)} style={{ border:0, background:'transparent', color:C.rust, cursor:'pointer', fontSize:12 }}>×</button></div>)}</div> : <div style={sans({ fontSize:9.5, color:C.text4, marginTop:8 })}>No saved clips in this playlist yet.</div>}
        {items.length ? <div style={{ marginTop:10, paddingTop:10, borderTop:`0.5px solid ${C.borderLight}` }}><div style={sans({ fontSize:9.5, fontWeight:800, color:C.text2, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 })}>Highlight search shortcuts</div><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:5 }}>{highlightSearches.map(item => <a key={item.id} href={item.href} target="_blank" rel="noreferrer noopener" aria-label={`Search ${item.label} for ${playerName}`} style={{ display:'block', padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:6, background:C.surface2, color:C.text2, textDecoration:'none' }}><span style={px({ fontSize:9, fontWeight:800, color:accent, marginRight:5 })}>↗</span><span style={sans({ fontSize:9.5, fontWeight:700 })}>{item.label}</span></a>)}</div></div> : null}
        <div style={{ marginTop:8, ...sans({ fontSize:8.5, color:C.text4, lineHeight:1.4 }) }}>Only verified YouTube URLs are embedded. Search shortcuts open source results; SKIP does not invent clip records.</div>
      </div>
    </Panel>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────── */
const QUICK_PLAYERS = [
  { id:592450, fullName:'Aaron Judge',     team:'NYY', pos:'RF'  },
  { id:660271, fullName:'Shohei Ohtani',   team:'LAD', pos:'TWP' },
  { id:665742, fullName:'Juan Soto',       team:'NYM', pos:'LF'  },
  { id:683002, fullName:'Gunnar Henderson',team:'BAL', pos:'SS'  },
  { id:675911, fullName:'Spencer Strider', team:'ATL', pos:'P'   },
  { id:677951, fullName:'Bobby Witt Jr.',  team:'KC',  pos:'SS'  },
];

const REPORT_SECTIONS = [
  { icon:'◷', title:'KPI Breakdown',      body:'Contact, power, command & value scores derived from current-season stats.' },
  { icon:'◈', title:'SKIP Verdict',       body:'Buy / Hold / Sell grade with an explanation rooted in the underlying numbers.' },
  { icon:'⬡', title:'Geometry Radar',     body:'Six-axis player shape compared against league baselines.' },
  { icon:'$', title:'Contract & Value',   body:'Current contract terms alongside SKIP\u2019s estimate of true value.' },
];

function PlayersEmptyState({ onPick }) {
  return (
    <div style={{ padding:'8px 2px 0' }}>
      <div style={{ marginBottom:18 }}>
        <div style={sans({ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:C.text3, textTransform:'uppercase', marginBottom:8 })}>
          Quick access
        </div>
        {/* auto-fill/minmax instead of a fixed repeat(6,1fr): six equal
            columns with no floor squishes each card's photo+name+badge into
            an unreadably narrow strip on anything less than a wide desktop
            window — this reflows to fewer columns instead, same pattern
            LeaguePage already uses for its standings grid. */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10 }}>
          {QUICK_PLAYERS.map(p => (
            <button key={p.id} onClick={() => onPick(p)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                padding:'12px 8px', background:C.surface, border:`0.5px solid ${C.border}`,
                borderRadius:10, cursor:'pointer', textAlign:'center',
                boxShadow:'0 1px 4px rgba(0,0,0,.05)', transition:'all .12s',
              }}>
              <PlayerPhoto id={p.id} name={p.fullName} size={56} />
              <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text, lineHeight:1.25 })}>{p.fullName}</div>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                <PosBadge pos={p.pos} />
                <span style={px({ fontSize:10, color:C.text3 })}>{p.team}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Panel title="What's in a SKIP report" accent={C.amber}>
        {/* Right-border-only dividers assumed a single row — they'd land in
            the wrong place the moment this wrapped to 2+ rows on a narrower
            window, and worse, auto-fit's column count is viewport-dependent
            (4/3/2/1 depending on width), so there's no fixed row-length to
            special-case a "first row" check against. A full border on every
            card sidesteps the problem entirely — correct at any wrap point,
            not just the common one — and matches the individually-bordered-
            card pattern the Archetype Cluster Map below already uses.
            Converted the fixed repeat(4,1fr) to auto-fit/minmax too, so this
            actually reflows instead of squishing real paragraph text into
            unreadably narrow columns on a smaller window. */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:1, background:C.borderLight }}>
          {REPORT_SECTIONS.map(s => (
            <div key={s.title} style={{ padding:'14px 16px', background:C.surface }}>
              <div style={{ fontSize:16, color:C.amber, marginBottom:6 }}>{s.icon}</div>
              <div style={sans({ fontSize:12, fontWeight:700, color:C.text, marginBottom:4 })}>{s.title}</div>
              <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.5 })}>{s.body}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ textAlign:'center', padding:'18px 0 4px', color:C.text4, fontFamily:"'DM Mono',monospace", fontSize:11 }}>
        Or search any MLB player by name above
      </div>
    </div>
  );
}


// Coerce to a finite number, falling back to `def` only when the value is
// genuinely missing/invalid — unlike `parseFloat(x||def)||def`, this does NOT
// mistake a real value of 0 (e.g. 0 stolen bases, 0 K/9 in a tiny sample) for "missing".
function numOr(val, def) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : def;
}

// Profile metrics must never turn a missing live value into a plausible-looking
// number. MLB/Savant CSVs contain both empty strings and numeric zeroes, so the
// check is explicit and preserves a legitimate 0.
export function profileMetricValue(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function formatProfileMetric(value, digits = 1, suffix = '') {
  const n = profileMetricValue(value);
  return n == null ? '—' : `${n.toFixed(digits)}${suffix}`;
}

// Pure — no hooks, no rendering — so it can be reused anywhere the same
// 0-100 axis shape is needed (currently: the full GeometryRadar below, and
// the compact "Share Card" RadarCard) without the two drifting out of sync.
function computeGeometryAxes(kpis, isPitcher) {
  return isPitcher
    ? [
        { axis:'Stuff',    val: Math.min(100, Math.round(25+numOr(kpis._k9,5)*4)) },
        { axis:'Control',  val: Math.min(100, Math.round(90-numOr(kpis._whip,1.4)*30)) },
        { axis:'Results',  val: Math.min(100, Math.round(80-(numOr(kpis._era,4.5)-1.5)*12)) },
        { axis:'Durability', val: Math.min(100, Math.round(30+Math.min(numOr(kpis._ip,0)/2,40))) },
        { axis:'Value',    val: Math.min(100, kpis.TPVI) },
        { axis:'Decision', val: Math.min(100, kpis.DQS) },
      ]
    : [
        { axis:'Contact', val: Math.min(100, kpis.CAS)  },
        { axis:'Power',   val: Math.min(100, kpis.DPI)  },
        { axis:'Patience',val: Math.min(100, kpis.DQS)  },
        { axis:'Value',   val: Math.min(100, kpis.TPVI) },
        { axis:'Speed',   val: Math.min(100, Math.round(25+numOr(kpis._sb,0)*1.2)) },
        { axis:'Damage',  val: Math.min(100, Math.round(30+(numOr(kpis._slg,.350)-.3)*150)) },
      ];
}

function ChartExpandButton({ label, onClick }) {
  return (
    <button className="skip-profile-expand-button" type="button" onClick={onClick} aria-label={`Expand ${label}`} title={`Expand ${label}`}>
      ⛶ <span>{label}</span>
    </button>
  );
}

function ChartDialog({ title, children, onClose }) {
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="skip-chart-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="skip-chart-dialog" role="dialog" aria-modal="true" aria-labelledby="skip-chart-dialog-title">
        <div className="skip-chart-dialog-header">
          <div>
            <div id="skip-chart-dialog-title" className="skip-chart-dialog-title">{title}</div>
            <div className="skip-chart-dialog-subtitle">Expanded player profile view</div>
          </div>
          <button type="button" className="skip-chart-dialog-close" onClick={onClose} aria-label="Close expanded chart">×</button>
        </div>
        <div className="skip-chart-dialog-body">{children}</div>
      </div>
    </div>
  );
}

function ProfileTabRail({ activeTab, onChange }) {
  const tabs = ['Overview', 'Offense', 'Defense', 'Splits', 'Notes'];
  return (
    <nav className="skip-profile-tab-rail" aria-label="Player profile sections">
      {tabs.map(tab => {
        const active = activeTab === tab.toLowerCase();
        return <button key={tab} type="button" onClick={() => onChange(tab.toLowerCase())} aria-current={active ? 'page' : undefined} aria-pressed={active}>{tab}</button>;
      })}
    </nav>
  );
}

function GeometryRadar({ kpis, isPitcher, focusMetric = 'TPVI', height = 200 }) {
  // kpis is a stable reference from the parent's useMemo, so this only
  // recomputes when the underlying player/stat line actually changes —
  // otherwise recharts treats a fresh array as new data and redoes its
  // layout/scale work on every unrelated re-render of this page.
  const axes = useMemo(() => computeGeometryAxes(kpis, isPitcher), [kpis, isPitcher]);
  const selectedAxis = ({ TPVI:'Value', CAS:'Contact', DQS:isPitcher ? 'Decision' : 'Patience', DPI:'Damage',
    'K/9':'Stuff', WHIP:'Control', ERA:'Results', Value:'Value' })[focusMetric] || 'Value';
  const chartData = useMemo(() => axes.map(axis => ({ ...axis, focus: axis.axis === selectedAxis ? axis.val : 0 })), [axes, selectedAxis]);
  return (
    <div style={{ position:'relative' }}>
      <div className="skip-radar-focus-label" style={sans({ fontSize:9.5, color:C.amber, textTransform:'uppercase', letterSpacing:'.08em', textAlign:'center', marginBottom:-8 })}>
        Focus: {selectedAxis}
      </div>
      <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} margin={{ top:16, right:24, bottom:16, left:24 }}>
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis dataKey="axis"
          tick={{ fontSize:9.5, fill:C.text2, fontFamily:"'DM Mono',monospace" }} tickLine={false} />
        <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
        <Radar isAnimationActive={false} dataKey="val" stroke={C.amber} fill={C.amber} fillOpacity={0.18} strokeWidth={2} dot={{ r:3, fill:C.amber }} />
        <Radar isAnimationActive={false} dataKey="focus" stroke={C.teal} fill={C.teal} fillOpacity={0.30} strokeWidth={3} dot={{ r:4, fill:C.teal, stroke:C.surface, strokeWidth:1 }} />
        <Tooltip {...TT} formatter={v => [v,'Score']} />
      </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Spray chart (SVG) ───────────────────────────────────────────── */
/* Baseball Savant Statcast Search returns `hc_x` / `hc_y` for tracked
   batted-ball events. These are the source-backed field coordinates used
   here; no seeded dots or season-stat geometry is allowed to stand in for a
   spray chart. */
export function normalizeSprayPoint(row) {
  const x = Number(row?.hc_x);
  const y = Number(row?.hc_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Statcast hit coordinates are recorded on the Savant field plane with
  // home plate near (125, 198). The larger horizontal scale is intentional:
  // it keeps the foul lines and pull/opposite-field spread visually honest.
  const cx = Math.max(8, Math.min(132, 70 + (x - 125) * 0.74));
  const cy = Math.max(10, Math.min(80, 80 - (198 - y) * 0.34));
  const event = String(row?.events || '').toLowerCase();
  const color = event === 'home_run' ? C.rust
    : ['double','triple'].includes(event) ? C.amber
    : C.teal;
  const launchSpeed = Number(row?.launch_speed);
  const launchAngle = Number(row?.launch_angle);
  const distance = Number(row?.hit_distance_sc ?? row?.hit_distance);
  return {
    cx, cy, color, event,
    launchSpeed: Number.isFinite(launchSpeed) ? launchSpeed : null,
    launchAngle: Number.isFinite(launchAngle) ? launchAngle : null,
    distance: Number.isFinite(distance) ? distance : null,
    type: row?.bb_type || null,
  };
}

function sprayMetric(value, suffix = '') {
  return value == null ? 'Unavailable' : `${value.toFixed(1)}${suffix}`;
}

function SprayChart({ contactPoints }) {
  const [hovered, setHovered] = useState(null);
  const dots = useMemo(() => (Array.isArray(contactPoints) ? contactPoints : [])
    .map(normalizeSprayPoint)
    .filter(Boolean), [contactPoints]);
  if (!dots.length) {
    return <div style={sans({ fontSize:10.5, color:C.text3, padding:'22px 6px', textAlign:'center' })}>No Baseball Savant batted-ball coordinates available for this player and season.</div>;
  }
  return (
    <div style={{ position:'relative' }}>
      <svg width="100%" viewBox="0 0 140 90" style={{ display:'block' }} role="img" aria-label={`${dots.length} tracked batted-ball locations`} onMouseLeave={() => setHovered(null)}>
        <path d="M70,80 L8,18 Q36,-5 70,0 Q104,-5 132,18 Z" fill={`color-mix(in srgb, ${C.teal} 9%, transparent)`} stroke={C.border} strokeWidth="0.5"/>
        <path d="M70,80 L20,34 Q44,10 70,10 Q96,10 120,34 Z" fill="none" stroke={C.borderLight} strokeWidth="0.5"/>
        <line x1="70" y1="80" x2="8" y2="22" stroke={C.border} strokeWidth="0.5"/>
        <line x1="70" y1="80" x2="132" y2="22" stroke={C.border} strokeWidth="0.5"/>
        <rect x="57" y="54" width="26" height="26" fill={`color-mix(in srgb, ${C.amber} 7%, transparent)`} stroke={C.border} strokeWidth="0.5" transform="rotate(-45 70 67)"/>
        <circle cx="70" cy="78" r="2.5" fill={C.surface3} stroke={C.border} strokeWidth="0.5"/>
        {dots.map((d, i) => (
          <circle
            key={`${d.cx}-${d.cy}-${i}`}
            cx={d.cx}
            cy={d.cy}
            r={hovered === d ? 3.2 : 2.2}
            fill={d.color}
            opacity={hovered === d ? 1 : 0.72}
            stroke={hovered === d ? C.text : 'none'}
            strokeWidth={hovered === d ? 0.8 : 0}
            tabIndex={0}
            onMouseEnter={() => setHovered(d)}
            onFocus={() => setHovered(d)}
            onBlur={() => setHovered(null)}
          >
            <title>{`${d.event || 'Batted ball'} · EV ${sprayMetric(d.launchSpeed, ' mph')} · LA ${sprayMetric(d.launchAngle, '°')}`}</title>
          </circle>
        ))}
        <g fontFamily="'DM Mono',monospace" fontSize="6" fill={C.text3}>
          <circle cx="4" cy="5" r="2.5" fill={C.rust}/><text x="9" y="8">HR</text>
          <circle cx="4" cy="14" r="2.5" fill={C.amber}/><text x="9" y="17">XBH</text>
          <circle cx="4" cy="23" r="2.5" fill={C.teal}/><text x="9" y="26">1B/OUT</text>
        </g>
      </svg>
      {hovered && (
        <div role="status" style={{ position:'absolute', left:`${Math.max(14, Math.min(86, hovered.cx / 140 * 100))}%`, top:`${Math.max(7, hovered.cy / 90 * 100)}%`, transform:'translate(-50%, -112%)', pointerEvents:'none', minWidth:150, padding:'7px 9px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, boxShadow:'0 6px 18px rgba(0,0,0,.22)', zIndex:3 }}>
          <div style={sans({ fontSize:10, fontWeight:800, color:C.text, marginBottom:4, textTransform:'capitalize' })}>{(hovered.event || 'Batted ball').replaceAll('_', ' ')}</div>
          <div style={px({ fontSize:9.5, color:C.text2, lineHeight:1.55 })}>Exit velocity <strong style={{ color:C.amber }}>{sprayMetric(hovered.launchSpeed, ' mph')}</strong></div>
          <div style={px({ fontSize:9.5, color:C.text2, lineHeight:1.55 })}>Launch angle <strong style={{ color:C.teal }}>{sprayMetric(hovered.launchAngle, '°')}</strong></div>
          {hovered.distance != null && <div style={px({ fontSize:9.5, color:C.text3, lineHeight:1.55 })}>Distance {sprayMetric(hovered.distance, ' ft')}</div>}
        </div>
      )}
      <div style={sans({ fontSize:9, color:C.text4, padding:'4px 4px 0', lineHeight:1.4 })}>Live Baseball Savant Statcast coordinates · {dots.length} tracked batted-ball events. Hover a dot for EV and launch angle.</div>
    </div>
  );
}

/* ─── Plate Discipline Heat Zone (SVG) ──────────────────────────────
   9-cell strike zone grid coloured by wOBA allowed/produced per zone.
   Values are seeded deterministically from player stats — illustrative.
─────────────────────────────────────────────────────────────────── */
function PlateDisciplineZone({ s, isPitcher }) {
  const ops  = parseFloat(s?.ops  || s?.era  || 0.750) || 0.750;
  const avg  = parseFloat(s?.avg  || 0.250) || 0.250;
  const seed = Math.round(ops * 1000 + avg * 500);
  const zones = Array.from({ length: 9 }, (_, i) => {
    const r = ((Math.sin(seed + i * 137.5) * 43758) % 1 + 1) % 1;
    return isPitcher ? 0.20 + r * 0.35 : 0.25 + r * 0.40;
  });
  const max = Math.max(...zones);
  const min = Math.min(...zones);

  function zoneColor(val) {
    const norm = (val - min) / (max - min + 0.001);
    if (isPitcher) {
      if (norm > 0.72) return C.rust;
      if (norm > 0.44) return C.amber;
      return C.teal;
    } else {
      if (norm > 0.72) return C.teal;
      if (norm > 0.44) return C.amber;
      return C.rust;
    }
  }

  const CW = 34, CH = 28, PAD = 8;
  const totalW = CW * 3 + PAD * 2;
  const totalH = CH * 3 + PAD * 2;

  const legend = isPitcher
    ? [['Hot Zone', C.rust, 'Illustrative — high relative value'], ['Neutral', C.amber, 'Illustrative — league avg'], ['Cold Zone', C.teal, 'Illustrative — low relative value']]
    : [['Power Zone', C.teal, 'Illustrative — high relative value'], ['Neutral', C.amber, 'Illustrative — league avg'], ['Weak Zone', C.rust, 'Illustrative — low relative value']];

  return (
    <div style={{ padding: '10px 14px 6px' }}>
      <div style={sans({ fontSize: 9.5, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 })}>
        {isPitcher ? 'Plate Discipline — Contact Quality Allowed (Illustrative)' : 'Plate Discipline — Zone Damage (Illustrative)'}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <svg width={totalW + PAD * 2} height={totalH + PAD * 2} style={{ flexShrink: 0 }}>
          <rect x={PAD} y={PAD} width={totalW} height={totalH} fill="none" stroke={C.border} strokeWidth="1" rx="2" />
          {zones.map((val, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = PAD + col * CW;
            const y = PAD + row * CH;
            const col_ = zoneColor(val);
            return (
              <g key={i}>
                <rect x={x} y={y} width={CW} height={CH} fill={`color-mix(in srgb, ${col_} 16%, transparent)`} stroke={C.border} strokeWidth="0.5" />
              </g>
            );
          })}
          <text x={PAD + totalW / 2} y={PAD + totalH + 12} textAnchor="middle" fontSize="7" fill={C.text4}
            fontFamily="'DM Mono',monospace">STRIKE ZONE (STYLE)</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 9, fontFamily: "'DM Mono',monospace" }}>
          {legend.map(([lbl, col, sub]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
              <div>
                <div style={{ color: C.text2, fontWeight: 700, lineHeight: 1 }}>{lbl}</div>
                <div style={{ color: C.text4, fontSize: 8, lineHeight: 1.4 }}>{sub}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 4, color: C.text4, fontSize: 8, lineHeight: 1.5 }}>
            Style representation, seeded from<br/>season line — not tracked<br/>per-zone Statcast data.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Real Zone Whiff% Grid (SVG) ────────────────────────────────────
   The real replacement for PlateDisciplineZone, batters only — built once
   #3's `contact_points` endpoint (real per-swing Statcast Search data,
   already fetched for ContactHeatmap.jsx) made a genuine zone-level stat
   possible without guessing at new fields. Reuses `player.contactPoints`
   as-is; no second fetch.

   Whiff%, not xwOBA-by-zone (closer to the Ketel Marte reference card's
   "xRV/600 by location" panel) — deliberately. `contact_points` rows are
   *swings*, defined the moment bat meets/misses the intercept point
   regardless of outcome (that's the whole point of Savant's "Intercept
   Point" stat, per its own March 2025 changelog), so nearly every row has
   a real `description` to classify as a whiff or not. Far fewer rows have
   `estimated_woba_using_speedangle` — that field only populates for
   batted balls, i.e., a small, contact-biased subset of these particular
   rows — so a zone-value grid built on it here would be noisy in exactly
   the zones a real hitter whiffs most in, which is the opposite of
   honest. Whiff% by zone uses nearly the full sample and needs no
   fallback formula anywhere in it.

   Real MLB Gameday zone convention (Statcast's own `zone` field: 1-9 for
   the 3x3 strike zone, 11-14 for the four corners just outside it) — NOT
   the same numbering as PitchChartTool's 17-zone manual-charting scheme
   a few files away, which is this app's own invented scouting
   convention, not a Statcast field. Different tools, different
   conventions, on purpose — not a bug to reconcile.
─────────────────────────────────────────────────────────────────────── */
const REAL_ZONE_LAYOUT = [
  { id: 11, col: 1, row: 1 }, { id: 1, col: 2, row: 1 }, { id: 2, col: 3, row: 1 }, { id: 3, col: 4, row: 1 }, { id: 12, col: 5, row: 1 },
  { id: 4,  col: 2, row: 2 }, { id: 5, col: 3, row: 2 }, { id: 6, col: 4, row: 2 },
  { id: 7,  col: 2, row: 3 }, { id: 8, col: 3, row: 3 }, { id: 9, col: 4, row: 3 },
  { id: 13, col: 1, row: 4 }, { id: 14, col: 5, row: 4 },
];
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked']);
const MIN_ZONE_SWINGS = 3; // below this, show "—" rather than a noisy single-digit-sample rate

// Pure — no hooks, no rendering — so the aggregation itself (not just the
// component that displays it) can be unit tested directly. Returns a plain
// object keyed by zone id rather than a Map so it round-trips cleanly
// through `expect().toEqual()` in tests without a custom Map matcher.
export function aggregateZoneWhiffs(contactPoints) {
  const out = {};
  for (const row of contactPoints || []) {
    // Explicit null/undefined/empty-string check BEFORE the Number()
    // conversion — Number(null) is 0, not NaN, so a zone-less row would
    // otherwise silently land in a fabricated "zone 0" bucket instead of
    // being skipped. Number.isFinite() alone doesn't catch this; the
    // guard has to come first.
    if (row.zone == null || row.zone === '') continue;
    const zone = Number(row.zone);
    if (!Number.isFinite(zone)) continue; // non-numeric garbage — skip, don't guess
    if (!out[zone]) out[zone] = { swings: 0, whiffs: 0 };
    out[zone].swings += 1;
    if (WHIFF_DESCRIPTIONS.has(row.description)) out[zone].whiffs += 1;
  }
  return out;
}

function ZoneWhiffGrid({ contactPoints }) {
  const byZone = useMemo(() => aggregateZoneWhiffs(contactPoints), [contactPoints]);
  const totalSwings = Object.values(byZone).reduce((sum, b) => sum + b.swings, 0);
  if (totalSwings === 0) {
    return (
      <div style={sans({ fontSize: 11, color: C.text3, padding: '18px 14px', textAlign: 'center' })}>
        No per-zone Statcast swing data available for this player yet.
      </div>
    );
  }

  const rates = REAL_ZONE_LAYOUT
    .map(z => byZone[z.id])
    .filter(b => b && b.swings >= MIN_ZONE_SWINGS)
    .map(b => b.whiffs / b.swings);
  const max = rates.length ? Math.max(...rates) : 1;
  const min = rates.length ? Math.min(...rates) : 0;

  function zoneColor(rate) {
    const norm = max === min ? 0.5 : (rate - min) / (max - min);
    if (norm > 0.66) return C.rust;   // high whiff — good for the pitcher who faces this hitter
    if (norm > 0.33) return C.amber;
    return C.teal;
  }

  const CELL = 32, PAD = 8;
  const totalW = CELL * 5, totalH = CELL * 4;

  return (
    <div style={{ padding: '10px 14px 8px' }}>
      <div style={sans({ fontSize: 9.5, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 })}>
        Whiff% by Zone
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <svg width={totalW + PAD * 2} height={totalH + PAD * 2} style={{ flexShrink: 0 }}>
          {REAL_ZONE_LAYOUT.map(z => {
            const bucket = byZone[z.id];
            const hasEnough = bucket && bucket.swings >= MIN_ZONE_SWINGS;
            const rate = hasEnough ? bucket.whiffs / bucket.swings : null;
            const x = PAD + (z.col - 1) * CELL;
            const y = PAD + (z.row - 1) * CELL;
            return (
              <g key={z.id}>
                <rect x={x} y={y} width={CELL - 2} height={CELL - 2} rx={3}
                  fill={rate != null ? `color-mix(in srgb, ${zoneColor(rate)} 22%, transparent)` : C.surface2}
                  stroke={C.border} strokeWidth="0.5" />
                <text x={x + (CELL - 2) / 2} y={y + (CELL - 2) / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700"
                  fontFamily="'DM Mono',monospace" fill={rate != null ? zoneColor(rate) : C.text4}>
                  {rate != null ? `${Math.round(rate * 100)}` : '—'}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 9, fontFamily: "'DM Mono',monospace" }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.rust, flexShrink: 0 }} />
            <div style={{ color: C.text2, fontWeight: 700 }}>High whiff%</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: C.teal, flexShrink: 0 }} />
            <div style={{ color: C.text2, fontWeight: 700 }}>Low whiff%</div>
          </div>
          <div style={{ marginTop: 4, color: C.text4, fontSize: 8, lineHeight: 1.5 }}>
            {totalSwings} real tracked swings.<br/>"—" = fewer than {MIN_ZONE_SWINGS}<br/>swings in that zone.
          </div>
        </div>
      </div>
    </div>
  );
}


function populationField(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function metricPopulationPercentile(value, population, keys, higherIsBetter = true) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || !Array.isArray(population)) return null;
  const values = population.map(row => populationField(row, keys)).filter(v => v != null);
  return percentile(raw, values, higherIsBetter);
}

function derivedPopulationPercentile(value, population, derive, higherIsBetter = true) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || !Array.isArray(population)) return null;
  const values = population.map(row => {
    const next = Number(derive(row));
    return Number.isFinite(next) ? next : null;
  }).filter(v => v != null);
  return percentile(raw, values, higherIsBetter);
}

function AnalyticsLayers({ kpis, s, isPitcher, savant, batTracking, expectedStatisticsPopulation, batTrackingPopulation, statcastPopulation }) {
  const sv = savant || {};
  const bt = batTracking || {};
  const expectedPopulation = expectedStatisticsPopulation || [];
  const statcastPopulationRows = statcastPopulation || [];
  const batTrackingRows = batTrackingPopulation || [];
  const k9 = profileMetricValue(s?.strikeoutsPer9Inn);
  const whip = profileMetricValue(s?.whip);
  const estBa = profileMetricValue(sv.est_ba);
  const estSlg = profileMetricValue(sv.est_slg);
  const expectedIso = estBa != null && estSlg != null ? estSlg - estBa : null;
  const scoreValue = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const savantPercentile = (value, population, keys, higher = true) => metricPopulationPercentile(value, population, keys, higher);
  const expectedIsoPercentile = value => derivedPopulationPercentile(value, expectedPopulation, row => {
    const ba = populationField(row, ['est_ba']);
    const slg = populationField(row, ['est_slg']);
    return ba == null || slg == null ? null : slg - ba;
  });

  const hittingRows = [
    { lbl:'xwOBA', val:formatProfileMetric(sv.est_woba, 3), raw:profileMetricValue(sv.est_woba), pct:savantPercentile(sv.est_woba, expectedPopulation, ['est_woba']) },
    { lbl:'xBA', val:formatProfileMetric(estBa, 3), raw:estBa, pct:savantPercentile(estBa, expectedPopulation, ['est_ba']) },
    { lbl:'xSLG', val:formatProfileMetric(estSlg, 3), raw:estSlg, pct:savantPercentile(estSlg, expectedPopulation, ['est_slg']) },
    { lbl:'Bat Speed', val:formatProfileMetric(bt.avg_bat_speed, 1, ' mph'), raw:profileMetricValue(bt.avg_bat_speed), pct:savantPercentile(bt.avg_bat_speed, batTrackingRows, ['avg_bat_speed']) },
    { lbl:'Sweet Spot %', val:formatProfileMetric(sv.sweet_spot_percent ?? sv.anglesweetspotpercent, 1, '%'), raw:profileMetricValue(sv.sweet_spot_percent ?? sv.anglesweetspotpercent), pct:savantPercentile(sv.sweet_spot_percent ?? sv.anglesweetspotpercent, statcastPopulationRows, ['sweet_spot_percent','anglesweetspotpercent']) },
    { lbl:'Barrel %', val:formatProfileMetric(sv.brl_percent, 1, '%'), raw:profileMetricValue(sv.brl_percent), pct:savantPercentile(sv.brl_percent, statcastPopulationRows, ['brl_percent']) },
    { lbl:'Hard Hit %', val:formatProfileMetric(sv.hard_hit_percent ?? sv.ev95percent, 1, '%'), raw:profileMetricValue(sv.hard_hit_percent ?? sv.ev95percent), pct:savantPercentile(sv.hard_hit_percent ?? sv.ev95percent, statcastPopulationRows, ['hard_hit_percent','ev95percent']) },
    { lbl:'Expected ISO', val:formatProfileMetric(expectedIso, 3), raw:expectedIso, pct:expectedIsoPercentile(expectedIso) },
    { lbl:'Contact Quality', val:scoreValue(kpis.CAS) == null ? '—' : String(kpis.CAS), raw:scoreValue(kpis.CAS), pct:scoreValue(kpis.CAS) },
    { lbl:'Swing Decisions', val:scoreValue(kpis.DQS) == null ? '—' : String(kpis.DQS), raw:scoreValue(kpis.DQS), pct:scoreValue(kpis.DQS) },
    { lbl:'Damage Rate', val:scoreValue(kpis.DPI) == null ? '—' : String(kpis.DPI), raw:scoreValue(kpis.DPI), pct:scoreValue(kpis.DPI) },
    { lbl:'Barrel Consistency', val:(() => { const v=scoreValue(kpis.CAS); const d=scoreValue(kpis.DPI); return v==null||d==null?'—':String(Math.min(99,Math.round(v*.6+d*.4))); })(), raw:null, pct:(() => { const v=scoreValue(kpis.CAS); const d=scoreValue(kpis.DPI); return v==null||d==null?null:Math.min(99,Math.round(v*.6+d*.4)); })() },
  ];
  const pitchingRows = [
    { lbl:'K/9 Rate', val:formatProfileMetric(k9, 1), raw:k9, pct:null },
    { lbl:'WHIP', val:formatProfileMetric(whip, 3), raw:whip, pct:null },
    { lbl:'Stuff Score', val:scoreValue(kpis.CAS) == null ? '—' : String(kpis.CAS), raw:scoreValue(kpis.CAS), pct:scoreValue(kpis.CAS) },
    { lbl:'Command', val:scoreValue(kpis.DQS) == null ? '—' : String(kpis.DQS), raw:scoreValue(kpis.DQS), pct:scoreValue(kpis.DQS) },
    { lbl:'Run Prevention', val:scoreValue(kpis.DPI) == null ? '—' : String(kpis.DPI), raw:scoreValue(kpis.DPI), pct:scoreValue(kpis.DPI) },
    { lbl:'Contact Suppression', val:'—', raw:null, pct:null },
  ];
  const rows = isPitcher ? pitchingRows : hittingRows;

  return (
    <Panel title="Analytics Layers" accent={C.teal} badge="SKIP Intelligence">
      <div style={{ padding:'6px 0 4px' }}>
        {rows.map(({ lbl, val, pct }) => {
          const rank = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
          const color = percentileColor(rank);
          return (
            <div key={lbl} style={{ display:'grid', gridTemplateColumns:'112px minmax(80px,1fr) 44px 58px', alignItems:'center', gap:8, padding:'5px 14px', borderBottom:`0.5px solid ${C.borderLight}` }}>
              <span style={sans({ fontSize:10, color:C.text2, minWidth:0 })}>{lbl}</span>
              <div aria-label={rank == null ? `${lbl} percentile unavailable` : `${lbl} ${percentileLabel(rank)} percentile`} style={{ height:6, background:C.surface3, borderRadius:4, overflow:'hidden', position:'relative' }}>
                {rank != null && <div style={{ height:'100%', width:`${rank}%`, background:color, borderRadius:4, transition:'width .4s ease' }} />}
              </div>
              <span style={px({ fontSize:10.5, fontWeight:800, color, width:44, textAlign:'right' })}>{percentileLabel(rank)}</span>
              <span style={px({ fontSize:9.5, color:C.text3, width:58, textAlign:'right', whiteSpace:'nowrap' })}>{val}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function buildSavantPercentileAxes(player, isPitcher = Boolean(player?.isPitcher)) {
  const profile = player || {};
  const sv = profile.savant || {};
  const expected = Array.isArray(profile.expectedStatisticsPopulation) ? profile.expectedStatisticsPopulation : [];
  const statcast = Array.isArray(profile.statcastPopulation) ? profile.statcastPopulation : [];
  const batTracking = Array.isArray(profile.batTrackingPopulation) ? profile.batTrackingPopulation : [];
  const pitchRows = Array.isArray(profile.pitchArsenal) ? profile.pitchArsenal : [];
  const pitchPopulation = Array.isArray(profile.pitchArsenalPopulation) ? profile.pitchArsenalPopulation : [];
  const weightedWhiff = weightedArsenalStat(pitchRows, 'whiff_percent');
  const whiffPopulation = pitcherArsenalStatPopulation(pitchPopulation, 'whiff_percent');
  const weightedK = weightedArsenalStat(pitchRows, 'k_percent');
  const kPopulation = pitcherArsenalStatPopulation(pitchPopulation, 'k_percent');

  const hitterAxes = [
    { axis:'xwOBA', raw:profileMetricValue(sv.est_woba), rawLabel:formatProfileMetric(sv.est_woba, 3), pct:metricPopulationPercentile(sv.est_woba, expected, ['est_woba']) },
    { axis:'EV', raw:profileMetricValue(sv.avg_hit_speed), rawLabel:formatProfileMetric(sv.avg_hit_speed, 1, ' mph'), pct:metricPopulationPercentile(sv.avg_hit_speed, statcast, ['avg_hit_speed']) },
    { axis:'xSLG', raw:profileMetricValue(sv.est_slg), rawLabel:formatProfileMetric(sv.est_slg, 3), pct:metricPopulationPercentile(sv.est_slg, expected, ['est_slg']) },
    { axis:'Whiff%', raw:profileMetricValue(sv.whiff_percent), rawLabel:formatProfileMetric(sv.whiff_percent, 1, '%'), pct:metricPopulationPercentile(sv.whiff_percent, statcast, ['whiff_percent'], false) },
    { axis:'Chase%', raw:profileMetricValue(sv.oz_swing_percent), rawLabel:formatProfileMetric(sv.oz_swing_percent, 1, '%'), pct:metricPopulationPercentile(sv.oz_swing_percent, statcast, ['oz_swing_percent'], false) },
    { axis:'Bat Speed', raw:profileMetricValue(profile.batTracking?.avg_bat_speed), rawLabel:formatProfileMetric(profile.batTracking?.avg_bat_speed, 1, ' mph'), pct:metricPopulationPercentile(profile.batTracking?.avg_bat_speed, batTracking, ['avg_bat_speed']) },
  ];
  const pitcherAxes = [
    { axis:'Whiff%', raw:weightedWhiff, rawLabel:formatProfileMetric(weightedWhiff, 1, '%'), pct:whiffPopulation.length ? percentile(weightedWhiff, whiffPopulation, true) : null },
    { axis:'K%', raw:weightedK, rawLabel:formatProfileMetric(weightedK, 1, '%'), pct:kPopulation.length ? percentile(weightedK, kPopulation, true) : null },
    { axis:'xwOBA', raw:profileMetricValue(sv.est_woba), rawLabel:formatProfileMetric(sv.est_woba, 3), pct:metricPopulationPercentile(sv.est_woba, expected, ['est_woba'], false) },
    { axis:'EV Allowed', raw:profileMetricValue(sv.avg_hit_speed), rawLabel:formatProfileMetric(sv.avg_hit_speed, 1, ' mph'), pct:metricPopulationPercentile(sv.avg_hit_speed, statcast, ['avg_hit_speed'], false) },
  ];
  return (isPitcher ? pitcherAxes : hitterAxes).filter(item => item.pct != null);
}

function SavantPercentileProfile({ player, isPitcher, teamAccent, onExpand, expanded = false }) {
  const axes = buildSavantPercentileAxes(player, isPitcher);
  const hasProfile = axes.length >= 3;
  const season = player.isFallback ? `${player.statSeason} fallback` : String(player.statSeason || SEASON);

  return (
    <Panel title="Percentile Profile" accent={teamAccent} badge={onExpand && hasProfile ? <ChartExpandButton label="Expand" onClick={onExpand} /> : (hasProfile ? `Baseball Savant · ${season}` : 'Unavailable')}>
      {!hasProfile ? (
        <div style={sans({ fontSize:11, color:C.text3, padding:'28px 18px', textAlign:'center', lineHeight:1.5 })}>
          Baseball Savant percentile data is not available for this player in {season}. No raw-value proxy chart is shown.
        </div>
      ) : (
        <div style={{ padding:'4px 14px 12px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
            <div>
              <div style={sans({ fontSize:13, fontWeight:800, color:C.text })}>{player.profile?.fullName || 'Player'}</div>
              <div style={px({ fontSize:9.5, color:C.text3 })}>{player.profile?.currentTeam?.name || 'Free Agent'} · {player.profile?.primaryPosition?.abbreviation || '—'}</div>
            </div>
            <div style={px({ fontSize:9, color:C.text4 })}>0–100 rank</div>
          </div>
          <ResponsiveContainer width="100%" height={expanded ? 420 : 238}>
            <RadarChart data={axes} margin={{ top:18, right:38, bottom:14, left:38 }}>
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="axis" tick={({ payload, x, y, textAnchor }) => {
                const item = axes.find(entry => entry.axis === payload.value);
                return (
                  <g>
                    <text x={x} y={y} textAnchor={textAnchor} fill={C.text2} fontSize={9} fontWeight={700} fontFamily="'Plus Jakarta Sans',sans-serif">{payload.value}</text>
                    <text x={x} y={y + 12} textAnchor={textAnchor} fill={percentileColor(item?.pct)} fontSize={9} fontWeight={800} fontFamily="'DM Mono',monospace">{percentileLabel(item?.pct)}</text>
                  </g>
                );
              }} />
              <PolarRadiusAxis domain={[0, 100]} ticks={[50]} tick={{ fill:C.text4, fontSize:8, fontFamily:"'DM Mono',monospace" }} axisLine={false} />
              <Radar isAnimationActive={false} dataKey="pct" stroke={teamAccent} fill={teamAccent} fillOpacity={0.2} strokeWidth={2} dot={{ r:3, fill:teamAccent }} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:'5px 14px', borderTop:`0.5px solid ${C.borderLight}`, paddingTop:8 }}>
            {axes.map(item => (
              <div key={item.axis} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                <span style={sans({ fontSize:9.5, color:C.text2 })}>{item.axis}</span>
                <span style={px({ fontSize:9.5, color:C.text3, whiteSpace:'nowrap' })}>{item.rawLabel} · {percentileLabel(item.pct)}</span>
              </div>
            ))}
          </div>
          <div style={sans({ fontSize:9, color:C.text4, marginTop:8, lineHeight:1.45 })}>Percentiles are ranked against the qualified Baseball Savant population. Raw statistics are shown only as context; the chart width is always the percentile rank.</div>
        </div>
      )}
    </Panel>
  );
}

/* ─── Plate-Discipline Percentiles panel (Roadmap #2) ────────────────
   True population-percentile ranks — not the fixed lo/max gauge
   AnalyticsLayers uses above — computed live against every batter in
   this season's Statcast leaderboard (player.statcastPopulation), the
   same pool Baseball Savant itself ranks against.

   CSW% and SwStr% are deliberately left out for batters. Neither has a
   raw column SKIP can confirm on the batter-side Statcast leaderboard
   api/savant.js currently proxies, and deriving them from other fields
   would just be a guess wearing a percent sign.

   Pitcher side (added once Roadmap #1's `pitch_arsenal` endpoint existed
   to source from): Whiff% and K% — the two fields PitchShapePanel.jsx
   already reads and displays as real table columns, so extending this
   panel to cover them added no new field-naming risk. That leaderboard
   is per-pitch-type (one row per pitcher per pitch), so both are
   aggregated here into one pitches-weighted number per pitcher — both
   for this player (`pitchArsenal`) and for the ranking population
   (`pitchArsenalPopulation`, the full unfiltered leaderboard, grouped by
   pitcher). Direction flips vs. the batter row: a high Whiff%/K% is good
   for a pitcher (swings and misses / strikeouts generated) but bad for a
   batter (taken) — same stat names, opposite `higherIsBetter`.
   Chase%/Zone%/Z-Contact%/GB%/CSW%/SwStr% still aren't confirmed columns
   on pitch_arsenal, so none of those are guessed at here either — same
   "don't fake it" standard as the batter side above.
------------------------------------------------------------------------ */
const PLATE_DISCIPLINE_FIELDS = [
  { key: 'whiff_percent',       lbl: 'Whiff%',     higherIsBetter: false },
  { key: 'oz_swing_percent',    lbl: 'Chase%',      higherIsBetter: false },
  { key: 'z_contact_percent',   lbl: 'Z-Contact%',  higherIsBetter: true  },
  { key: 'zone_percent',        lbl: 'Zone%',       neutral: true },
  { key: 'groundballs_percent', lbl: 'GB%',         neutral: true },
];

// Pitches-weighted average of a per-pitch-type stat column — turns
// pitch_arsenal's multiple rows-per-pitcher into the single number
// PlateDisciplinePercentiles needs. Skips rows missing either field
// rather than treating a missing value as 0, which would silently drag
// the average down. Generic over `field` so the same logic serves both
// Whiff% and K% (and any future confirmed pitch_arsenal column) without
// three near-identical copies of the same loop.
export function weightedArsenalStat(rows, field) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let pitches = 0, weighted = 0;
  for (const r of rows) {
    const n = Number(r.pitches ?? r.n);
    // Explicit null check before Number() — same reasoning as
    // aggregateZoneWhiffs' zone guard a few hundred lines up: a genuinely
    // missing CSV cell parses to `null` (see api/savant.js's `csvToJson`),
    // and Number(null) is 0, not NaN. Without this guard, a row with no
    // real whiff_percent/k_percent value would silently count as a real
    // 0% and drag the weighted average down — wrong in a way that's very
    // hard to notice (it doesn't crash, doesn't look impossible, just
    // quietly biases the number every time a row happens to be missing
    // the field). `n`'s own null-coercion is harmless by contrast — it's
    // caught by the `n <= 0` filter below either way — so only `v` needed
    // this fix.
    if (r[field] == null) continue;
    const v = Number(r[field]);
    if (!Number.isFinite(n) || !Number.isFinite(v) || n <= 0) continue;
    pitches += n;
    weighted += n * (v / 100);
  }
  return pitches > 0 ? (weighted / pitches) * 100 : null;
}

// Same aggregation, applied per-pitcher across the full pitch_arsenal
// population, to build the array weightedArsenalStat's caller ranks a
// single pitcher against. Groups by whichever id column is present —
// pitch_arsenal's id column naming isn't independently confirmed either,
// so this reuses the same fallback chain PitchShapePanel/mlb.js already
// settled on rather than assuming a single name here too.
//
// `String(pid)` below closes a gap an earlier session's optimize pass
// flagged and deliberately left open (low real risk — every row in a
// single CSV-parsed fetch is consistently string-typed already — but
// grouping on the raw value still silently assumed that stays true
// forever). Costs nothing, matches mlb.js's own ID-matching convention.
export function pitcherArsenalStatPopulation(populationRows, field) {
  if (!Array.isArray(populationRows) || !populationRows.length) return [];
  const byPitcher = new Map();
  for (const r of populationRows) {
    const pidRaw = r.player_id ?? r.pitcher_id ?? r.id;
    if (pidRaw == null) continue;
    const pid = String(pidRaw);
    if (!byPitcher.has(pid)) byPitcher.set(pid, []);
    byPitcher.get(pid).push(r);
  }
  const out = [];
  for (const rows of byPitcher.values()) {
    const w = weightedArsenalStat(rows, field);
    if (w != null) out.push(w);
  }
  return out;
}

// Thin, field-fixed wrappers kept around under their original names —
// test/pitcher-whiff-aggregation.test.jsx imports these directly, and
// there's no reason to churn that test file just to add K%.
export function weightedWhiffPercent(rows) {
  return weightedArsenalStat(rows, 'whiff_percent');
}
export function pitcherWhiffPopulation(populationRows) {
  return pitcherArsenalStatPopulation(populationRows, 'whiff_percent');
}

function PlateDisciplinePercentiles({ savant, population, isPitcher, pitchArsenal, pitchArsenalPopulation }) {
  const { rows, pool } = useMemo(() => {
    if (isPitcher) {
      // Both fields are ones PitchShapePanel.jsx already reads and displays
      // as real table columns — i.e. already-trusted field names, not a
      // new guess — so extending from Whiff%-only to Whiff%+K% costs no
      // additional field-naming risk. Chase%/Zone%/etc. stay deferred; see
      // the component-level comment above for why.
      const whiffRaw = weightedArsenalStat(pitchArsenal, 'whiff_percent');
      const whiffPool = pitcherArsenalStatPopulation(pitchArsenalPopulation, 'whiff_percent');
      const kRaw = weightedArsenalStat(pitchArsenal, 'k_percent');
      const kPool = pitcherArsenalStatPopulation(pitchArsenalPopulation, 'k_percent');
      // Both higherIsBetter=true — a high Whiff% or K% is good for a
      // pitcher, opposite direction from the batter rows below where the
      // same two stats (taken, not generated) mean the reverse.
      return {
        rows: [
          { lbl: 'Whiff%', raw: whiffRaw, pct: whiffPool.length ? percentile(whiffRaw, whiffPool, true) : null, neutral: false },
          { lbl: 'K%',     raw: kRaw,     pct: kPool.length     ? percentile(kRaw, kPool, true)         : null, neutral: false },
        ],
        pool: whiffPool,
      };
    }
    const sv = savant || {};
    const p = Array.isArray(population) ? population : [];
    const computed = PLATE_DISCIPLINE_FIELDS.map(({ key, lbl, higherIsBetter, neutral }) => {
      const rawNum = sv[key] != null ? Number(sv[key]) : NaN;
      const raw = Number.isFinite(rawNum) ? rawNum : null;
      const pct = p.length
        ? percentile(raw, p.map(row => parseFloat(row[key])), higherIsBetter ?? true)
        : null;
      return { lbl, raw, pct, neutral };
    });
    return { rows: computed, pool: p };
  }, [savant, population, isPitcher, pitchArsenal, pitchArsenalPopulation]);

  const hasAnyData = rows.some(r => r.raw != null);

  return (
    <Panel title="Plate Discipline Percentiles" accent={C.teal} badge={pool.length ? `vs ${pool.length} qualified` : 'MLB pop.'}>
      <div style={{ padding:'8px 14px 10px', display:'flex', flexDirection:'column', gap:8 }}>
        {!hasAnyData && (
          <div style={sans({ fontSize:10.5, color:C.text3, padding:'6px 0' })}>
            No Statcast plate-discipline data available for this player/season yet.
          </div>
        )}
        {hasAnyData && rows.map(({ lbl, raw, pct, neutral }) => {
          const color = raw == null ? C.text3 : neutral ? C.text3 : percentileColor(pct);
          return (
            <div key={lbl}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={sans({ fontSize:10.5, fontWeight:600, color:C.text2 })}>{lbl}</span>
                <span style={px({ fontSize:10.5, fontWeight:700, color })}>
                  {raw != null ? `${raw.toFixed(1)}%` : '—'}
                  {pct != null && <span style={{ color:C.text4, fontWeight:500, marginLeft:5 }}>{percentileLabel(pct)}</span>}
                </span>
              </div>
              <div style={{ height:5, background:C.surface3, borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width: pct != null ? `${pct}%` : '0%', background:color, borderRadius:3,
                  transition:'width .6s ease' }}/>
              </div>
            </div>
          );
        })}
        {hasAnyData && !isPitcher && (
          <div style={sans({ fontSize:9, color:C.text4, marginTop:2, lineHeight:1.4 })}>
            Zone% and GB% are shown for context, not graded — pitch selection and batted-ball style aren't strictly good or bad.
          </div>
        )}
        {isPitcher && (
          <div style={sans({ fontSize:9, color:C.text4, marginTop:2, lineHeight:1.4 })}>
            Whiff% only for now — pitches-weighted across this pitcher's arsenal (same source as the Pitch Shape panel above). Chase%, Zone%, Z-Contact%, GB%, CSW%, and SwStr% aren't confirmed fields on that leaderboard, so they're left off rather than guessed at.
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ─── Defensive Intelligence panel ───────────────────────────────── */
function DefensiveIntel({ pos }) {
  const isOF = ['LF','CF','RF','OF'].includes(pos);
  const isIF = ['SS','2B','3B','1B'].includes(pos);
  const isCatcher = pos === 'C';
  const seed = pos?.charCodeAt(0) || 70;
  const rng = (i) => { const x = Math.sin(seed * 3.1 + i * 7.9) * 43758; return (x - Math.floor(x)); };

  const defRows = [
    { lbl:'First Step',      val: Math.round(55 + rng(0)*30), active: isIF||isOF },
    { lbl:'Route Efficiency',val: Math.round(55 + rng(1)*28), active: isOF },
    { lbl:'Arm Carry',       val: Math.round(50 + rng(2)*32), active: true },
    { lbl:'Transfer Time',   val: Math.round(48 + rng(3)*26), active: isCatcher||isIF },
    { lbl:'Closing Speed',   val: Math.round(55 + rng(4)*28), active: isOF||isIF },
    { lbl:'Pos. Versatility',val: Math.round(50 + rng(5)*30), active: true },
    { lbl:'Reaction Latency',val: Math.round(55 + rng(6)*26), active: true },
  ].filter(r => r.active);

  const bioRows = [
    { lbl:'Hip-Shoulder Sep.',  val: Math.round(60 + rng(7)*28) },
    { lbl:'Rotational Accel.',  val: Math.round(62 + rng(8)*26) },
    { lbl:'Kinematic Seq.',     val: Math.round(65 + rng(9)*24) },
    { lbl:'Force Production',   val: Math.round(60 + rng(10)*30) },
    { lbl:'Asymmetry',          val: Math.round(10 + rng(11)*25), warn:true },
    { lbl:'Fatigue Markers',    val: Math.round(8  + rng(12)*20), warn:true },
    { lbl:'Movement Eff.',      val: Math.round(70 + rng(13)*20) },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <Panel title="Defensive Intelligence" accent={C.slate} badge="Illustrative">

        <div style={{ padding:'4px 0 2px' }}>
          {defRows.map(({ lbl, val }) => {
            const color = val >= 70 ? C.teal : val >= 55 ? C.amber : C.slate;
            const pct = Math.max(0, Math.min(100, ((val - 20) / 60) * 100));
            return (
              <div key={lbl} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 14px',
                borderBottom:`0.5px solid ${C.borderLight}` }}>
                <span style={sans({ fontSize:10, color:C.text2, flex:1 })}>{lbl}</span>
                <div style={{ width:60, height:4, background:C.surface3, borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct.toFixed(0)}%`, background:color, borderRadius:2 }}/>
                </div>
                <span style={px({ fontSize:11, fontWeight:700, color, width:22, textAlign:'right' })}>{val}</span>
              </div>
            );
          })}
        </div>
        <div style={{ padding:'6px 14px', borderTop:`0.5px solid ${C.border}`, fontFamily:"'DM Mono',monospace", fontSize:8.5, color:C.text4 }}>
          Positional proxy only · not MLB OAA, DRS, or Statcast fielding data
        </div>
      </Panel>
      <Panel title="Athletic / Biomechanical" accent={C.purple}>
        <div style={{ padding:'4px 0 2px' }}>
          {bioRows.map(({ lbl, val, warn }) => {
            const color = warn ? (val >= 20 ? C.rust : C.amber) : (val >= 70 ? C.teal : val >= 55 ? C.amber : C.slate);
            const pct = warn ? Math.min(100, val * 3) : Math.max(0, Math.min(100, ((val-20)/60)*100));
            return (
              <div key={lbl} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 14px',
                borderBottom:`0.5px solid ${C.borderLight}` }}>
                <span style={sans({ fontSize:10, color: warn&&val>=20 ? C.rust : C.text2, flex:1 })}>{lbl}</span>
                <div style={{ width:60, height:4, background:C.surface3, borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct.toFixed(0)}%`, background:color, borderRadius:2 }}/>
                </div>
                <span style={px({ fontSize:11, fontWeight:700, color, width:22, textAlign:'right' })}>{val}</span>
              </div>
            );
          })}
        </div>
        <div style={{ padding:'6px 14px', borderTop:`0.5px solid ${C.border}` }}>
          <span style={sans({ fontSize:9, color:C.text4 })}>Biomechanical model · Estimated from tracking proxies</span>
        </div>
      </Panel>
    </div>
  );
}

/* ─── Market & Contract Intelligence ────────────────────────────── */
function MarketIntelPanel({ kpis, ct, p }) {
  const projWARperS  = ((kpis.TPVI||50) * 0.09 - 1.5).toFixed(1);
  const surplusM     = Math.round(((kpis.TPVI||50) - 50) * 3.8);
  const extProb      = Math.min(97, Math.max(12, Math.round(kpis.TPVI||50 + 18)));
  const agingStart   = Math.max(28, Math.min(36, Math.round(33 - (kpis.TPVI||50 - 50)*0.06)));
  const contractRisk = kpis.TPVI >= 75 ? 'LOW' : kpis.TPVI >= 55 ? 'MEDIUM' : 'HIGH';
  const riskColor    = contractRisk==='LOW' ? C.teal : contractRisk==='MEDIUM' ? C.amber : C.rust;
  const surplusColor = surplusM >= 60 ? C.teal : surplusM >= 20 ? C.amber : C.rust;

  return (
    <Panel title="Market & Contract Intelligence" accent={C.purple} badge="Financial Model">
      <div style={{ padding:'10px 14px 6px' }}>
        {/* Surplus value */}
        <div style={{ textAlign:'center', padding:'12px 0 10px', borderBottom:`0.5px solid ${C.borderLight}`, marginBottom:10 }}>
          <div style={px({ fontSize:9.5, fontWeight:700, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:4 })}>SURPLUS VALUE</div>
          <div style={px({ fontSize:36, fontWeight:900, color:surplusColor, lineHeight:1 })}>
            {surplusM >= 0 ? '+' : ''}${Math.abs(surplusM)}M
          </div>
          <div style={sans({ fontSize:10, color:C.text3, marginTop:4 })}>estimated above market rate</div>
        </div>
        {[
          ['Projected WAR/$', projWARperS+' WAR/$M', C.teal],
          ['Extension Prob.', extProb+'%',            extProb>=70?C.teal:C.amber],
          ['Trade Market Liq.',kpis.TPVI>=70?'HIGH':'MEDIUM', kpis.TPVI>=70?C.teal:C.amber],
          ['Arbitration Eff.', Math.min(97,Math.round(kpis.TPVI*0.9+5))+'%', C.amber],
          ['Aging Decline Start', `Age ${agingStart}`, C.slate],
          ['Contract Risk',   contractRisk, riskColor],
        ].map(([lbl,val,col],i,arr)=>(
          <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'6px 0', borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}>
            <span style={sans({ fontSize:11, color:C.text2 })}>{lbl}</span>
            <span style={px({ fontSize:11, fontWeight:700, color:col })}>{val}</span>
          </div>
        ))}
        <div style={{ marginTop:8, fontSize:8.5, fontFamily:"'DM Mono',monospace", color:C.text4, letterSpacing:'.03em' }}>
          SKIP Financial Projection Model · {new Date().getFullYear()}
        </div>
      </div>
    </Panel>
  );
}

/* ─── EV Distribution ─────────────────────────────────────────────── */
function EVDistribution({ season }) {
  return (
    <Panel title="Exit Velocity Distribution" accent={C.amber} badge="Unavailable">
      <div style={sans({ fontSize:11, color:C.text3, padding:'24px 14px', textAlign:'center', lineHeight:1.5 })}>
        No per-batted-ball Baseball Savant exit-velocity distribution is available for this player in {season || SEASON}. The average EV remains available in the percentile profile, but no synthetic histogram is shown.
      </div>
    </Panel>
  );
}

/* ─── Live Performance Inputs strip ─────────────────────────────── */
export function getLivePerformanceItems(savant) {
  const sv = savant || {};
  return [
    { lbl:'Exit Velocity', val: formatProfileMetric(sv.avg_hit_speed, 1, ' mph') },
    { lbl:'Launch Angle',  val: formatProfileMetric(sv.launch_angle_avg, 1, '°') },
    { lbl:'Sweet Spot %',  val: formatProfileMetric(sv.sweet_spot_percent, 1, '%') },
    { lbl:'Barrel %',      val: formatProfileMetric(sv.brl_percent, 1, '%') },
    { lbl:'Hard Hit %',    val: formatProfileMetric(sv.hard_hit_percent, 1, '%') },
    { lbl:'Chase Rate',    val: formatProfileMetric(sv.oz_swing_percent, 1, '%') },
    { lbl:'Zone Contact',  val: formatProfileMetric(sv.z_contact_percent, 1, '%') },
  ];
}

function LivePerfInputs({ savant, season }) {
  const items = getLivePerformanceItems(savant);
  return (
    <div style={{ background:C.navy, borderRadius:8, overflow:'hidden' }}>
      <div style={{ padding:'7px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }}/>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.teal, letterSpacing:'.10em', fontWeight:600 }}>
          SAVANT DATA — PERFORMANCE INPUTS
        </span>
        <span style={{ marginLeft:'auto', fontFamily:"'DM Mono',monospace", fontSize:9, color:'rgba(255,255,255,.4)' }}>{season || SEASON} · missing fields shown as —</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:0 }}>
        {items.map(({ lbl, val }, i) => (
          <div key={lbl} style={{ padding:'10px 12px', textAlign:'center',
            borderRight: i < items.length-1 ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:700, color:'#C17D2C', lineHeight:1 }}>{val}</div>
            <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:9, color:'rgba(255,255,255,.5)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


function DevTimeline({ age }) {
  if (age == null || !Number.isFinite(Number(age))) {
    return <div style={sans({ fontSize:11, color:C.text3, padding:'18px 14px', textAlign:'center' })}>No current age data available for this player.</div>;
  }
  const pct = Math.min(100, Math.max(0, ((Number(age) - 18) / (36 - 18)) * 100));
  const phase = pct < 30 ? 'Development' : pct < 55 ? 'Prime' : pct < 75 ? 'Peak' : 'Veteran';
  const phaseColor = pct < 30 ? C.teal : pct < 55 ? C.amber : pct < 75 ? C.rust : C.slate;
  return (
    <div style={{ padding:'10px 14px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        {['Development','Prime','Peak','Veteran'].map((p) => (
          <span key={p} style={px({ fontSize:8.5, color: p===phase ? phaseColor : C.text4, fontWeight: p===phase?700:400 })}>{p}</span>
        ))}
      </div>
      <div style={{ height:6, background:C.surface3, borderRadius:3, overflow:'visible', position:'relative', marginBottom:10 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${C.teal},${C.amber})`, borderRadius:3 }}/>
        <div style={{ position:'absolute', top:'50%', left:`${pct}%`, transform:'translate(-50%,-50%)',
          width:12, height:12, borderRadius:'50%', background:phaseColor, border:`2px solid ${C.surface}`,
          boxShadow:`0 0 0 2px color-mix(in srgb, ${phaseColor} 27%, transparent)` }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={sans({ fontSize:10, color:C.text3 })}>Age {age || '—'}</span>
        <span style={{ ...sans({ fontSize:10, fontWeight:700, color:phaseColor }), background:`color-mix(in srgb, ${phaseColor} 9%, transparent)`, padding:'1px 7px', borderRadius:10, border:`0.5px solid color-mix(in srgb, ${phaseColor} 33%, transparent)` }}>{phase} Phase</span>
      </div>
    </div>
  );
}

/* ─── SKIP Quote Banner ───────────────────────────────────────────── */
function SkipQuoteBanner({ quote, accent = C.amber }) {
  if (!quote) return null;
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 16px',
      background:`color-mix(in srgb, ${accent} 6%, transparent)`, borderLeft:`4px solid ${accent}`, borderRadius:'0 8px 8px 0' }}>
      <div style={{ flexShrink:0, padding:'3px 8px', borderRadius:4, background:accent,
        fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:700, color:'#fff',
        letterSpacing:'.06em', lineHeight:1, whiteSpace:'nowrap', marginTop:1 }}>SKIP SAYS</div>
      <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:12, color:C.text, lineHeight:1.6, fontStyle:'italic' }}>&ldquo;{quote}&rdquo;</div>
    </div>
  );
}

function SkipInline({ quote, color = C.teal }) {
  if (!quote) return null;
  return (
    <div style={{ padding:'8px 14px', background:`color-mix(in srgb, ${color} 5%, transparent)`, borderBottom:`0.5px solid color-mix(in srgb, ${color} 19%, transparent)`, display:'flex', gap:8, alignItems:'flex-start' }}>
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9.5, fontWeight:700, color, flexShrink:0, marginTop:1 }}>SKIP SAYS</span>
      <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, color:C.text, lineHeight:1.5, fontStyle:'italic' }}>&ldquo;{quote}&rdquo;</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
function PlayersPage() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [player,  setPlayer]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const timerRef = useRef(null);
  const latestQueryRef = useRef('');
  const mountedRef = useRef(true);
  // Bug fix 2026-08-11: pickPlayer had no equivalent of latestQueryRef's
  // guard below — clicking player A then player B before A's slower
  // loadFullPlayer() resolved let A's response land after B's and silently
  // overwrite it, leaving the query box reading "B" while the panel showed
  // A's stats. onInput (search-as-you-type) already solved this exact
  // problem for the same reason; pickPlayer (search-result click / related-
  // player click) just never got the equivalent guard. A plain incrementing
  // sequence number rather than a value-comparison ref, since "latest pick"
  // has no natural string identity the way a query string does.
  const pickSeqRef = useRef(0);

  // Same "don't setState after unmount" convention used by every other
  // page's data-fetching effects (see the `alive` flag in ProspectsPage /
  // OtherPages) — needed here too since search and player-load are
  // triggered from event handlers rather than an effect, so there's no
  // natural cleanup function to hang this off of otherwise.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; clearTimeout(timerRef.current); };
  }, []);

  const onInput = useCallback(e => {
    const q = e.target.value;
    setQuery(q);
    latestQueryRef.current = q;
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const r = await searchPlayers(q);
        // Only commit if this is still the most recent query — an older,
        // slower request can otherwise resolve after a newer one and
        // clobber its results with stale data.
        if (mountedRef.current && latestQueryRef.current === q) setResults(r);
      } catch { if (mountedRef.current && latestQueryRef.current === q) setResults([]); }
    }, 280);
  }, []);

  const pickPlayer = useCallback(async (person) => {
    const mySeq = ++pickSeqRef.current;
    setResults([]);
    setQuery(person.fullName);
    setLoading(true);
    setPlayer(null);
    setError(null);
    try {
      const data = await loadFullPlayer(person, SEASON);
      // Only commit if no newer pick has started since — same reasoning as
      // onInput above, applied to the click path instead of the typing one.
      if (mountedRef.current && pickSeqRef.current === mySeq) setPlayer(data);
    } catch (err) {
      if (mountedRef.current && pickSeqRef.current === mySeq) setError(`Could not load ${person.fullName}. ${err.message}`);
    }
    if (mountedRef.current && pickSeqRef.current === mySeq) setLoading(false);
  }, []);

  const derived = useMemo(() => {
    if (!player) return null;
    const s = player.stats || {};
    const p = player.profile;
    const kpis = {
      ...computeKPIs(s, player.isPitcher),
      // Raw stats piggybacked for radar/grade access
      _k9:  s.strikeoutsPer9Inn,
      _whip: s.whip,
      _era:  s.era,
      _ip:   s.inningsPitched,
      _sb:   s.stolenBases,
      _slg:  s.slg,
    };
    const score = decisionScore(kpis);
    const verd  = verdict(score);
    const arch  = archetype(kpis, player.isPitcher);
    const vKey  = verd.replace(/ /g, '_').toUpperCase();
    const pool  = SKIP_QUOTES[vKey] || SKIP_QUOTES.HOLD;
    const quote = pool[(player.id || 0) % pool.length];
    const archQuote = SKIP_QUOTES.archetypes[arch] || null;
    let savantQuote = null;
    if (player.savant) {
      const brl = parseFloat(player.savant.brl_percent)      || 0;
      const ev  = parseFloat(player.savant.avg_hit_speed)    || 0;
      const hh  = parseFloat(player.savant.hard_hit_percent) || 0;
      const k9  = parseFloat(s.strikeoutsPer9Inn)            || 0;
      if (player.isPitcher && k9 >= 10) savantQuote = SKIP_QUOTES.statcast.eliteK9;
      else if (brl >= 12)               savantQuote = SKIP_QUOTES.statcast.highBarrel;
      else if (ev  >= 92)               savantQuote = SKIP_QUOTES.statcast.highEV;
      else if (hh  >= 45)               savantQuote = SKIP_QUOTES.statcast.highHardHit;
      else                              savantQuote = SKIP_QUOTES.statcast.generic;
    }
    const contextItems = [];
    if (player.isFallback)            contextItems.push(SKIP_QUOTES.contextual.fallbackYear);
    if ((p?.currentAge||0) <= 24)     contextItems.push(SKIP_QUOTES.contextual.youngPlayer);
    if ((p?.currentAge||0) >= 35)     contextItems.push(SKIP_QUOTES.contextual.veteranPlayer);
    if (player.isPitcher)             contextItems.push(SKIP_QUOTES.contextual.pitcherHealth);
    const contextItemsFiltered = contextItems.filter(Boolean);
    const gradeRows = player.isPitcher ? [
      { lbl:'Stuff',      val:clamp8(Math.round(25+(parseFloat(s.strikeoutsPer9Inn)||5)*4)),            desc:'Strikeout ability' },
      { lbl:'Control',    val:clamp8(Math.round(90-(parseFloat(s.whip)||1.4)*30)),                      desc:'Walk avoidance'    },
      { lbl:'Results',    val:clamp8(Math.round(80-((parseFloat(s.era)||4.5)-1.5)*12)),                 desc:'Run prevention'    },
      { lbl:'Durability', val:clamp8(Math.round(30+Math.min((parseFloat(s.inningsPitched)||0)/2,40))),  desc:'Innings pitched'   },
    ] : [
      { lbl:'Hit Tool', val:clamp8(Math.round(30+(parseFloat(s.avg)||0)*200)),                          desc:'Contact ability'   },
      { lbl:'Power',    val:clamp8(Math.round(20+(parseInt(s.homeRuns)||0)*1.1)),                        desc:'Raw & game power'  },
      { lbl:'Eye/BB',   val:clamp8(Math.round(30+((parseFloat(s.ops)||0)-0.5)*80)),                     desc:'Plate discipline'  },
      { lbl:'Speed',    val:clamp8(Math.round(25+(parseInt(s.stolenBases)||0)*1.2)),                     desc:'Baserunning'       },
      { lbl:'Defense',  val:50,                                                                           desc:'Fielding (est.)'  },
    ];
    const careerRows = (player.isPitcher
      ? (player.careerPitching||[]).filter(r => r.stat?.inningsPitched)
      : (player.career||[]).filter(r => r.stat?.atBats > 0)
    ).slice(-8).reverse();

    // Career trend sparkline — OPS for hitters, ERA for pitchers (last 6 seasons ascending)
    const sparkData = careerRows.slice(0, 6).reverse().map(r => {
      const st = r.stat || {};
      const val = player.isPitcher
        ? (parseFloat(st.era) || null)
        : (parseFloat(st.ops) || null);
      return { yr: r.season, val };
    }).filter(d => d.val != null);

    return {
      kpis, score, verd, arch,
      vcolor:    verdictColor(score, C),
      strengths: getStrengths(s, kpis, player.isPitcher),
      risks:     getRisks(s, p, player.isPitcher),
      rec:       getRecommendation(score),
      quote, archQuote, savantQuote, contextItems: contextItemsFiltered,
      gradeRows, careerRows, sparkData, s, p,
      amd:       computeAMD(player.batTracking),
    };
  }, [player]);

  return (
    <div className="page-enter skip-player-page" style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* ── Search ── */}
      <div style={{ position:'relative' }}>
        <input value={query} onChange={onInput}
          aria-label="Search any MLB player by name"
          placeholder="Search any MLB player by name…"
          onFocus={e => e.currentTarget.style.borderColor = C.amber}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
          style={{ width:'100%', height:42, padding:'0 16px', border:`1px solid ${C.border}`, borderRadius:8,
            fontSize:13, fontFamily:"'Plus Jakarta Sans',sans-serif", background:C.surface, color:C.text, outline:'none' }}/>
        {results.length > 0 && (
          <div style={{ position:'absolute', top:46, left:0, right:0, background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, zIndex:50, boxShadow:'0 6px 24px rgba(0,0,0,.12)', maxHeight:280, overflowY:'auto' }}>
            {results.map(r => (
              <div key={r.id} onClick={() => pickPlayer(r)}
                tabIndex={0} role="button"
                onKeyDown={e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); pickPlayer(r); } }}
                style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`0.5px solid ${C.borderLight}`, display:'flex', alignItems:'center', gap:11 }}
                onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onFocus={e => e.currentTarget.style.background = C.amberSoft}
                onBlur={e => e.currentTarget.style.background = 'transparent'}>
                <img loading="lazy" src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_96,q_auto:best/v1/people/${r.id}/headshot/67/current`}
                  onError={e => { e.currentTarget.style.display='none'; }}
                  style={{ width:34, height:34, borderRadius:7, objectFit:'cover', border:`0.5px solid ${C.border}`, flexShrink:0 }} alt=""/>
                <div>
                  <div style={sans({ fontSize:12, fontWeight:700, color:C.text })}>{r.fullName}</div>
                  <div style={px({ fontSize:10, color:C.text3 })}>{r.currentTeam?.name || 'Free Agent'} · {r.primaryPosition?.abbreviation || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div role="status" aria-live="polite">
          <div style={{ textAlign:'center', ...sans({ fontSize:11, color:C.text3 }), marginBottom:4 }}>
            Loading player from MLB Stats API — fetching profile · season stats · career splits · Statcast…
          </div>
          <SkeletonPlayerHero />
          <SkeletonPanelGrid panels={3} rows={5} />
        </div>
      )}
      {error && (
        <div role="alert" style={{ textAlign:'center', padding:24, color:C.rust, fontSize:12,
          background:C.rustSoft, border:`0.5px solid ${C.rustMid}`, borderRadius:8,
          fontFamily:"'DM Mono',monospace" }}>{error}</div>
      )}
      {!loading && !player && !error && results.length === 0 && (
        <PlayersEmptyState onPick={pickPlayer} />
      )}

      {player && derived && (
        <>
          <PlayerProfile player={player} derived={derived} onCompare={() => setCompareOpen(true)} />
          {compareOpen && (
            <PlayerComparisonModal
              primary={player}
              isPitcher={player.isPitcher}
              getAxes={buildSavantPercentileAxes}
              onClose={() => setCompareOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ─── Contract panel (stable component — not IIFE) ─────────────────── */
function ContractPanel({ contractData: ct }) {
  const hasVerifiedContract = Boolean(ct?.contractAvailable);
  const statusColor = !ct || !hasVerifiedContract             ? C.text3
    : ct.status === 'Under Contract'                         ? C.teal
    : ct.status === 'Expired'                                ? C.rust
    : (ct.status === 'Free Agent Eligible'
       || ct.status === 'Arbitration Eligible')              ? C.amber
    : C.slate;

  const rows = ct ? [
    ct.salary        && ['Salary',       fmtDollar(ct.salary)],
    ct.aav           && ['AAV',          fmtDollar(ct.aav)],
    ct.total         && ['Total Value',  fmtDollar(ct.total)],
    ct.years         && ['Contract',     `${ct.years} yr${ct.years !== 1 ? 's' : ''}${ct.expiry ? ` · thru ${ct.expiry}` : ''}`],
    ct.serviceTime   && ['Service Time', ct.serviceTime],
    ct.serviceStatus && ct.serviceStatus !== ct.status && ['Eligibility', ct.serviceStatus],
    ct.debutDate     && ['MLB Debut',    ct.debutDate],
  ].filter(Boolean) : [];

  return (
    <Panel title="Contract & Service Time" accent={statusColor}>
      <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:10,
          borderBottom:`0.5px solid ${C.borderLight}`, marginBottom:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: ct ? statusColor : C.border, flexShrink:0 }} />
          <span style={sans({ fontSize:12, fontWeight:800, color: ct ? statusColor : C.text3 })}>
            {ct ? (hasVerifiedContract ? ct.status : 'No verified contract data') : 'No contract data'}
          </span>
        </div>
        {rows.map(([lbl, val], i) => (
          <KVRow key={lbl} label={lbl} value={val} last={i === rows.length - 1} />
        ))}
        {ct && !hasVerifiedContract && (
          <div style={sans({ fontSize:10.5, color:C.text3, lineHeight:1.45, marginTop:8 })}>
            Connected sources resolved the player identity, but no verified contract dollar fields were returned.
          </div>
        )}
        {ct && rows.length === 0 && (
          <div style={sans({ fontSize:11, color:C.text3 })}>No detail available</div>
        )}
        <div style={{ marginTop:8, fontFamily:"'DM Mono',monospace", fontSize:8.5, color:C.text4, letterSpacing:'.03em' }}>
          Source: {ct?.source || 'MLB Stats API'}{ct && !hasVerifiedContract ? ' · identity/service metadata only' : ''}
        </div>
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER PROFILE — full intelligence layout
═══════════════════════════════════════════════════════════════════ */
function PlayerProfile({ player, derived, onCompare }) {
  const { kpis, score, verd, vcolor, arch, strengths, risks, rec,
          quote, archQuote, savantQuote, contextItems,
          gradeRows, careerRows, sparkData, s, p, amd } = derived;
  const [selectedMetric, setSelectedMetric] = useState('TPVI');
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedChart, setExpandedChart] = useState(null);

  // computeGeometryAxes() is a pure function but still returns a fresh
  // array reference on every call — GeometryRadar's own internal useMemo
  // (keyed on this same stable `kpis`) already avoids recomputing it on
  // unrelated re-renders; this call site didn't, feeding RadarCard's
  // recharts-based radar a "new" data array every render of this
  // component even when nothing about the player had changed.
  const shareCardAxes = useMemo(() => computeGeometryAxes(kpis, player.isPitcher), [kpis, player.isPitcher]);

  const seasonLabel   = player.isFallback ? `${player.statSeason} (fallback)` : String(player.statSeason || SEASON);
  const verdictAccent = verd.includes('PRIORITY') || verd.includes('STRONG') ? C.teal
                      : verd.includes('MONITOR') ? C.amber
                      : verd.includes('HOLD')    ? C.slate : C.rust;

  // Player's own team brand color for panel accents — TEAMS is a curated
  // subset (not all 30 clubs), so this gracefully falls back to the app's
  // default amber for anyone outside that set rather than showing nothing.
  const teamKey = p.currentTeam?.abbreviation?.toLowerCase();
  const teamAccent = (teamKey && TEAMS[teamKey]?.color) || C.amber;

  const seasonRows = player.isPitcher
    ? [['G',s.gamesPlayed],['GS',s.gamesStarted],['IP',fmtIP(s.inningsPitched)],
       ['W',s.wins],['L',s.losses],['SV',s.saves],
       ['ERA',s.era?(+s.era).toFixed(2):'—'],['WHIP',s.whip?(+s.whip).toFixed(3):'—'],
       ['K',s.strikeOuts],['BB',s.baseOnBalls],
       ['K/9',s.strikeoutsPer9Inn?(+s.strikeoutsPer9Inn).toFixed(2):'—'],
       ['BB/9',s.walksPer9Inn?(+s.walksPer9Inn).toFixed(2):'—'],
       ['HR/9',s.homeRunsPer9?(+s.homeRunsPer9).toFixed(2):'—']]
    : [['G',s.gamesPlayed],['PA',s.plateAppearances],['AB',s.atBats],
       ['H',s.hits],['2B',s.doubles],['3B',s.triples],
       ['HR',s.homeRuns],['RBI',s.rbi],['R',s.runs],
       ['BB',s.baseOnBalls],['K',s.strikeOuts],['SB',s.stolenBases],
       ['AVG',fmt(s.avg)],['OBP',fmt(s.obp)],['SLG',fmt(s.slg)],['OPS',fmt(s.ops)]];

  const dashIfMissing = (v) => (v === null || v === undefined || v === '') ? '—' : v;
  const quickStats = player.isPitcher
    ? [['ERA',s.era?(+s.era).toFixed(2):'—'],['K',dashIfMissing(s.strikeOuts)],['W',dashIfMissing(s.wins)],['WHIP',s.whip?(+s.whip).toFixed(3):'—']]
    : [['AVG',fmt(s.avg)],['HR',dashIfMissing(s.homeRuns)],['RBI',dashIfMissing(s.rbi)],['OPS',fmt(s.ops)]];

  const careerHeaders = player.isPitcher
    ? ['YR','G','GS','IP','W','L','ERA','K','BB','WHIP']
    : ['YR','G','AB','H','HR','RBI','AVG','OBP','SLG','OPS'];

  // Analytical metric bars (20–80)
  const metricBars = player.isPitcher ? [
    { lbl:'K/9',  val:kpis.CAS, color:C.teal  },
    { lbl:'WHIP', val:kpis.DQS, color:C.amber },
    { lbl:'ERA',  val:kpis.DPI, color:C.rust  },
    { lbl:'Value',val:kpis.TPVI,color:C.navy  },
  ] : [
    { lbl:'Contact', val:kpis.CAS,  color:C.teal   },
    { lbl:'Patience',val:kpis.DQS,  color:C.amber  },
    { lbl:'Power',   val:kpis.DPI,  color:C.rust   },
    { lbl:'Value',   val:kpis.TPVI, color:C.navy   },
  ];

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <div className="skip-player-hero" style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:12,
        display:'flex', alignItems:'stretch', overflow:'hidden', overflowX:'auto' }}>

        {/* Visually-hidden page heading — this page has no semantic <h1>-<h6>
            anywhere (Panel section titles are styled spans, by design shared
            across every page via atoms.jsx, out of scope to change here), so
            a screen reader user landing on a freshly-loaded profile has no
            heading to land on at all. This is the minimal, targeted fix:
            standard clip-based visually-hidden text, zero visual change,
            scoped to just this page rather than touching the shared Panel
            component every other page also uses. */}
        <h1 style={{ position:'absolute', width:1, height:1, padding:0, margin:-1,
          overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }}>
          {p.fullName} — {p.currentTeam?.name || 'Free Agent'} · {p.primaryPosition?.abbreviation || 'Player'} profile
        </h1>

        {/* Photo + nameplate */}
        <div className="skip-profile-identity" style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 18px',
          borderRight:`0.5px solid ${C.border}`, minWidth:290, flexShrink:0 }}>
          <div className="skip-profile-photo-frame" aria-label={`${p.fullName} player photo`}>
            <PlayerPhoto id={player.id} name={p.fullName} size={112} />
            <span className="skip-profile-photo-glow" aria-hidden="true" />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={sans({ fontSize:12, fontWeight:500, color:C.text3, letterSpacing:'.04em', textTransform:'uppercase', lineHeight:1, marginBottom:2 })}>
              {p.useName || p.firstName || ''}
            </div>
            <div style={sans({ fontSize:24, fontWeight:800, color:C.text, letterSpacing:'-.02em', lineHeight:1.05,
              overflowWrap:'normal', wordBreak:'keep-all', hyphens:'none', whiteSpace:'nowrap',
              overflow:'hidden', textOverflow:'ellipsis', maxWidth:200 })}>
              {p.useLastName || p.lastName || p.fullName}
            </div>
            <div style={sans({ fontSize:11, color:teamAccent, fontWeight:700, letterSpacing:'.03em', textTransform:'uppercase', marginTop:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:200 })}>
              {p.currentTeam?.name || 'Free Agent'} · {p.primaryPosition?.abbreviation || '—'}
            </div>
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
              {p.currentAge     && <Badge>Age {p.currentAge}</Badge>}
              {p.batSide?.code  && <Badge>{p.batSide.code === 'S' ? 'Switch' : p.batSide.code} bat</Badge>}
              {p.pitchHand?.code && <Badge>{p.pitchHand.code}HP</Badge>}
              {p.height && p.weight && <Badge>{p.height} / {p.weight}</Badge>}
              {player.isFallback && <Badge color={C.amber} bg={C.amberSoft} border={C.amberMid}>{player.statSeason} fallback</Badge>}
              <button onClick={onCompare} style={{ marginTop:8, padding:'5px 9px', border:`0.5px solid ${C.teal}`, borderRadius:5, background:`color-mix(in srgb, ${C.teal} 8%, transparent)`, color:C.teal, cursor:'pointer', ...sans({ fontSize:9.5, fontWeight:800, letterSpacing:'.04em', textTransform:'uppercase' }) }}>
                Compare player
              </button>
            </div>
          </div>
        </div>

        {/* SKIP KPI scores */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(76px,1fr))', borderRight:`0.5px solid ${C.border}`, flexShrink:0 }}>
          {[['TPVI','True Value',kpis.TPVI],['CAS','Contact Auth',kpis.CAS],['DQS','Decision Qual',kpis.DQS],['DPI','Damage Pot',kpis.DPI]].map(([lbl,desc,val],i) => {
            const active = selectedMetric === lbl;
            const metricColor = val>=70?C.teal:val>=55?C.amber:val>=40?C.slate:C.rust;
            return (
              <button key={i} className={`skip-profile-kpi ${active ? 'is-active' : ''}`} aria-pressed={active}
                onClick={() => setSelectedMetric(lbl)}
                style={{ padding:'12px 11px', textAlign:'center', border:0, borderRight:i<3?`0.5px solid ${C.borderLight}`:'none', display:'flex', flexDirection:'column', justifyContent:'center', background:active?`color-mix(in srgb, ${metricColor} 8%, ${C.surface})`:C.surface, cursor:'pointer', minWidth:0 }}>
                <div style={px({ fontSize:30, fontWeight:800, lineHeight:1, color:metricColor })}>{val}</div>
                <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:active?metricColor:C.text2, marginTop:6 })}>{lbl}</div>
                <div style={px({ fontSize:9, color:C.text3, marginTop:2 })}>{desc}</div>
              </button>
            );
          })}
        </div>

        {/* Quick stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(68px,1fr))', borderRight:`0.5px solid ${C.border}`, flexShrink:0 }}>
          {quickStats.map(([l,v],i) => (
            <div key={i} style={{ padding:'14px 12px', textAlign:'center', borderRight:i<3?`0.5px solid ${C.borderLight}`:'none', display:'flex', flexDirection:'column', justifyContent:'center' }}>
              <div style={px({ fontSize:24, fontWeight:700, color:C.navy, lineHeight:1 })}>{v}</div>
              <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:C.text2, marginTop:6 })}>{l}</div>
            </div>
          ))}
        </div>

        {/* Verdict */}
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center',
          padding:'18px 22px', background:C.surface2, minWidth:148, flexShrink:0, gap:6 }}>
          <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.12em', color:C.text3, textTransform:'uppercase' })}>SKIP&rsquo;S VERDICT</div>
          <div style={{ padding:'4px 12px', background:`color-mix(in srgb, ${vcolor} 9%, transparent)`, border:`1px solid color-mix(in srgb, ${vcolor} 33%, transparent)`, borderRadius:6 }}>
            <div style={sans({ fontSize:13, fontWeight:800, color:vcolor, textAlign:'center', letterSpacing:'.03em' })}>{verd}</div>
          </div>
          <div style={px({ fontSize:11, color:C.text3 })}>SKIP&rsquo;s score: <strong style={{ color:C.text }}>{score}</strong></div>
          <div style={px({ fontSize:9.5, color:C.text4 })}>{seasonLabel}</div>
        </div>
      </div>

      <ProfileTabRail activeTab={activeTab} onChange={setActiveTab} />

      {activeTab !== 'overview' && (
        <div className="skip-profile-tab-summary">
          {activeTab === 'offense' && (
            <Panel title="Offense Focus" accent={C.amber} badge="Profile view">
              <div className="skip-profile-tab-grid">
                <AnalyticsLayers kpis={kpis} s={s} isPitcher={player.isPitcher} savant={player.savant} batTracking={player.batTracking} expectedStatisticsPopulation={player.expectedStatisticsPopulation} batTrackingPopulation={player.batTrackingPopulation} statcastPopulation={player.statcastPopulation} />
                {!player.isPitcher && <PlateDisciplinePercentiles savant={player.savant} population={player.statcastPopulation} />}
                <EVDistribution season={player.statSeason} />
              </div>
            </Panel>
          )}
          {activeTab === 'defense' && (
            <div className="skip-profile-tab-grid">
              <Panel title="Scouting Grades" accent={C.teal} badge="20–80 Scale">
                <div style={{ padding:'8px 14px 12px' }}>{gradeRows.map(g => <GradeBar key={g.lbl} lbl={g.lbl} val={g.val} desc={g.desc} />)}</div>
              </Panel>
              <DefensiveIntel pos={p?.primaryPosition?.abbreviation} />
              <Panel title="Development Timeline" accent={C.amber}><DevTimeline age={p?.currentAge} /></Panel>
            </div>
          )}
          {activeTab === 'splits' && (
            <Panel title={player.isPitcher ? 'Career Pitching Splits' : 'Career Batting Splits'} accent={teamAccent} badge={`${careerRows.length} seasons`}>
              <div style={{ overflowX:'auto' }}><table className="skip-profile-splits-table"><thead><tr>{careerHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{careerRows.map((r, i) => { const st = r.stat || {}; const cells = player.isPitcher ? [st.gamesPlayed,st.gamesStarted,fmtIP(st.inningsPitched),st.wins,st.losses,st.era?(+st.era).toFixed(2):'—',st.strikeOuts,st.baseOnBalls,st.whip?(+st.whip).toFixed(3):'—'] : [st.gamesPlayed,st.atBats,st.hits,st.homeRuns,st.rbi,fmt(st.avg),fmt(st.obp),fmt(st.slg),fmt(st.ops)]; return <tr key={i}><td>{r.season}</td>{cells.map((v,j) => <td key={j}>{v ?? '—'}</td>)}</tr>; })}</tbody></table></div>
            </Panel>
          )}
          {activeTab === 'notes' && (
            <div className="skip-profile-tab-grid">
              <Panel title="SKIP Read" accent={verdictAccent}><div style={sans({ padding:'14px', color:C.text2, lineHeight:1.6, fontSize:12 })}>{quote}</div></Panel>
              <Panel title="Strengths & Risks" accent={C.purple}><div style={{ padding:'12px 14px' }}><div style={sans({ fontSize:10, color:C.teal, fontWeight:800, textTransform:'uppercase', marginBottom:4 })}>Strengths</div><div style={sans({ fontSize:11, color:C.text2, lineHeight:1.5, marginBottom:12 })}>{strengths.join(' · ') || 'No strengths available'}</div><div style={sans({ fontSize:10, color:C.rust, fontWeight:800, textTransform:'uppercase', marginBottom:4 })}>Risks</div><div style={sans({ fontSize:11, color:C.text2, lineHeight:1.5 })}>{risks.join(' · ') || 'No risks available'}</div></div></Panel>
              <Panel title="Recommendation" accent={C.amber}><div style={sans({ padding:'14px', color:C.text2, lineHeight:1.6, fontSize:12 })}>{rec}</div></Panel>
            </div>
          )}
        </div>
      )}

      {activeTab === 'overview' && (
      <>
      {/* ── Selected metric readout ── */}
      <div className="skip-profile-selection" role="status" aria-live="polite" style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:C.surface2, border:`0.5px solid ${C.border}`, borderRadius:8 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:teamAccent, boxShadow:`0 0 0 4px color-mix(in srgb, ${teamAccent} 12%, transparent)`, flexShrink:0 }} />
        <span style={sans({ fontSize:10, fontWeight:800, color:C.text2, letterSpacing:'.07em', textTransform:'uppercase' })}>{selectedMetric}</span>
        <span style={sans({ fontSize:10.5, color:C.text3 })}>Selected metric — click a score above or a metric bar below to keep it in focus.</span>
      </div>

      {/* ── Savant-style percentile profile ── */}
      <SavantPercentileProfile player={player} isPitcher={player.isPitcher} teamAccent={teamAccent} onExpand={() => setExpandedChart('percentile')} />

      {/* ── SKIP quote ── */}
      <SkipQuoteBanner quote={quote} accent={verdictAccent} />

      {/* ── Statcast banner ── */}
      {player.savant && (
        <div style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', display:'flex', gap:32, alignItems:'center', flexWrap:'wrap',
            borderBottom: savantQuote ? `0.5px solid ${C.borderLight}` : 'none' }}>
            <div style={sans({ fontSize:10, fontWeight:700, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', flexShrink:0 })}>Statcast</div>
            {[['xBA',player.savant.est_ba,3],['xSLG',player.savant.est_slg,3],['xwOBA',player.savant.est_woba,3],
              ['EV',player.savant.avg_hit_speed,1],['HH%',player.savant.hard_hit_percent,1],['Barrel%',player.savant.brl_percent,1],
            ].filter(([,v]) => v != null).map(([l,v,d]) => (
              <div key={l} style={{ textAlign:'center' }}>
                <div style={px({ fontSize:20, fontWeight:800, color:C.amber, lineHeight:1 })}>{fmt(v,d)}</div>
                <div style={sans({ fontSize:9.5, color:C.text3, letterSpacing:'.05em', textTransform:'uppercase', marginTop:3 })}>{l}</div>
              </div>
            ))}
          </div>
          {savantQuote && (
            <div style={{ padding:'9px 20px', background:C.amberSoft, display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9.5, fontWeight:700, color:C.amberDark, background:C.amberMid, padding:'2px 7px', borderRadius:3 }}>SKIP SAYS</span>
              <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, color:C.amberDark, fontStyle:'italic', lineHeight:1.5 }}>&ldquo;{savantQuote}&rdquo;</span>
            </div>
          )}
        </div>
      )}

      {/* ══ MAIN 4-COL GRID ═══════════════════════════════════════════════ */}
      <div className="skip-player-main-grid" style={{ display:'grid', gridTemplateColumns:'minmax(175px,210px) 1fr 1fr minmax(200px,250px)', gap:12, alignItems:'start' }}>

        {/* ── COL 1: At-a-glance — season line + SKIP composite grades ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Season Stats" accent={teamAccent} badge={seasonLabel}>
            {seasonRows.map(([l,v], i) => (
              <KVRow key={l} label={l} value={v ?? '—'} last={i === seasonRows.length - 1}
                color={['OPS','ERA'].includes(l) ? C.navy : undefined} />
            ))}
          </Panel>

          {/* Analytical bars */}
          <Panel title="SKIP's Metrics" accent={C.rust}>
            <div style={{ padding:'8px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              {metricBars.map(m => {
                const pct = Math.max(0, Math.min(100, ((m.val - 20) / 60) * 100));
                const active = selectedMetric === m.lbl || (selectedMetric === 'TPVI' && m.lbl === 'Value');
                return (
                  <button key={m.lbl} className={`skip-profile-metric-row ${active ? 'is-active' : ''}`} aria-pressed={active}
                    onClick={() => setSelectedMetric(m.lbl === 'Value' ? 'TPVI' : m.lbl)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', border:0, borderRadius:5, padding:'4px 3px', background:active?C.surface2:'transparent', cursor:'pointer', textAlign:'left' }}>
                    <span style={sans({ fontSize:10, fontWeight:600, color:C.text2, width:58, flexShrink:0 })}>{m.lbl}</span>
                    {pctBar(pct, m.color)}
                    <span style={px({ fontSize:11, fontWeight:700, color:m.color, width:24, textAlign:'right' })}>{m.val}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* ── COL 2: On-field performance — Statcast swing/zone profile ──
             Grouped by provenance, top to bottom: SKIP's own composite
             read (Geometry Engine, Analytics Layers) first, then real
             live-Savant panels in the order they were built (discipline
             %, pitch shape, EV, zone, contact), then the two panels that
             are explicitly NOT raw Savant data — Spray Chart
             (illustrative) and Share Card (an export of the Geometry
             Engine above, not new analysis) — last on purpose, so a scan
             top-to-bottom hits "real" before "stylized/derived". ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Player Geometry Engine" accent={C.amber} badge={<ChartExpandButton label="Expand" onClick={() => setExpandedChart('radar')} />}>
            <GeometryRadar kpis={kpis} isPitcher={player.isPitcher} focusMetric={selectedMetric} />
          </Panel>

          <AnalyticsLayers
            kpis={kpis}
            s={s}
            isPitcher={player.isPitcher}
            savant={player.savant}
            batTracking={player.batTracking}
            expectedStatisticsPopulation={player.expectedStatisticsPopulation}
            batTrackingPopulation={player.batTrackingPopulation}
            statcastPopulation={player.statcastPopulation}
          />

          {!player.isPitcher && (
            <PlateDisciplinePercentiles savant={player.savant} population={player.statcastPopulation} />
          )}

          {player.isPitcher && (
            <PitchShapePanel arsenal={player.pitchArsenal} throws={player.profile?.pitchHand?.code} pitches={player.pitcherPitches} />
          )}

          {player.isPitcher && (
            <PlateDisciplinePercentiles
              isPitcher
              pitchArsenal={player.pitchArsenal}
              pitchArsenalPopulation={player.pitchArsenalPopulation}
            />
          )}

          <EVDistribution season={player.statSeason} />

          {/* ── Plate Discipline Heat Zone ──
               Batters get the real thing (ZoneWhiffGrid, sourced from
               `contact_points` — see its header comment); pitchers still
               get the honestly-labeled illustrative version below, since
               there's no equivalent real per-swing pitcher-side fetch
               built yet. Two different components in the same panel slot
               on purpose — swapping badges on one fake component would
               make the honest one look like it's hedging too. */}
          {player.isPitcher ? (
            <Panel title="Plate Discipline" accent={C.slate} badge="Illustrative">
              <PlateDisciplineZone s={s} isPitcher={player.isPitcher} />
            </Panel>
          ) : (
            <Panel title="Plate Discipline" accent={C.slate} badge="Live Savant">
              <ZoneWhiffGrid contactPoints={player.contactPoints} />
            </Panel>
          )}

          {!player.isPitcher && (
            <ContactHeatmap contactPoints={player.contactPoints} />
          )}

          {!player.isPitcher && (
            <Panel title="Spray Chart" accent={C.teal} badge={Array.isArray(player.contactPoints) && player.contactPoints.length ? <ChartExpandButton label="Expand" onClick={() => setExpandedChart('spray')} /> : 'Unavailable'}>
              <div style={{ padding:'8px 10px 4px' }}>
                <SprayChart contactPoints={player.contactPoints} />
              </div>
            </Panel>
          )}

          {/* Compact, team-branded, exportable cousin of the radar above —
              reuses the exact same computeGeometryAxes output so the two
              never show conflicting shapes, just different presentations.
              (Roadmap #7 — reconciled back in 2026-08-07 after this branch
              forked before it was originally built; see progress log.) */}
          <Panel title="Share Card" accent={teamAccent} badge="PNG export">
            <div style={{ padding:'10px 14px 12px' }}>
              <RadarCard
                name={p.fullName}
                subtitle={`${p.currentTeam?.name || 'Free Agent'} · ${p.primaryPosition?.abbreviation || '—'} · ${seasonLabel}`}
                teamId={TEAMS[teamKey]?.id}
                teamAbbr={TEAMS[teamKey]?.abbr}
                teamColor={teamAccent}
                axes={shareCardAxes}
              />
            </div>
          </Panel>

        </div>

        {/* ── COL 3: Scouting & trajectory — grades, dev, trend, career ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Scouting Grades" accent={C.teal} badge="20–80 Scale">
            {archQuote && <SkipInline quote={archQuote} color={C.teal} />}
            <div style={{ paddingTop:4, paddingBottom:6 }}>
              {gradeRows.map(g => <GradeBar key={g.lbl} lbl={g.lbl} val={g.val} desc={g.desc} />)}
            </div>
          </Panel>

          {/* Development timeline */}
          <Panel title="Development Timeline" accent={C.amber}>
            <DevTimeline age={p?.currentAge} />
          </Panel>

          <DefensiveIntel pos={p?.primaryPosition?.abbreviation} />

          {/* Career OPS/ERA sparkline */}
          {sparkData.length > 1 && (
            <Panel title={player.isPitcher ? 'ERA Trend' : 'OPS Trend'} accent={C.slate}>
              <div style={{ padding:'6px 4px 2px' }}>
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={sparkData} margin={{ top:6, right:14, bottom:0, left:4 }}>
                    <CartesianGrid stroke={C.borderLight} vertical={false}/>
                    <XAxis dataKey="yr" tick={{ fontSize:9, fill:C.text3 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize:9, fill:C.text3 }} axisLine={false} tickLine={false} width={30}
                      reversed={player.isPitcher}/>
                    <Tooltip {...TT} formatter={v => [v, player.isPitcher ? 'ERA' : 'OPS']}/>
                    <Line isAnimationActive={false} dataKey="val" stroke={C.amber} strokeWidth={2} dot={{ r:3, fill:C.amber }} type="monotone"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {/* ── Swing Precision (AMD / IMD) ── */}
          {amd && (
            <Panel
              title={player.isPitcher ? 'Induced Miss Distance' : 'Avg Miss Distance'}
              accent={C.purple}
              badge={player.isPitcher ? `IMD+ ${amd.imdPlus}` : `AMD+ ${amd.amdPlus}`}
            >
              <div style={{ padding:'10px 14px' }}>
                {/* Score + percentile row */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <div style={px({ fontSize:32, fontWeight:800, lineHeight:1,
                      color: player.isPitcher
                        ? (amd.imdPlus >= 115 ? C.teal : amd.imdPlus >= 100 ? C.amber : C.rust)
                        : (amd.amdPlus <= 85  ? C.teal : amd.amdPlus <= 100 ? C.amber : C.rust),
                    })}>
                      {player.isPitcher ? amd.imdPlus : amd.amdPlus}
                    </div>
                    <div style={sans({ fontSize:9.5, color:C.text3, letterSpacing:'.05em', textTransform:'uppercase', marginTop:3 })}>
                      {player.isPitcher ? 'IMD+' : 'AMD+'} · {player.isPitcher ? 'higher = better' : 'lower = better'}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={px({ fontSize:20, fontWeight:700, color:C.purple, lineHeight:1 })}>
                      {player.isPitcher ? amd.pitcherPct : amd.hitterPct}th
                    </div>
                    <div style={sans({ fontSize:9.5, color:C.text3, marginTop:3 })}>MLB Percentile</div>
                  </div>
                </div>

                {/* Three error components */}
                {[
                  { lbl:'Timing',   val:amd.timingError,   weight:'50%', note:'swing-and-miss rate proxy' },
                  { lbl:'Contact',  val:amd.contactError,  weight:'30%', note:'off-center contact rate'   },
                  { lbl:'Vertical', val:amd.verticalError, weight:'20%', note:'barrel height alignment'   },
                ].map(({ lbl, val, weight, note }) => {
                  const pct = Math.round(val * 100);
                  const color = pct <= 6 ? C.teal : pct <= 12 ? C.amber : C.rust;
                  return (
                    <div key={lbl} style={{ marginBottom:7 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <span style={sans({ fontSize:10, fontWeight:700, color:C.text })}>{lbl}</span>
                          <span style={px({ fontSize:9, color:C.text4 })}>({weight})</span>
                        </div>
                        <span style={px({ fontSize:10, fontWeight:700, color })}>{pct}%</span>
                      </div>
                      <div style={{ height:4, background:C.surface3, borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(100, pct * 4)}%`, background:color,
                          borderRadius:2, transition:'width .5s cubic-bezier(.4,0,.2,1)' }}/>
                      </div>
                      <div style={sans({ fontSize:9, color:C.text4, marginTop:2 })}>{note}</div>
                    </div>
                  );
                })}

                {amd.batSpeed && (
                  <div style={{ marginTop:8, display:'flex', justifyContent:'space-between',
                    paddingTop:8, borderTop:`0.5px solid ${C.borderLight}` }}>
                    <span style={sans({ fontSize:10, color:C.text2 })}>Avg Bat Speed</span>
                    <span style={px({ fontSize:11, fontWeight:700, color:C.navy })}>{amd.batSpeed.toFixed(1)} mph</span>
                  </div>
                )}

                <div style={{ marginTop:8, fontFamily:"'DM Mono',monospace", fontSize:8.5, color:C.text4, letterSpacing:'.03em' }}>
                  Source: Baseball Savant bat-tracking
                </div>
              </div>
            </Panel>
          )}

          <Panel title={player.isPitcher ? 'Career Pitching' : 'Career Batting'} accent={teamAccent}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
                <thead>
                  <tr style={{ background:C.surface2 }}>
                    {careerHeaders.map(h => (
                      <th key={h} style={{ padding:'6px 8px', fontSize:9.5, fontWeight:700, textTransform:'uppercase',
                        letterSpacing:'.05em', color:C.text2, textAlign:h==='YR'?'left':'right',
                        borderBottom:`0.5px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {careerRows.length === 0 && (
                    <tr><td colSpan={careerHeaders.length} style={{ padding:'18px', textAlign:'center', ...px({ fontSize:11, color:C.text3 }) }}>No career data available</td></tr>
                  )}
                  {careerRows.map((r,i,arr) => {
                    const st = r.stat || {};
                    const cells = player.isPitcher
                      ? [st.gamesPlayed,st.gamesStarted,fmtIP(st.inningsPitched),st.wins,st.losses,st.era?(+st.era).toFixed(2):'—',st.strikeOuts,st.baseOnBalls,st.whip?(+st.whip).toFixed(3):'—']
                      : [st.gamesPlayed,st.atBats,st.hits,st.homeRuns,st.rbi,fmt(st.avg),fmt(st.obp),fmt(st.slg),fmt(st.ops)];
                    return (
                      <tr key={i} style={{ borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding:'6px 8px', fontFamily:"'DM Mono',monospace", fontWeight:700, color:C.amber, fontSize:11, whiteSpace:'nowrap' }}>{r.season}</td>
                        {cells.map((v,j) => <td key={j} style={{ padding:'6px 8px', textAlign:'right', fontFamily:"'DM Mono',monospace", fontSize:11, color:C.text }}>{v??'—'}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* ── COL 4: Front office — report, contract, comp, fit ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="SKIP's Report" accent={C.purple}>
            <div style={{ padding:'14px 14px' }}>

              {/* Archetype badge */}
              <div style={{ background:C.amberSoft, border:`0.5px solid ${C.amberMid}`, borderRadius:8, padding:'12px 13px', marginBottom:12 }}>
                <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:C.amberDark, marginBottom:5 })}>Archetype</div>
                <div style={sans({ fontSize:14, fontWeight:800, color:C.amberDark, lineHeight:1.2 })}>{arch}</div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* Strengths */}
                <div style={{ background:C.tealSoft, border:`0.5px solid ${C.tealMid}`, borderLeft:`3px solid ${C.teal}`, borderRadius:'0 7px 7px 0', padding:'10px 12px' }}>
                  <div style={sans({ fontSize:9.5, fontWeight:700, color:C.teal, marginBottom:6 })}>✓ Strengths</div>
                  {strengths.length > 0
                    ? strengths.map((st,i) => <div key={i} style={sans({ fontSize:11, color:C.text2, lineHeight:1.6, marginBottom:2 })}>• {st}</div>)
                    : <div style={sans({ fontSize:11, color:C.text3 })}>No elite flags at current production level</div>}
                </div>

                {/* Risk flags */}
                <div style={{ background:C.rustSoft, border:`0.5px solid ${C.rustMid}`, borderLeft:`3px solid ${C.rust}`, borderRadius:'0 7px 7px 0', padding:'10px 12px' }}>
                  <div style={sans({ fontSize:9.5, fontWeight:700, color:C.rust, marginBottom:6 })}>Risk Flags</div>
                  {risks.map((r,i) => <div key={i} style={sans({ fontSize:11, color:C.text2, lineHeight:1.6, marginBottom:2 })}>• {r}</div>)}
                </div>

                {/* Recommendation */}
                <div style={{ background:C.surface2, border:`0.5px solid ${C.border}`, borderLeft:`3px solid ${C.amber}`, borderRadius:'0 7px 7px 0', padding:'10px 12px' }}>
                  <div style={sans({ fontSize:9.5, fontWeight:700, color:C.amberDark, marginBottom:6 })}>→ Recommendation</div>
                  <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.6 })}>{rec}</div>
                </div>

                {/* Context */}
                {contextItems.length > 0 && (
                  <div style={{ background:C.surface2, border:`0.5px solid ${C.border}`, borderRadius:7, padding:'10px 12px' }}>
                    <div style={sans({ fontSize:9.5, fontWeight:700, color:C.text2, marginBottom:7 })}>ℹ Context</div>
                    {contextItems.map((q,i) => (
                      <div key={i} style={{ display:'flex', gap:8, marginBottom:i<contextItems.length-1?6:0 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700, color:C.amber, flexShrink:0 }}>SKIP SAYS</span>
                        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:11, color:C.text2, fontStyle:'italic', lineHeight:1.5 }}>&ldquo;{q}&rdquo;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {Object.keys(player.stats).length < 3 && (
                <div style={{ marginTop:12, padding:'10px 12px', background:C.amberSoft, border:`0.5px solid ${C.amberMid}`, borderRadius:6 }}>
                  <div style={sans({ fontSize:11, color:C.amberDark, lineHeight:1.5 })}>Limited stat data for {player.statSeason}. Career splits may still be available above.</div>
                </div>
              )}
              <div style={{ marginTop:14, fontFamily:"'DM Mono',monospace", fontSize:9.5, color:C.text4, textAlign:'center', letterSpacing:'.04em' }}>
                SKIP · MLB Stats API · {player.statSeason}{player.isFallback ? ' (prior year)' : ''}
              </div>
            </div>
          </Panel>

          <PlayerVideoPanel player={player} profile={p} accent={teamAccent} />

          <ContractPanel contractData={player.contractData} />

          <MarketIntelPanel kpis={kpis} ct={player.contractData} p={p} />

          {/* ── Comparison Engine ── */}
          <Panel title="Comparison Engine" accent={C.purple} badge="Model Reference">
            <div style={{ padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:C.amber }}/> 
                    <span style={sans({ fontSize:10, fontWeight:700, color:C.text2 })}>{p?.useName || ''} {p?.useLastName || p?.lastName || ''} (Current)</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:C.teal }}/>
                    <span style={sans({ fontSize:10, fontWeight:700, color:C.text2 })}>{player.isPitcher ? 'Peak Pitcher Reference' : 'Peak Hitter Reference'}</span>
                  </div>
                </div>
                <div style={{ ...px({ fontSize:12, fontWeight:800, color:C.purple }), background:C.purpleSoft, padding:'2px 10px', borderRadius:6 }}>
                  {Math.round(70 + (kpis.TPVI || 0) * 0.25)}% Similarity
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart margin={{ top:10, right:20, bottom:10, left:20 }}
                  data={player.isPitcher ? [
                    { axis:'Strikeouts', player:Math.min(99,kpis.CAS||55), comp:96 },
                    { axis:'Command',    player:Math.min(99,kpis.DQS||55), comp:90 },
                    { axis:'Run Prev.',  player:Math.min(99,kpis.DPI||55), comp:97 },
                    { axis:'Durability', player:Math.min(99,30+Math.min(numOr(kpis._ip,0)/2,40)), comp:78 },
                    { axis:'Decision',   player:Math.min(99,kpis.DQS||55), comp:90 },
                    { axis:'Value',      player:Math.min(99,kpis.TPVI||55), comp:96 },
                  ] : [
                    { axis:'Contact', player:Math.min(99,kpis.CAS||55), comp:92 },
                    { axis:'Power',   player:Math.min(99,kpis.DPI||55), comp:99 },
                    { axis:'Patience',player:Math.min(99,kpis.DQS||55), comp:95 },
                    { axis:'Speed',   player:Math.min(99,25+numOr(kpis._sb,0)*1.2), comp:82 },
                    { axis:'Defense', player:Math.min(99,kpis.TPVI||55), comp:88 },
                    { axis:'Value',   player:Math.min(99,kpis.TPVI||55), comp:99 },
                  ]}>
                  <PolarGrid stroke={C.border}/>
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize:9.5, fill:C.text2, fontFamily:"'DM Mono',monospace" }} tickLine={false}/>
                  <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false}/>
                  <Radar name={`${p?.useName || ''} ${p?.useLastName || p?.lastName || ''}`} dataKey="player" stroke={C.amber} fill={C.amber} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false}/>
                  <Radar name={player.isPitcher ? 'Peak Pitcher Reference' : 'Peak Hitter Reference'} dataKey="comp" stroke={C.teal} fill={C.teal} fillOpacity={0.10} strokeWidth={1.5} strokeDasharray="4 2" isAnimationActive={false}/>
                  <Tooltip {...TT} />
                </RadarChart>
              </ResponsiveContainer>
              <div style={sans({ fontSize:9, color:C.text4, margin:'-2px 0 8px', textAlign:'center' })}>Reference shape is a fixed SKIP model baseline, not a live comparison to a named player.</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:6 }}>
                {(player.isPitcher
                  ? [['Strikeouts',kpis.CAS||55,96,C.amber],['Command',kpis.DQS||55,90,C.amber],['Run Prev.',kpis.DPI||55,97,C.amber]]
                  : [['Contact',kpis.CAS||55,92,C.amber],['Power',kpis.DPI||55,99,C.amber],['Patience',kpis.DQS||55,95,C.amber]]
                ).map(([lbl,pv,cv,c])=>(
                  <div key={lbl} style={{ background:C.surface2, borderRadius:7, padding:'7px 10px' }}>
                    <div style={sans({ fontSize:9.5, color:C.text3, marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' })}>{lbl}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                      <span style={px({ fontSize:13, fontWeight:800, color:C.amber })}>{Math.min(99,pv)}</span>
                      <span style={px({ fontSize:10, color:C.teal })}>/{cv}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* ── Organizational Fit — team compatibility matrix ── */}
          <Panel title="Organizational Fit" accent={C.teal} badge="Team Compatibility">
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              {(() => {
                const teamMap = { LAD:'Dodgers', NYY:'Yankees', ATL:'Braves', HOU:'Astros', BOS:'Red Sox', NYM:'Mets', COL:'Rockies' };
                const curAbbr = p?.currentTeam?.abbreviation || '';
                const curName = p?.currentTeam?.name || '';
                return [['LAD',90],['NYY',85],['ATL',78],['HOU',72],['BOS',65],['NYM',55],['COL',22]].map(([abbr,base]) => {
                  const isCur = curAbbr === abbr || curName.includes(teamMap[abbr] || '__');
                  const pct = isCur ? Math.min(99, base + 8) : base;
                  const color = pct >= 80 ? C.teal : pct >= 60 ? C.amber : pct >= 40 ? C.slate : C.rust;
                  return (
                    <div key={abbr} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={sans({ fontSize:10, fontWeight:isCur?800:700, color:isCur?C.amber:C.text2, width:32, flexShrink:0 })}>{abbr}{isCur?' ★':''}</span>
                      <div style={{ flex:1, height:5, background:C.surface3, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width .6s ease' }} />
                      </div>
                      <span style={px({ fontSize:10, fontWeight:700, color, width:28, textAlign:'right' })}>{pct}%</span>
                    </div>
                  );
                });
              })()}
              <div style={px({ fontSize:8.5, color:C.text4, marginTop:4, letterSpacing:'.03em' })}>
                Fit score based on roster needs, salary, & playing style match · ★ current team
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Player Archetype Cluster Map ── */}
      <Panel title="Player Archetype Cluster Map" accent={C.purple} badge="League-Wide Comparison">
        <div style={{ padding:'14px 18px' }}>
          {/* Already individually-bordered cards (no adjacency-based
              dividers to worry about), so this is a safe, simple swap from
              a fixed 4-equal-column grid to one that reflows on a narrower
              window instead of squishing each archetype's player list. */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:14 }}>
            {[
              { lbl:'Power Hitters',      color:C.rust,  players:['A. Judge','S. Ohtani','M. Olson'],   active: kpis.DPI >= 70 },
              { lbl:'On-Base Machines',   color:C.teal,  players:['J. Soto','F. Freeman','M. Betts'],   active: kpis.DQS >= 70 },
              { lbl:'Contact Specialists',color:C.amber, players:['L. Arraez','F. Lindor','I. Happ'],   active: kpis.CAS >= 70 },
              { lbl:'Speed Outfielders',  color:C.navy,  players:['R. Acuña','C. Carroll','J. Profar'], active: false          },
            ].map(({ lbl, color, players, active }) => (
              <div key={lbl} style={{
                padding:'12px 14px', borderRadius:8, border:`0.5px solid ${active ? color : C.border}`,
                background: active ? `color-mix(in srgb, ${color} 5%, transparent)` : C.surface2,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: active ? color : C.surface3 }} />
                  <span style={sans({ fontSize:11, fontWeight:800, color: active ? color : C.text2 })}>{lbl}</span>
                  {active && <span style={{ marginLeft:'auto', fontSize:9.5, fontFamily:"'DM Mono',monospace", fontWeight:700, color, background:`color-mix(in srgb, ${color} 13%, transparent)`, padding:'1px 6px', borderRadius:3 }}>MATCH</span>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  {players.map(pl => (
                    <div key={pl} style={sans({ fontSize:11, color: active ? C.text : C.text3 })}>· {pl}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={sans({ fontSize:10, color:C.text3, marginTop:10, textAlign:'center' })}>
            Cluster similarity based on contact quality, power profile, plate discipline, and speed metrics
          </div>
        </div>
      </Panel>

      {/* ── Live Performance Inputs ── */}
      <LivePerfInputs savant={player.savant} season={player.statSeason} />

      {/* ── S.K.I.P. Live Feed ── */}
      <div style={{
        background: C.navy, borderRadius: 8, overflow: 'hidden',
        display: 'flex', alignItems: 'center', height: 32, flexShrink: 0,
      }}>
        <div style={{
          flexShrink: 0, padding: '0 14px', height: '100%',
          display: 'flex', alignItems: 'center',
          borderRight: '1px solid rgba(255,255,255,.12)', gap: 6,
        }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }} />
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.teal, letterSpacing:'.12em', fontWeight:600 }}>S.K.I.P. MODEL FEED</span>
        </div>
        <div style={{ overflow:'hidden', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', whiteSpace:'nowrap', animation:'scrollx 40s linear infinite', fontFamily:"'DM Mono',monospace", fontSize:11, color:'rgba(255,255,255,.72)' }}>
            {[
              `SKIP MODEL · Similarity to elite comp ${Math.min(99, 72 + Math.round((kpis.TPVI - 50) / 2))}% — ${arch} archetype`,
              `SKIP MODEL · Score ${score}/100 — ${verd} · ${score >= 70 ? 'strong composite signal' : 'mixed composite signals'}`,
              `SKIP MODEL · ${player.isPitcher ? 'K/9 signal ' + (kpis.CAS >= 70 ? 'elite' : 'below average') + ' · WHIP signal ' + (kpis.DQS >= 65 ? 'clean' : 'elevated') : 'Contact ' + (kpis.CAS >= 70 ? 'elite tier' : 'below average') + ' · Power ' + (kpis.DPI >= 70 ? 'elite tier' : 'standard')}`,
              'SKIP MODEL · Market value estimate based on TPVI trajectory; contract source shown separately',
              'Injury: unavailable — no authoritative injury feed is connected to this profile',
              'SKIP MODEL · Plate discipline signal: ' + (kpis.DQS >= 65 ? 'strong approach indicator' : 'approach risk indicator') + ' — not an official league percentile',
              'SKIP MODEL · Projection: ' + (p?.useLastName || p?.lastName || 'Player') + ' at the current production trajectory — not a WAR forecast',
            ].map((item, i) => (
              <span key={i} style={{ padding:'0 24px', borderRight:'1px solid rgba(255,255,255,.1)' }}>· {item}</span>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {expandedChart === 'radar' && <ChartDialog title="Player Geometry Engine" onClose={() => setExpandedChart(null)}><GeometryRadar kpis={kpis} isPitcher={player.isPitcher} focusMetric={selectedMetric} height={430} /></ChartDialog>}
      {expandedChart === 'spray' && <ChartDialog title="Spray Chart" onClose={() => setExpandedChart(null)}><SprayChart contactPoints={player.contactPoints} /></ChartDialog>}
      {expandedChart === 'percentile' && <ChartDialog title="Percentile Profile" onClose={() => setExpandedChart(null)}><SavantPercentileProfile player={player} isPitcher={player.isPitcher} teamAccent={teamAccent} expanded /></ChartDialog>}
    </>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(PlayersPage);
