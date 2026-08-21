import React, { useEffect, useState } from 'react';
import { C, px, sans } from '../../constants/colors.js';
import { Panel } from '../../components/atoms.jsx';
import { useLowDataMode } from '../../lib/lowData.js';
import {
  buildPlayerHighlightSearches, buildPlayerVideoLinks, loadPlayerPlaylists,
  normalizeEmbeddableVideoUrl, savePlayerPlaylists, shouldLoadPlayerVideoThumbnail,
} from './media.js';

export function PlayerVideoThumbnail({ item, playerName, accent }) {
  const [imageError, setImageError] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const lowDataMode = useLowDataMode();
  useEffect(() => { setImageError(false); }, [item.thumbnail]);
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) setSaveData(true);
  }, []);
  const initials = playerName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'MLB';
  const canLoadThumbnail = !lowDataMode && shouldLoadPlayerVideoThumbnail({ saveData, thumbnail:item.thumbnail });
  const tooltipId = `video-tooltip-${item.id}`;
  return (
    <div className="skip-video-thumbnail-wrap" style={{ position:'relative', minWidth:0 }}>
      <a href={item.href} target="_blank" rel="noreferrer noopener" aria-label={`${item.label} for ${playerName}`} aria-describedby={tooltipId} title={item.description} className="skip-video-thumbnail" style={{ display:'block', position:'relative', minWidth:0, borderRadius:8, overflow:'hidden', border:`0.5px solid ${C.border}`, background:C.surface2, textDecoration:'none' }}>
        <div style={{ position:'relative', aspectRatio:'16 / 9', overflow:'hidden', background:`linear-gradient(135deg, ${C.surface3}, ${C.surface2})` }}>
          {canLoadThumbnail && !imageError ? <img src={item.thumbnail} alt="" loading="lazy" decoding="async" fetchPriority="low" width="640" height="360" onError={() => setImageError(true)} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 20%', display:'block', filter:'saturate(.8)' }} /> : <div aria-hidden="true" style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', ...px({ fontSize:26, fontWeight:800, color:accent }) }}>{initials}</div>}
          <div aria-hidden="true" style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(15,23,42,.05), rgba(15,23,42,.72))' }} />
          <div aria-hidden="true" style={{ position:'absolute', left:10, bottom:9, width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,.92)', color:accent, fontSize:14, paddingLeft:2, boxShadow:'0 2px 8px rgba(0,0,0,.18)' }}>▶</div>
          <span style={{ position:'absolute', right:8, top:7, padding:'3px 6px', borderRadius:4, background:'rgba(15,23,42,.72)', ...px({ fontSize:8.5, fontWeight:800, color:'#fff', letterSpacing:'.05em', textTransform:'uppercase' }) }}>{item.source}</span>
        </div>
        <div style={{ padding:'8px 9px 9px' }}><div style={sans({ fontSize:10.5, fontWeight:800, color:C.text, lineHeight:1.25 })}>{item.label}</div><div style={sans({ fontSize:8.5, color:C.text4, marginTop:3, lineHeight:1.35 })}>Opens live search results · source-safe</div></div>
      </a>
      <div id={tooltipId} role="tooltip" className="skip-video-tooltip">{item.description}</div>
    </div>
  );
}

export function PlayerMediaPanel({ player, profile, accent }) {
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
        {selectedClip ? <div style={{ marginBottom:10, border:`0.5px solid ${C.border}`, borderRadius:7, overflow:'hidden', background:'#0f172a' }}><iframe title={selectedClip.title} src={selectedClip.embedUrl} style={{ display:'block', width:'100%', aspectRatio:'16 / 9', border:0 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /><div style={{ padding:'7px 9px', ...sans({ fontSize:10, fontWeight:700, color:'#fff' }) }}>{selectedClip.title}</div></div> : <div style={{ padding:'10px', marginBottom:10, border:`0.5px dashed ${C.border}`, borderRadius:7, background:C.surface2, ...sans({ fontSize:9.5, color:C.text3, lineHeight:1.45 }) }}>Paste a verified YouTube clip URL below to watch it here and save it to a playlist.</div>}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 130px auto', gap:5, alignItems:'center' }}><input aria-label="Verified YouTube clip URL" value={clipUrl} onChange={e=>setClipUrl(e.target.value)} placeholder="Paste YouTube URL" style={{ minWidth:0, padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} /><input aria-label="Clip title" value={clipTitle} onChange={e=>setClipTitle(e.target.value)} placeholder="Clip title" style={{ minWidth:0, padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} /><button onClick={addClip} style={{ padding:'7px 9px', border:0, borderRadius:5, background:accent, color:'#fff', cursor:'pointer', fontSize:10, fontWeight:800 }}>Save clip</button></div>
        {clipError && <div role="alert" style={sans({ fontSize:9.5, color:C.rust, marginTop:5 })}>{clipError}</div>}
        <div style={{ display:'flex', gap:5, alignItems:'center', marginTop:10, flexWrap:'wrap' }}><select aria-label="Active playlist" value={activePlaylist?.id || ''} onChange={e=>setActivePlaylistId(e.target.value)} style={{ padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }}>{playlists.map(list => <option key={list.id} value={list.id}>{list.name} ({list.clips.length})</option>)}</select><input aria-label="New playlist name" value={newPlaylistName} onChange={e=>setNewPlaylistName(e.target.value)} placeholder="New playlist" style={{ width:120, padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface, color:C.text, fontSize:10 }} /><button onClick={createPlaylist} style={{ padding:'6px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.text2, cursor:'pointer', fontSize:10, fontWeight:700 }}>Create</button></div>
        {activePlaylist?.clips.length ? <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:8 }}>{activePlaylist.clips.map((clip, index) => <div key={clip.id} style={{ display:'flex', gap:6, alignItems:'center', padding:'6px 8px', border:`0.5px solid ${C.borderLight}`, borderRadius:5 }}><button onClick={()=>setSelectedClip(clip)} style={{ flex:1, border:0, background:'transparent', color:C.text, textAlign:'left', cursor:'pointer', fontSize:10, fontWeight:700 }}>{clip.title}</button><button aria-label={`Move ${clip.title} up`} disabled={index === 0} onClick={()=>moveClip(clip.id, -1)} style={{ border:0, background:'transparent', color:index === 0 ? C.text4 : C.text2, cursor:index === 0 ? 'not-allowed' : 'pointer', fontSize:11 }}>↑</button><button aria-label={`Move ${clip.title} down`} disabled={index === activePlaylist.clips.length - 1} onClick={()=>moveClip(clip.id, 1)} style={{ border:0, background:'transparent', color:index === activePlaylist.clips.length - 1 ? C.text4 : C.text2, cursor:index === activePlaylist.clips.length - 1 ? 'not-allowed' : 'pointer', fontSize:11 }}>↓</button><button aria-label={`Remove ${clip.title}`} onClick={()=>removeClip(clip.id)} style={{ border:0, background:'transparent', color:C.rust, cursor:'pointer', fontSize:12 }}>×</button></div>)}</div> : <div style={sans({ fontSize:9.5, color:C.text4, marginTop:8 })}>No saved clips in this playlist yet.</div>}
        {items.length ? <div style={{ marginTop:10, paddingTop:10, borderTop:`0.5px solid ${C.borderLight}` }}><div style={sans({ fontSize:9.5, fontWeight:800, color:C.text2, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 })}>Highlight search shortcuts</div><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:5 }}>{highlightSearches.map(item => <a key={item.id} href={item.href} target="_blank" rel="noreferrer noopener" aria-label={`Search ${item.label} for ${playerName}`} style={{ display:'block', padding:'7px 8px', border:`0.5px solid ${C.border}`, borderRadius:6, background:C.surface2, color:C.text2, textDecoration:'none' }}><span style={px({ fontSize:9, fontWeight:800, color:accent, marginRight:5 })}>↗</span><span style={sans({ fontSize:9.5, fontWeight:700 })}>{item.label}</span></a>)}</div></div> : null}
        <div style={{ marginTop:8, ...sans({ fontSize:8.5, color:C.text4, lineHeight:1.4 }) }}>Only verified YouTube URLs are embedded. Search shortcuts open source results; SKIP does not invent clip records.</div>
      </div>
    </Panel>
  );
}
