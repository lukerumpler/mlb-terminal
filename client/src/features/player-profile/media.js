// Source-safe player video discovery and local playlist persistence. Search
// destinations are intentionally used instead of fabricated clip records.
const DEFAULT_PLAYLIST = { id:'my-highlights', name:'My Highlights', clips:[] };

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
      description: `Official MLB video search for ${name}: highlights, interviews, and team coverage when available.`,
    },
    {
      id: 'youtube',
      source: 'YouTube',
      label: 'YouTube Search',
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`,
      thumbnail,
      query: youtubeQuery,
      description: `YouTube search for ${name}: highlights, interviews, analysis, and related baseball coverage.`,
    },
  ];
}

export function shouldLoadPlayerVideoThumbnail({ saveData = false, thumbnail } = {}) {
  return !saveData && Boolean(thumbnail);
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
  if (!playerId || typeof localStorage === 'undefined') return [DEFAULT_PLAYLIST];
  try {
    const parsed = JSON.parse(localStorage.getItem(`skip-player-playlists:${playerId}`) || 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : [DEFAULT_PLAYLIST];
  } catch { return [DEFAULT_PLAYLIST]; }
}

export function savePlayerPlaylists(playerId, playlists) {
  if (!playerId || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(`skip-player-playlists:${playerId}`, JSON.stringify(playlists)); } catch { /* best effort */ }
}
