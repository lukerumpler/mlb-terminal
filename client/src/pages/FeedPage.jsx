/**
 * FeedPage.jsx  —  SKIP Intel Feed
 *
 * Aggregates posts from curated baseball accounts (insiders, analysts,
 * prospect writers, official sources) into one clean timeline.
 *
 * Design choices that keep it from cluttering the rest of the app:
 *   • Lives in its own lazy-loaded tab — zero impact on other pages
 *   • Accounts are grouped (Insiders | Analytics | Prospects | Official)
 *     so users can narrow to what they care about
 *   • Posts display as compact cards — handle, relative time, text only
 *   • No avatars fetched (avoids extra image requests + privacy)
 *   • Auto-refreshes every 5 min; manual refresh button for impatient users
 *   • Graceful degradation: failed accounts show a soft warning, not an error
 *   • All state is local — no global store pollution
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel, SkeletonBlock } from '../components/atoms.jsx';
import { fetchFeeds } from '../api/feed.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useLowDataMode } from '../lib/lowData.js';

// ─── Account registry ─────────────────────────────────────────────────────
// Each group is independently toggleable. Handles are case-insensitive for
// the API but we preserve the display casing here for readability.
const ACCOUNT_GROUPS = [
  {
    key:      'insiders',
    label:    'Insiders',
    icon:     '📡',
    color:    'var(--rust)',
    accounts: [
      { handle:'JonHeyman',        label:'Jon Heyman',         org:'CBS/MLB Network' },
      { handle:'Ken_Rosenthal',    label:'Ken Rosenthal',      org:'The Athletic'    },
      { handle:'Buster_ESPN',      label:'Buster Olney',       org:'ESPN'            },
      { handle:'ByRobertMurray',   label:'Robert Murray',      org:'FanSided'        },
      { handle:'Feinsand',         label:'Mark Feinsand',      org:'MLB.com'         },
    ],
  },
  {
    key:      'analytics',
    label:    'Analytics',
    icon:     '📊',
    color:    'var(--teal)',
    accounts: [
      { handle:'tangotiger',       label:'Tom Tango',          org:'Sabermetrics'    },
      { handle:'FanGraphs',        label:'FanGraphs',          org:'FanGraphs'       },
      { handle:'BaseballSavant',   label:'Baseball Savant',    org:'MLB Statcast'    },
      { handle:'darenw',           label:'Daren Willman',      org:'MLB R&D'         },
      { handle:'mikedfast',        label:'Mike Fast',          org:'Analytics'       },
    ],
  },
  {
    key:      'prospects',
    label:    'Prospects',
    icon:     '🌱',
    color:    'var(--green)',
    accounts: [
      { handle:'CraigGoldstein',   label:'Craig Goldstein',    org:'BP'              },
      { handle:'MLBPipeline',      label:'MLB Pipeline',       org:'MLB.com'         },
      { handle:'BA_Wolfe',         label:'Carlos Wolfe',       org:'Baseball America'},
      { handle:'Kiley_McDaniel',   label:'Kiley McDaniel',     org:'ESPN'            },
      { handle:'JoshLuckowich',    label:'Josh Luckowich',     org:'Prospects'       },
    ],
  },
  {
    key:      'official',
    label:    'Official',
    icon:     '⚾',
    color:    'var(--navy)',
    accounts: [
      { handle:'MLB',              label:'MLB',                org:'Official'        },
      { handle:'MLBRumors',        label:'MLB Trade Rumors',   org:'MLBTR'           },
      { handle:'BaseballAmerica',  label:'Baseball America',   org:'BA'              },
    ],
  },
];

const ALL_GROUPS = ACCOUNT_GROUPS.map(g => g.key);
// Lookup: handle → { label, org, groupKey, groupColor }
const HANDLE_META = {};
ACCOUNT_GROUPS.forEach(g =>
  g.accounts.forEach(a => {
    HANDLE_META[a.handle.toLowerCase()] = {
      label: a.label, org: a.org, groupKey: g.key,
      groupColor: g.color, groupLabel: g.label,
    };
  })
);

const REFRESH_MS = 5 * 60 * 1_000;

// ─── Helpers ──────────────────────────────────────────────────────────────
function relTime(isoDate) {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 60_000)   return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function handleInitial(handle) {
  return (handle?.[0] ?? '?').toUpperCase();
}

// ─── PostCard ─────────────────────────────────────────────────────────────
const PostCard = memo(function PostCard({ item, highlight }) {
  const meta  = HANDLE_META[item.handle.toLowerCase()] ?? {};
  const color = meta.groupColor ?? 'var(--amber)';
  return (
    <div style={{
      padding: '11px 14px',
      borderBottom: `0.5px solid ${C.borderLight}`,
      background: highlight ? `color-mix(in srgb, ${color} 6%, var(--surface))` : 'transparent',
      transition: 'background .15s',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        {/* Avatar initial */}
        <div style={{
          flexShrink: 0, width:30, height:30, borderRadius:'50%',
          background: `color-mix(in srgb, ${color} 18%, var(--surface2))`,
          border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:700, color,
        }}>
          {handleInitial(item.handle)}
        </div>
        <div style={{ minWidth:0, flex:1 }}>
          {/* Header row */}
          <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:5, flexWrap:'wrap' }}>
            <span style={sans({ fontSize:12, fontWeight:700, color:C.text })}>{meta.label ?? item.handle}</span>
            <span style={px({ fontSize:10, color:C.text3 })}>@{item.handle}</span>
            {meta.org && (
              <span style={{
                ...px({ fontSize:9, fontWeight:600, color, letterSpacing:'.04em' }),
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                padding:'1px 6px', borderRadius:3,
              }}>{meta.org}</span>
            )}
            {item.sourceTier && <StatusBadge status={`tier-${item.sourceTier}`} compact />}
            <span style={{ marginLeft:'auto', ...px({ fontSize:10, color:C.text4, whiteSpace:'nowrap' }) }}>
              {relTime(item.isoDate)}
            </span>
          </div>
          {/* Tweet text */}
          <div style={sans({ fontSize:12, color:C.text2, lineHeight:1.6, wordBreak:'break-word' })}>
            {item.text}
          </div>
          {/* Source link */}
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            style={{ ...px({ fontSize:10, color:C.text4 }), marginTop:5, display:'inline-block',
              textDecoration:'none', transition:'color .12s' }}
            onMouseEnter={e => e.currentTarget.style.color = color}
            onMouseLeave={e => e.currentTarget.style.color = C.text4}>
            View post →
          </a>
        </div>
      </div>
    </div>
  );
});

// ─── GroupPill ────────────────────────────────────────────────────────────
function NewsFeedSkeleton({ lowDataMode }) {
  const shimmerStyle = lowDataMode ? { animation:'none' } : {};
  return (
    <div
      className={`skip-feed-skeleton${lowDataMode ? ' skip-feed-skeleton-low-data' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading Intel Feed headlines"
      style={{ padding:'10px 14px' }}
    >
      <div style={sans({ fontSize:10, color:C.text3, margin:'0 0 4px' })}>Loading headlines and source status…</div>
      {Array.from({ length:5 }, (_, index) => (
        <div key={index} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 0', borderBottom:index < 4 ? `0.5px solid ${C.borderLight}` : 'none' }}>
          <SkeletonBlock width={30} height={30} radius={50} style={shimmerStyle} />
          <div style={{ minWidth:0, flex:1, display:'flex', flexDirection:'column', gap:7 }}>
            <div style={{ display:'flex', gap:7, alignItems:'center' }}>
              <SkeletonBlock width={`${24 + (index % 3) * 8}%`} height={10} style={shimmerStyle} />
              <SkeletonBlock width={54} height={9} style={shimmerStyle} />
              <div style={{ flex:1 }} />
              <SkeletonBlock width={38} height={9} style={shimmerStyle} />
            </div>
            <SkeletonBlock width={`${84 - (index % 2) * 12}%`} height={10} style={shimmerStyle} />
            <SkeletonBlock width={`${62 + (index % 3) * 9}%`} height={10} style={shimmerStyle} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupPill({ group, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600,
        fontFamily:"'Plus Jakarta Sans',sans-serif", cursor:'pointer', border:'none',
        background:  active ? `color-mix(in srgb, ${group.color} 15%, var(--surface2))` : C.surface2,
        color:       active ? group.color : C.text3,
        outline:     active ? `1px solid color-mix(in srgb, ${group.color} 40%, transparent)` : 'none',
        transition:  'all .12s',
      }}>
      {group.icon} {group.label}
    </button>
  );
}

// ─── FeedPage ─────────────────────────────────────────────────────────────
export default memo(function FeedPage() {
  const [items,       setItems]       = useState([]);
  const [errors,      setErrors]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [feedStatus,  setFeedStatus]  = useState('unavailable');
  const [sourceStatuses, setSourceStatuses] = useState([]);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [activeGroups,setActiveGroups]= useState(new Set(ALL_GROUPS));
  const lowDataMode = useLowDataMode();
  const [search,      setSearch]      = useState('');
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const latestHandlesRef = useRef(null);

  // Which handles are active based on selected groups
  const activeHandles = useMemo(() => ACCOUNT_GROUPS
    .filter(g => activeGroups.has(g.key))
    .flatMap(g => g.accounts.map(a => a.handle)),
  [activeGroups]);

  const load = useCallback(async (handles) => {
    latestHandlesRef.current = handles;
    setLoading(true);
    let result;
    try {
      result = await fetchFeeds(handles, 12);
    } catch (error) {
      if (!mountedRef.current || latestHandlesRef.current !== handles) return;
      setErrors([{ handle:'feed', source:'Intel Feed', error:error?.message || 'Feed request failed' }]);
      setFeedStatus('unavailable');
      setSourceStatuses([]);
      setLoading(false);
      return;
    }
    // Bug fix 2026-08-11: toggling groups quickly fires this effect (and
    // this call) twice in close succession with two different handle sets
    // — nothing cancels the first request, so without this check a slower
    // first response for the *old* selection can resolve after a faster
    // second response for the *new* one and silently overwrite it, leaving
    // accounts on screen that don't match the currently-checked filter
    // groups. Same race-condition class as PlayersPage.jsx's pickPlayer
    // fix, applied here via reference comparison instead of a sequence
    // number since `handles` (from the memoized activeHandles below) is
    // already a stable, comparable identity — a fresh array reference each
    // time activeGroups actually changes, unchanged between same-selection
    // calls (auto-refresh interval ticks).
    if (!mountedRef.current || latestHandlesRef.current !== handles) return;
    setItems(result.items);
    setErrors(result.errors);
    setFeedStatus(result.status || 'unavailable');
    setSourceStatuses(result.sourceStatuses || []);
    setLastFetch(new Date());
    setLoading(false);
  }, []);

  // Initial load + auto-refresh. activeHandles is now a stable, memoized
  // reference that only changes when activeGroups actually changes, so it's
  // safe to depend on directly instead of JSON.stringify-ing it each render.
  useEffect(() => {
    load(activeHandles);
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load(activeHandles);
    };
    timerRef.current = setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [activeHandles, load]);

  const toggleGroup = (key) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // always keep at least one
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter by search
  const filtered = search.trim()
    ? items.filter(it =>
        it.text.toLowerCase().includes(search.toLowerCase()) ||
        it.handle.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalAccounts = sourceStatuses.length || activeHandles.length;
  const liveCount     = sourceStatuses.length
    ? sourceStatuses.filter(source => source.ok).length
    : totalAccounts - errors.length;

  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Header strip ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        padding:'12px 16px', background:C.surface,
        border:`0.5px solid ${C.border}`, borderRadius:10,
      }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div style={sans({ fontSize:16, fontWeight:800, color:C.text, letterSpacing:'-.01em' })}>
                Intel Feed
              </div>
              <StatusBadge status={feedStatus} compact />
            </div>
          <div style={sans({ fontSize:11, color:C.text3, marginTop:2 })}>
            {loading
              ? 'Fetching posts…'
              : `${filtered.length} headlines · ${liveCount}/${totalAccounts || '—'} sources responding`
            }
            {lastFetch && !loading && (
              <span style={{ marginLeft:8, color:C.text4 }}>
                · updated {relTime(lastFetch.toISOString())}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex:1 }} />
        {/* Refresh button */}
        <button onClick={() => load(activeHandles)}
          style={{
            padding:'6px 14px', borderRadius:7, fontSize:11, fontWeight:600,
            fontFamily:"'Plus Jakarta Sans',sans-serif", cursor:'pointer',
            background:C.amberSoft, color:C.amberDark,
            border:`0.5px solid ${C.amberMid}`, transition:'all .12s',
          }}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* ── Group filters + search ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {ACCOUNT_GROUPS.map(g => (
          <GroupPill key={g.key} group={g} active={activeGroups.has(g.key)} onClick={() => toggleGroup(g.key)} />
        ))}
        <div style={{ flex:1, minWidth:180 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Filter posts"
            placeholder="Filter posts…"
            onFocus={e => e.currentTarget.style.borderColor = C.amber}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
            style={{
              width:'100%', height:32, padding:'0 12px',
              border:`1px solid ${C.border}`, borderRadius:7,
              fontSize:12, fontFamily:"'Plus Jakarta Sans',sans-serif",
              background:C.surface, color:C.text, outline:'none',
            }}
          />
        </div>
      </div>

      {/* ── Error notices (soft, non-blocking) ── */}
      {errors.length > 0 && !loading && (
        <div style={{
          padding:'8px 14px', borderRadius:8, background:C.amberSoft,
          border:`0.5px solid ${C.amberMid}`,
          ...sans({ fontSize:11, color:C.amberDark }),
        }}>
          ⚠ {errors.map(error => `${error.source || error.handle} (${error.error})`).join(' · ')} —
          SKIP is showing the next configured tier or a verified cached snapshot.
        </div>
      )}

      {/* ── Main feed ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:14, alignItems:'start' }}>

        {/* Timeline */}
        <Panel title="Timeline" accent={C.amber}
          badge={loading ? 'Loading…' : `${filtered.length} posts`}>
          {loading && items.length === 0 ? (
            <NewsFeedSkeleton lowDataMode={lowDataMode} />
          ) : filtered.length === 0 ? (
            <div style={{ padding:'32px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
              {search ? `No posts matching "${search}"` : 'No posts available right now.'}
            </div>
          ) : (
            filtered.map(item => (
              <PostCard key={`${item.handle}:${item.id}`} item={item} highlight={false} />
            ))
          )}
        </Panel>

        {/* Sidebar: accounts + stats */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Three-tier source chain */}
          <Panel title="Source Chain" accent={C.teal} badge={`${liveCount}/${totalAccounts || '—'}`}>
            {(sourceStatuses.length ? sourceStatuses : [{ tier:1, key:'pending', label:'Waiting for configured sources', ok:false, reason:'loading' }]).map(source => (
              <div key={`${source.key}:${source.tier}`} style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'8px 14px',
                borderBottom:`0.5px solid ${C.borderLight}`,
              }}>
                <StatusBadge status={`tier-${source.tier}`} compact />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={sans({ fontSize:11, fontWeight:600, color:C.text,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' })}>
                    {source.label}
                  </div>
                  <div style={px({ fontSize:9, color:C.text4 })}>
                    {source.ok === true ? 'Selected' : source.ok === false ? (source.reason || 'Unavailable') : 'Standby'}
                  </div>
                </div>
              </div>
            ))}
          </Panel>

          {/* How it works */}
          <Panel title="About" accent={C.slate}>
            <div style={{ padding:'12px 14px', ...sans({ fontSize:11, color:C.text2, lineHeight:1.65 }) }}>
              <p style={{ marginBottom:8 }}>
                Headlines are fetched through a server-side three-tier source chain. Each headline keeps its source label and article link.
              </p>
              <p style={{ marginBottom:8 }}>
                Tier 1 is official, Tier 2 is a reliable league backup, and Tier 3 is a secondary publisher. If all live sources fail, verified cached content is shown.
              </p>
              <p style={{ color:C.text3, fontSize:10, ...sans({}) }}>
                Feed updates automatically every <strong>5 minutes</strong>. Use ↻ Refresh to force an immediate update. A badge always identifies the current source state.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
});
