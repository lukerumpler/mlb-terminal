import React, { useState, useMemo, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { C, px, sans } from './constants/colors.js';
import { TEAMS } from './constants/data.js';
import { DEFAULT_ROSTER_DEFAULTS, loadRosterDefaults, saveRosterDefaults, sanitizeRosterDefaults } from './constants/rosterFilters.js';
import { getDailyInsight } from './constants/alerts.js';
import { getTodaysGames, getStandings, getSavantData, getTeamModelSources } from './api/mlb.js';
import { deriveTickerStatus, formatTickerGame, getTickerRefreshDelay } from './lib/ticker.js';
import { getCacheHealth } from './lib/cacheHealthClient.js';
import { buildOperationalAlerts, countActionableAlerts } from './lib/operationalAlerts.js';
import { Panel } from './components/atoms.jsx';
import LiveScoreTicker from './components/LiveScoreTicker.jsx';
import { readLowDataMode, setLowDataMode } from './lib/lowData.js';
import { readFeedFreshnessSettings, saveFeedFreshnessSettings, readFeedSuccesses, summarizeFeedFreshness } from './lib/feedFreshness.js';
import { readDefaultTeamPreference, saveDefaultTeamPreference } from './lib/defaultTeamPreference.js';
import RecentHistoryDropdown from './components/RecentHistoryDropdown.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { readRecentHistory, recordRecentView } from './lib/recentHistory.js';

// Lazy-loaded so each tab (and heavy deps like recharts, only used by a few
// pages) ships as its own chunk and loads on demand instead of bloating the
// initial bundle.
const OverviewPage     = lazy(() => import('./pages/OverviewPage.jsx'));
const PlayersPage      = lazy(() => import('./pages/PlayersPage.jsx'));
const ProspectsPage    = lazy(() => import('./pages/ProspectsPage.jsx'));
const KnowledgePage    = lazy(() => import('./pages/KnowledgePage.jsx'));
const AMDPage          = lazy(() => import('./pages/AMDPage.jsx'));
const DraftPage        = lazy(() => import('./pages/OtherPages.jsx').then(m => ({ default: m.DraftPage })));
const LeaguePage       = lazy(() => import('./pages/OtherPages.jsx').then(m => ({ default: m.LeaguePage })));
const IntelligencePage = lazy(() => import('./pages/OtherPages.jsx').then(m => ({ default: m.IntelligencePage })));
const SettingsPage     = lazy(() => import('./pages/OtherPages.jsx').then(m => ({ default: m.SettingsPage })));
const ScoutingNotesPage = lazy(() => import('./pages/ScoutingNotesPage.jsx'));
const FollowListPage = lazy(() => import('./pages/FollowListPage.jsx'));
const FeedPage          = lazy(() => import('./pages/FeedPage.jsx'));
const PlayerProfilePreviewsPage = lazy(() => import('./pages/PlayerProfilePreviewsPage.jsx'));

function PageLoading() {
  return (
    <div style={{ padding:'40px 14px', textAlign:'center', ...sans({ fontSize:11, color:C.text3 }) }}>
      Loading…
    </div>
  );
}

// Catches failures loading a lazy chunk (e.g. a flaky connection on a code-
// split tab) so one tab breaking shows a retry message instead of a white-
// screened app. Resets whenever the active tab changes so navigating away
// and back tries loading the chunk again.
class PageErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:'40px 14px', textAlign:'center' }}>
          <div style={sans({ fontSize:12, fontWeight:700, color:C.rust, marginBottom:6 })}>
            This tab failed to load.
          </div>
          <div style={sans({ fontSize:11, color:C.text3 })}>
            Check your connection and try switching tabs again.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { key:'overview',     icon:'⊞', label:'Overview',       section:'Overview' },
  { key:'players',      icon:'◷', label:'Players',        section:'Evaluation' },
  { key:'prospects',    icon:'↑', label:'Prospects',      section:'Evaluation' },
  { key:'draft',        icon:'◈', label:'Draft',          section:'Evaluation' },
  { key:'amd',          icon:'⊛', label:'AMD / IMD',      section:'Evaluation' },
  { key:'league',       icon:'◎', label:'League',         section:'Monitor' },
  { key:'intelligence', icon:'◆', label:'Intelligence',   section:'Monitor' },
  { key:'feed',         icon:'▤', label:'Intel Feed',     section:'Monitor' },
  { key:'follows',      icon:'⤴', label:'Follow List',    section:'Workflow' },
  { key:'notes',        icon:'✎', label:'Scouting Notes', section:'Workflow' },
  { key:'knowledge',    icon:'◉', label:'Knowledge',      section:'Knowledge' },
  { key:'settings',     icon:'⚙', label:'Settings',       section:'System' },
  { key:'alerts',       icon:'🔔', label:'Alerts',         section:'System' },
];

const WORKSPACE_GROUPS = [
  {
    key:'talent',
    icon:'↑',
    label:'Talent',
    section:'Evaluation',
    defaultTab:'players',
    tabs:[
      { key:'players', label:'Players', description:'Player profiles, evaluation, and comparison' },
      { key:'prospects', label:'Prospects', description:'Farm, ranking, and development context' },
      { key:'draft', label:'Draft Board', description:'Amateur scouting and board organization' },
    ],
  },
  {
    key:'intelligence-workspace',
    icon:'◆',
    label:'Intelligence',
    section:'Monitor',
    defaultTab:'intelligence',
    tabs:[
      { key:'intelligence', label:'Intelligence', description:'Team and market intelligence' },
      { key:'amd', label:'AMD / IMD', description:'Analytical model development' },
      { key:'knowledge', label:'Knowledge', description:'Methods, concepts, and reference material' },
    ],
  },
  {
    key:'feed-workspace',
    icon:'▤',
    label:'Intel Feed',
    section:'Monitor',
    defaultTab:'feed',
    tabs:[
      { key:'feed', label:'Intel Feed', description:'Source-aware league and team intelligence' },
      { key:'follows', label:'Follow List', description:'Tracked players and follow-up activity' },
    ],
  },
  {
    key:'settings-workspace',
    icon:'⚙',
    label:'Settings',
    section:'System',
    defaultTab:'settings',
    tabs:[
      { key:'settings', label:'Settings', description:'Appearance, data, and workspace preferences' },
      { key:'alerts', label:'Alerts', description:'Current intelligence and monitoring notices' },
    ],
  },
];

const PRIMARY_TABS = [
  { key:'overview', icon:'⊞', label:'Overview', section:'Overview' },
  WORKSPACE_GROUPS[0],
  { key:'league', icon:'◎', label:'League', section:'Monitor' },
  WORKSPACE_GROUPS[1],
  WORKSPACE_GROUPS[2],
  { key:'notes', icon:'✎', label:'Scouting Notes', section:'Workflow' },
  WORKSPACE_GROUPS[3],
];
const MOBILE_QUICK_TABS = [
  { key:'overview', icon:'⊞', label:'Overview' },
  { key:'players', icon:'↑', label:'Talent' },
  { key:'league', icon:'◎', label:'League' },
  { key:'intelligence', icon:'◆', label:'Intel' },
  { key:'notes', icon:'✎', label:'Notes' },
];
const MOBILE_SWIPE_TABS = MOBILE_QUICK_TABS.map(item => item.key);

function AlertsWorkspacePanel({ alerts, cacheHealth, cacheHealthStatus }) {
  return (
    <Panel title="Active Alerts" accent={C.rust} badge="Live operational sources">
      <div style={sans({ fontSize:10.5, color:C.text3, padding:'8px 14px 0', lineHeight:1.5 })}>
        Alerts are derived from current cache telemetry, feed-freshness settings, and workspace preferences. SKIP does not invent player news or transaction events.
      </div>
      {cacheHealthStatus === 'loading' && (
        <div style={{ padding:'10px 14px', ...sans({ fontSize:11, color:C.text3 }) }}>Reading live operational sources…</div>
      )}
      {cacheHealthStatus !== 'loading' && alerts.length === 0 && (
        <div style={{ padding:'10px 14px', ...sans({ fontSize:11, color:C.text3 }) }}>No active operational alerts right now.</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{
          padding:'10px 14px',
          borderBottom: i < alerts.length - 1 ? `0.5px solid ${C.borderLight}` : 'none',
          background: a.type === 'good' ? C.tealSoft : a.type === 'warn' ? C.amberSoft : C.surface2,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={sans({ fontSize:12, fontWeight:700, color:a.color })}>{a.title}</span>
            <span style={px({ fontSize:9, color:C.text3 })}>{a.source}</span>
          </div>
          <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.55 })}>{a.body}</div>
        </div>
      ))}
      <div style={{ padding:'7px 14px', borderTop:`0.5px solid ${C.borderLight}`, background:C.surface2, ...px({ fontSize:9, color:C.text3 }) }}>
        Cache telemetry: {cacheHealth?.day ? `UTC ${cacheHealth.day}` : 'not yet available'}
      </div>
    </Panel>
  );
}

export default function App() {
  const [tab, setTab]               = useState('overview');
  const [pendingPlayerProfile, setPendingPlayerProfile] = useState(null);
  const consumePendingPlayerProfile = useCallback(() => setPendingPlayerProfile(null), []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [compactMobile, setCompactMobile] = useState(() => window.matchMedia?.('(max-width: 720px)').matches || false);
  const mobileNavToggleRef = useRef(null);
  const mobileNavFirstItemRef = useRef(null);
  const mobileSwipeStartRef = useRef(null);
  const mobileSwipeIgnoreRef = useRef(false);
  const [liveTicker, setLiveTicker] = useState([]);
  // 'loading' | 'live' | 'scheduled' | 'final' | 'empty' | 'error' — the ticker used to seed itself
  // with hardcoded SCORES and silently keep showing them forever if the
  // fetch failed or returned nothing, next to a pulsing "LIVE" dot. Tracking
  // real status means we only ever show genuinely live data as live.
  const [tickerStatus, setTickerStatus] = useState('loading');
  const [tickerUpdatedAt, setTickerUpdatedAt] = useState(null);
  const [rosterDefaults, setRosterDefaults] = useState(() => loadRosterDefaults());
  const [defaultTeamKey, setDefaultTeamKey] = useState(() => readDefaultTeamPreference());
  const [lowDataMode, setLowDataModeState] = useState(() => readLowDataMode());
  const [feedFreshnessSettings, setFeedFreshnessSettings] = useState(() => readFeedFreshnessSettings());
  const [feedFreshnessSuccesses, setFeedFreshnessSuccesses] = useState(() => readFeedSuccesses());
  const [recentHistory, setRecentHistory] = useState(() => readRecentHistory());
  const [cacheHealth, setCacheHealth] = useState(null);
  const [cacheHealthStatus, setCacheHealthStatus] = useState('loading');
  const [cacheHealthUpdatedAt, setCacheHealthUpdatedAt] = useState(null);
  const isolatedPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'player-profile';
  const toggleLowDataMode = useCallback(() => {
    setLowDataModeState(current => setLowDataMode(!current));
  }, []);
  const updateFeedFreshnessSettings = useCallback((next) => {
    setFeedFreshnessSettings(current => saveFeedFreshnessSettings({ ...current, ...(typeof next === 'function' ? next(current) : next) }));
  }, []);
  useEffect(() => {
    const sync = () => setFeedFreshnessSuccesses(readFeedSuccesses());
    window.addEventListener('skip-feed-freshness-updated', sync);
    return () => window.removeEventListener('skip-feed-freshness-updated', sync);
  }, []);
  useEffect(() => {
    const sync = () => setRecentHistory(readRecentHistory());
    window.addEventListener('skip-recent-history-updated', sync);
    return () => window.removeEventListener('skip-recent-history-updated', sync);
  }, []);
  const updateRosterDefaults = useCallback((next) => {
    setRosterDefaults(current => {
      const value = sanitizeRosterDefaults(typeof next === 'function' ? next(current) : next);
      saveRosterDefaults(value);
      return value;
    });
  }, []);
  const updateDefaultTeamKey = useCallback((next) => {
    setDefaultTeamKey(current => saveDefaultTeamPreference(typeof next === 'function' ? next(current) : next, current));
  }, []);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('skip-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* private browsing / storage disabled */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('skip-theme', theme); } catch { /* best effort */ }
  }, [theme]);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 720px)');
    if (!query) return undefined;
    const sync = () => setCompactMobile(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);
  const dailyInsight = useMemo(() => getDailyInsight(), []);
  const feedFreshnessSummary = useMemo(() => summarizeFeedFreshness(feedFreshnessSuccesses, feedFreshnessSettings), [feedFreshnessSuccesses, feedFreshnessSettings]);
  const retryProvider = useCallback(async (provider) => {
    const team = TEAMS[defaultTeamKey] || TEAMS.sd;
    if (provider === 'mlb') {
      await Promise.all([getTodaysGames(), getStandings()]);
      return 'MLB schedule and standings refreshed.';
    }
    if (provider === 'fangraphs') {
      const response = await getTeamModelSources(team?.abbr);
      if (!response?.found) throw new Error(response?.providerBlocked ? 'FanGraphs is currently blocking the provider request.' : 'FanGraphs did not return verified team model data.');
      return 'FanGraphs team model refreshed.';
    }
    if (provider === 'savant') {
      const response = await getSavantData();
      if (!Array.isArray(response) || response.length === 0) throw new Error('Baseball Savant did not return a verified leaderboard response.');
      return 'Baseball Savant leaderboard refreshed.';
    }
    if (provider === 'ncaa') {
      const { getScoreboard } = await import('./api/ncaa.js');
      await getScoreboard();
      return 'NCAA scoreboard refreshed.';
    }
    if (provider === 'boxscore') throw new Error('Open a player profile to refresh that player’s completed-game boxscore splits.');
    if (provider === 'roster-insights') throw new Error('Open a team Roster view to refresh its context-specific roster insights.');
    throw new Error('This provider does not support an independent refresh.');
  }, [defaultTeamKey]);
  const refreshCacheHealth = useCallback(async () => {
    setCacheHealthStatus(current => current === 'ready' || current === 'error' ? 'refreshing' : 'loading');
    try {
      const next = await getCacheHealth();
      if (!next) throw new Error('Cache telemetry was empty');
      setCacheHealth(next);
      setCacheHealthUpdatedAt(Date.now());
      setCacheHealthStatus('ready');
    } catch {
      setCacheHealthStatus('error');
    }
  }, []);
  useEffect(() => {
    if (isolatedPreview) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'hidden') refreshCacheHealth();
    };
    refreshWhenVisible();
    const intervalId = window.setInterval(refreshWhenVisible, lowDataMode ? 10 * 60_000 : 5 * 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isolatedPreview, lowDataMode, refreshCacheHealth]);
  const liveAlerts = useMemo(() => buildOperationalAlerts({
    cacheHealth,
    cacheHealthStatus,
    feedFreshnessSummary,
    lowDataMode,
  }), [cacheHealth, cacheHealthStatus, feedFreshnessSummary, lowDataMode]);
  const alertCount = useMemo(() => countActionableAlerts(liveAlerts), [liveAlerts]);
  const activeWorkspace = useMemo(() => WORKSPACE_GROUPS.find(workspace => workspace.tabs.some(item => item.key === tab)) || null, [tab]);
  const activePrimaryKey = activeWorkspace?.key || tab;
  const activeTitle = activeWorkspace?.label || TABS.find(item => item.key === tab)?.label || 'SKIP';
  const navigateMobileWorkspace = useCallback((direction) => {
    if (!compactMobile || isolatedPreview) return;
    const currentIndex = MOBILE_SWIPE_TABS.indexOf(tab);
    if (currentIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(MOBILE_SWIPE_TABS.length - 1, currentIndex + direction));
    if (nextIndex !== currentIndex) setTab(MOBILE_SWIPE_TABS[nextIndex]);
  }, [compactMobile, isolatedPreview, tab]);
  const handleMobileTouchStart = useCallback((event) => {
    if (!compactMobile || isolatedPreview || event.touches.length !== 1) return;
    const target = event.target;
    const interactive = target?.closest?.('button, a, input, select, textarea, table, [role="button"], [data-no-workspace-swipe]');
    const horizontalScroller = target?.closest?.('[data-horizontal-scroll]');
    mobileSwipeIgnoreRef.current = Boolean(interactive || horizontalScroller);
    mobileSwipeStartRef.current = mobileSwipeIgnoreRef.current ? null : { x:event.touches[0].clientX, y:event.touches[0].clientY };
  }, [compactMobile, isolatedPreview]);
  const handleMobileTouchEnd = useCallback((event) => {
    const start = mobileSwipeStartRef.current;
    mobileSwipeStartRef.current = null;
    if (!start || mobileSwipeIgnoreRef.current || event.changedTouches.length !== 1) return;
    mobileSwipeIgnoreRef.current = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    navigateMobileWorkspace(dx < 0 ? 1 : -1);
  }, [navigateMobileWorkspace]);

  const [showPalette, setShowPalette] = useState(false);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const focusTimer = window.setTimeout(() => mobileNavFirstItemRef.current?.focus({ preventScroll: true }), 0);
    const onDrawerKeyDown = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('keydown', onDrawerKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onDrawerKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      window.setTimeout(() => mobileNavToggleRef.current?.focus({ preventScroll: true }), 0);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowPalette(s => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onNavigate = e => {
      const nextTab = e.detail?.tab;
      if (TABS.some(item => item.key === nextTab)) setTab(nextTab);
    };
    const onOpenPlayer = e => {
      const detail = e.detail || {};
      if (detail.id) {
        recordRecentView({ type:'player', id:detail.id, label:detail.fullName || detail.name || 'Player', secondary:detail.secondary || 'Player profile' });
        // The Players workspace is lazy-loaded. Persist the requested player
        // in App state so a name clicked from another workspace still opens
        // the profile after the Players page has mounted.
        setPendingPlayerProfile(detail);
      }
      setTab('players');
    };
    const onOpenAffiliate = e => {
      const detail = e.detail || {};
      const parentAbbr = String(detail.parentAbbr || '').toUpperCase();
      if (parentAbbr) {
        const team = Object.values(TEAMS).find(item => item.abbr === parentAbbr);
        recordRecentView({ type:'affiliate', affiliateId:detail.affiliateId, parentAbbr, levelId:detail.levelId, label:detail.label || 'Minor-league affiliate', secondary:detail.secondary || `${team?.name || parentAbbr} affiliate` });
        setTab('overview');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('skip-select-affiliate', { detail })), 0);
      }
    };
    const onOpenTeam = e => {
      const teamAbbr = String(e.detail?.abbr || '').toUpperCase();
      const team = Object.values(TEAMS).find(item => item.abbr === teamAbbr);
      if (teamAbbr) {
        recordRecentView({ type:'team', abbr:teamAbbr, label:team?.name || teamAbbr, secondary:team?.div || 'Team overview' });
        setTab('overview');
        window.dispatchEvent(new CustomEvent('skip-select-team', { detail:{ abbr:teamAbbr } }));
      } else {
        setTab('overview');
      }
    };
    window.addEventListener('skip-navigate', onNavigate);
    window.addEventListener('skip-open-player', onOpenPlayer);
    window.addEventListener('skip-open-team', onOpenTeam);
    window.addEventListener('skip-open-affiliate', onOpenAffiliate);
    return () => {
      window.removeEventListener('skip-navigate', onNavigate);
      window.removeEventListener('skip-open-player', onOpenPlayer);
      window.removeEventListener('skip-open-team', onOpenTeam);
      window.removeEventListener('skip-open-affiliate', onOpenAffiliate);
    };
  }, []);

  const refreshTicker = useCallback(async () => {
    setTickerStatus(current => ['live', 'scheduled', 'final', 'stale'].includes(current) ? 'refreshing' : 'loading');
    try {
      const games = await getTodaysGames();
      if (!games.length) {
        setLiveTicker([]);
        setTickerStatus('empty');
        return 'empty';
      }
      const ticks = games.map(formatTickerGame);
      const nextStatus = deriveTickerStatus(games);
      setLiveTicker(ticks);
      setTickerUpdatedAt(Date.now());
      setTickerStatus(nextStatus);
      return nextStatus;
    } catch {
      setTickerStatus(current => current === 'live' || current === 'refreshing' ? 'stale' : 'error');
      return 'stale';
    }
  }, []);
  useEffect(() => {
    if (isolatedPreview) return undefined;
    let disposed = false;
    let timerId = null;
    let nextRefreshAt = 0;
    const refreshAndSchedule = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      refreshTicker().then(status => {
        if (disposed || document.visibilityState === 'hidden') return;
        const delay = getTickerRefreshDelay(status, { lowDataMode });
        nextRefreshAt = Date.now() + delay;
        timerId = window.setTimeout(refreshAndSchedule, delay);
      });
    };
    const refreshWhenDue = () => {
      if (document.visibilityState !== 'hidden' || Date.now() < nextRefreshAt) return;
      if (timerId != null) window.clearTimeout(timerId);
      refreshAndSchedule();
    };
    refreshAndSchedule();
    document.addEventListener('visibilitychange', refreshWhenDue);
    return () => {
      disposed = true;
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', refreshWhenDue);
    };
  }, [isolatedPreview, lowDataMode, refreshTicker]);

  return (
    <>
    <div className="skip-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:"'Plus Jakarta Sans', sans-serif", color:C.text }}>

      {/* ── SIDEBAR ── */}
      {mobileNavOpen && <button type="button" className="skip-mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <div id="skip-mobile-nav" className={`skip-sidebar${mobileNavOpen ? ' skip-mobile-nav-open' : ''}`} data-mobile-open={mobileNavOpen ? 'true' : 'false'} style={{ width:196, flexShrink:0, background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`4px 0 18px color-mix(in srgb, ${C.navy} 4%, transparent)` }}>

        {/* Logo */}
        <div style={{ padding:'12px 12px 10px', borderBottom:`1px solid ${C.border}`, background:`linear-gradient(180deg, ${C.surface}, ${C.surface2})` }}>
          <svg className="skip-sidebar-logo" viewBox="0 0 200 78" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', maxWidth:148, height:'auto', display:'block', marginBottom:7 }}>
            <path d="M 18 28 Q 95 -8 168 18" stroke={C.text4} strokeWidth="2" fill="none" strokeLinecap="round"/>
            <circle cx="168" cy="18" r="9" fill="none" stroke={C.text3} strokeWidth="1.5"/>
            <path d="M 162 14 Q 168 18 162 22" stroke="#CC2222" strokeWidth="1" fill="none"/>
            <path d="M 174 14 Q 168 18 174 22" stroke="#CC2222" strokeWidth="1" fill="none"/>
            <text x="4" y="62" fontFamily="'Plus Jakarta Sans', Arial Black, sans-serif" fontWeight="900" fontSize="48" fill={C.text} letterSpacing="-1">S</text>
            <text x="53" y="62" fontFamily="'Plus Jakarta Sans', Arial Black, sans-serif" fontWeight="900" fontSize="48" fill={C.text} letterSpacing="-1">K</text>
            <polygon points="72,26 82,26 96,62 86,62" fill="#CC2222"/>
            <text x="102" y="62" fontFamily="'Plus Jakarta Sans', Arial Black, sans-serif" fontWeight="900" fontSize="48" fill={C.text} letterSpacing="-1">I</text>
            <text x="122" y="62" fontFamily="'Plus Jakarta Sans', Arial Black, sans-serif" fontWeight="900" fontSize="48" fill={C.text} letterSpacing="-1">P</text>
            <line x1="4" y1="67" x2="178" y2="67" stroke="#CC2222" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <button type="button" onClick={() => setShowPalette(true)} title="Search everything" aria-label="Search everything"
            style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', border:`1px solid ${C.tealMid}`, borderRadius:7, background:C.tealSoft, color:C.teal, cursor:'pointer', width:'100%', textAlign:'left' }}>
            <span aria-hidden="true" style={{ fontSize:14, lineHeight:1 }}>⌕</span>
            <span style={sans({ fontSize:10.5, fontWeight:800, flex:1 })}>Search</span>
            <span className="skip-nav-shortcut" style={px({ fontSize:8.5, color:C.teal, border:`0.5px solid ${C.tealMid}`, borderRadius:4, padding:'1px 4px' })}>⌘K</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="skip-mobile-nav-scroll" aria-label="SKIP workspace navigation" style={{ flex:1, padding:'6px 6px', display:'flex', flexDirection:'column', gap:1, overflowY:'auto' }}>
          {PRIMARY_TABS.map((t, i) => {
            const workspaceAlertCount = t.key === 'settings-workspace' ? alertCount : t.alertCount;
            return (
            <React.Fragment key={t.key}>
            {(i === 0 || PRIMARY_TABS[i - 1].section !== t.section) && (
              <div className="skip-nav-section" aria-hidden="true">{t.section}</div>
            )}
            <button ref={i === 0 ? mobileNavFirstItemRef : undefined} title={t.label} aria-label={t.key === 'settings-workspace' ? `${t.label}: ${workspaceAlertCount} active alerts` : undefined} onClick={() => { setTab(t.defaultTab || t.key); setMobileNavOpen(false); }} aria-current={activePrimaryKey===t.key ? 'page' : undefined}
              style={{ width:'100%', padding:'7px 8px', display:'flex', alignItems:'center', gap:7, background:activePrimaryKey===t.key?C.amberSoft:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:activePrimaryKey===t.key?C.amberDark:C.text2, transition:'all .12s', textAlign:'left' }}>
              <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>{t.icon}</span>
              <span className="skip-nav-label" style={sans({ fontSize:11.5, fontWeight:600, letterSpacing:'.01em' })}>{t.label}</span>
              {t.key === 'settings-workspace' && (
                <span className="skip-settings-alert-indicator" style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:3, minHeight:19, padding:'1px 5px', borderRadius:999, background:C.rustSoft, color:C.rust, border:`1px solid ${C.rustMid}`, ...px({ fontSize:9, fontWeight:800 }) }}>
                  <span role="img" aria-label={`${workspaceAlertCount} active alerts`} style={{ fontSize:10, lineHeight:1 }}>🔔</span>
                  {workspaceAlertCount > 0 && <span aria-hidden="true">{workspaceAlertCount}</span>}
                </span>
              )}
              {activePrimaryKey === t.key && <div style={{ marginLeft:t.key === 'settings-workspace' ? 4 : 'auto', width:3, height:14, borderRadius:1.5, background:C.amber }} />}
            </button>
            </React.Fragment>
            );
          })}

        </nav>

        <div className="skip-sidebar-insight" style={{ padding:'8px 10px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ marginBottom:5, fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700, color:C.amber, letterSpacing:'.08em' }}>SKIP INSIGHT</div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:10, color:C.text2, lineHeight:1.5, fontStyle:'italic' }}>
            &ldquo;{dailyInsight}&rdquo;
          </div>
        </div>
      </div>

      {/* ── WORKSPACE ── */}
      <div className="skip-workspace" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

        {/* Top bar */}
        <div className="skip-topbar" style={{ height:46, flexShrink:0, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 18px', gap:12, boxShadow:`0 2px 12px color-mix(in srgb, ${C.navy} 4%, transparent)` }}>
          <button type="button" ref={mobileNavToggleRef} className="skip-mobile-nav-toggle" aria-controls="skip-mobile-nav" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(open => !open)} style={{ display:'none', alignItems:'center', justifyContent:'center', width:34, height:34, border:`1px solid ${C.border}`, borderRadius:8, background:C.surface2, color:C.text, cursor:'pointer', fontSize:18, lineHeight:1 }}>☰</button>
          <div style={sans({ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-.01em' })}>
            {activeTitle}
          </div>
          <div style={{ flex:1 }} />
          <RecentHistoryDropdown items={recentHistory} onClear={() => setRecentHistory(readRecentHistory())} />
          {feedFreshnessSettings.enabled && (
            <button type="button" className="skip-freshness-indicator" onClick={() => setTab('settings')} aria-label="Open data freshness settings" title="Open data freshness settings"
              style={{ display:'inline-flex', alignItems:'center', gap:5, minHeight:26, padding:'4px 8px', border:`1px solid ${feedFreshnessSummary.successful ? C.tealMid : C.border}`, borderRadius:999, background:feedFreshnessSummary.successful ? C.tealSoft : C.surface3, color:feedFreshnessSummary.successful ? C.teal : C.text3, cursor:'pointer', ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>
              <span aria-hidden="true" style={{ width:6, height:6, borderRadius:'50%', background:feedFreshnessSummary.successful ? C.teal : C.text4 }} />
              <span className="skip-freshness-label">DATA {feedFreshnessSummary.successful}/{feedFreshnessSummary.total} · {feedFreshnessSummary.successful ? feedFreshnessSummary.display : 'PENDING'}</span>
            </button>
          )}
          {lowDataMode && (
            <button type="button" className="skip-low-data-indicator" onClick={() => setTab('settings')} aria-label="Low Data Mode is active. Open Settings to change it." title="Low Data Mode is active — open Settings to change it"
              style={{ display:'inline-flex', alignItems:'center', gap:5, minHeight:26, padding:'4px 8px', border:`1px solid ${C.amberMid}`, borderRadius:999, background:C.amberSoft, color:C.amberDark, cursor:'pointer', ...px({ fontSize:9, fontWeight:800, letterSpacing:'.05em' }) }}>
              <span aria-hidden="true" style={{ width:6, height:6, borderRadius:'50%', background:C.amber, boxShadow:`0 0 0 2px ${C.amberSoft}` }} />
              <span className="skip-low-data-label">LOW DATA</span>
            </button>
          )}
          <div style={sans({ fontSize:11, color:C.text3, letterSpacing:'.02em' })}>Scouting Knowledge & Intelligence Platform</div>
          <div style={{ height:7, width:7, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }} />
        </div>

        <nav className="skip-mobile-workspace-switcher" aria-label="Quick workspace switcher" aria-hidden={!compactMobile}>
          {PRIMARY_TABS.map(workspace => {
            const selected = activePrimaryKey === workspace.key;
            const quickAlertCount = workspace.key === 'settings-workspace' ? alertCount : 0;
            return (
              <button key={workspace.key} type="button" tabIndex={compactMobile ? undefined : -1} aria-current={selected ? 'page' : undefined} onClick={() => { setTab(workspace.defaultTab || workspace.key); setMobileNavOpen(false); }}>
                <span aria-hidden="true">{workspace.icon}</span>
                <span>{workspace.label}</span>
                {workspace.key === 'settings-workspace' && quickAlertCount > 0 && <strong aria-label={`${quickAlertCount} active alerts`}>{quickAlertCount}</strong>}
              </button>
            );
          })}
        </nav>

        {/* Scrollable content */}
        <div className="skip-content" onTouchStart={handleMobileTouchStart} onTouchEnd={handleMobileTouchEnd} style={{ flex:1, overflowY:'auto', padding:'16px 18px 24px', display:'flex', flexDirection:'column', gap:0, minHeight:0 }}>

          {!isolatedPreview && activeWorkspace && (
            <nav className="skip-workspace-subtabs" aria-label={`${activeWorkspace.label} workspace sections`} role="tablist">
              <div className="skip-workspace-subtabs-copy">
                <span>{activeWorkspace.label} workspace</span>
                <strong>{activeWorkspace.tabs.find(item => item.key === tab)?.description}</strong>
              </div>
              <div className="skip-workspace-subtabs-controls">
                {activeWorkspace.tabs.map(item => (
                  <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} aria-controls={`skip-workspace-panel-${item.key}`} onClick={() => setTab(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <div id={`skip-workspace-panel-${tab}`} role={!isolatedPreview && activeWorkspace ? 'tabpanel' : undefined} aria-label={!isolatedPreview && activeWorkspace ? `${activeWorkspace.label}: ${activeWorkspace.tabs.find(item => item.key === tab)?.label}` : undefined}>
            <PageErrorBoundary resetKey={isolatedPreview ? 'player-profile-preview' : tab}>
              <Suspense fallback={<PageLoading />}>
              {isolatedPreview && <PlayerProfilePreviewsPage />}
              {!isolatedPreview && <>
              {tab === 'overview'     && <OverviewPage rosterDefaults={rosterDefaults} defaultTeamKey={defaultTeamKey} />}
              {tab === 'players'      && <PlayersPage initialPlayer={pendingPlayerProfile} onInitialPlayerConsumed={consumePendingPlayerProfile} />}
              {tab === 'prospects'    && <ProspectsPage />}
              {tab === 'draft'        && <DraftPage />}
              {tab === 'league'       && <LeaguePage />}
              {tab === 'intelligence' && <IntelligencePage />}
              {tab === 'amd'          && <AMDPage />}
              {tab === 'knowledge'    && <KnowledgePage />}
              {tab === 'notes'        && <ScoutingNotesPage />}
              {tab === 'feed'         && <FeedPage />}
              {tab === 'follows'      && <FollowListPage />}
              {tab === 'settings'     && <SettingsPage theme={theme} toggleTheme={toggleTheme} lowDataMode={lowDataMode} toggleLowDataMode={toggleLowDataMode} defaultTeamKey={defaultTeamKey} updateDefaultTeamKey={updateDefaultTeamKey} rosterDefaults={rosterDefaults} updateRosterDefaults={updateRosterDefaults} feedFreshnessSettings={feedFreshnessSettings} feedFreshnessSuccesses={feedFreshnessSuccesses} updateFeedFreshnessSettings={updateFeedFreshnessSettings} cacheHealth={cacheHealth} cacheHealthStatus={cacheHealthStatus} cacheHealthUpdatedAt={cacheHealthUpdatedAt} refreshCacheHealth={refreshCacheHealth} retryProvider={retryProvider} />}
              {tab === 'alerts'       && <AlertsWorkspacePanel alerts={liveAlerts} cacheHealth={cacheHealth} cacheHealthStatus={cacheHealthStatus} />}
              </>}
              </Suspense>
            </PageErrorBoundary>
          </div>
                </div>
        {!isolatedPreview && compactMobile && (
          <nav className="skip-mobile-bottom-nav" aria-label="Mobile quick workspace navigation">
            {MOBILE_QUICK_TABS.map(item => {
              const selected = tab === item.key || (item.key === 'players' && ['players', 'prospects', 'draft'].includes(tab)) || (item.key === 'intelligence' && ['intelligence', 'amd', 'knowledge'].includes(tab));
              return (
                <button key={item.key} type="button" aria-current={selected ? 'page' : undefined} onClick={() => { setTab(item.key); setMobileNavOpen(false); }}>
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
        {!isolatedPreview && <LiveScoreTicker status={tickerStatus} ticks={liveTicker} source="MLB Stats API" updatedAt={tickerUpdatedAt} onRetry={refreshTicker} />}

      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; overflow: hidden; }

        /* Shared interaction language: quick enough for dense analysis work,
           but with enough lift to make controls feel responsive. */
        button, select, input, textarea, [role="button"], a {
          transition: transform .16s cubic-bezier(.23,1,.32,1),
            filter .16s ease, background-color .16s ease, border-color .16s ease,
            box-shadow .16s ease, color .16s ease, opacity .16s ease;
        }
        button:hover, [role="button"]:hover, a:hover { filter: brightness(.98); }
        button:active, [role="button"]:active { transform: scale(.98); }
        select:hover, input:hover, textarea:hover { border-color:${C.amber} !important; }
        button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible {
          outline:2px solid ${C.amber}; outline-offset:2px;
        }
        .skip-nav-section { padding:8px 8px 3px; color:${C.text4}; font:700 9px/1.2 'DM Mono', monospace; letter-spacing:.14em; text-transform:uppercase; }
        .skip-sidebar button:hover { transform: translateX(2px); }
        .skip-sidebar button[aria-current="page"]:hover { transform: translateX(1px); }
        .skip-topbar { transition: box-shadow .2s ease, background-color .2s ease; }
        .skip-panel { transition: border-color .2s ease; }
        .skip-stat-strip { transition: border-color .2s ease; }
        /* Data cards stay visually stable; only controls and table rows respond to hover. */
        .skip-panel:hover, .skip-stat-strip:hover { transform:none !important; box-shadow:none !important; }
        tbody tr:hover { background: color-mix(in srgb, ${C.amber} 9%, transparent) !important; }
        /* Tables use their own density system; dashboard cards keep their existing breathing room. */
        .skip-content table th, .skip-content table td { padding-top:5px !important; padding-bottom:5px !important; }
        .skip-long-table { max-height:min(68vh, 760px); overflow:auto; }
        .skip-long-table table thead th { position:sticky; top:0; z-index:5; background:${C.surface2}; box-shadow:0 1px 0 ${C.border}; }
        .skip-long-table table thead .skip-table-group-row th { top:0; z-index:6; padding:5px 8px !important; background:${C.surface3}; color:${C.text3}; font:700 9px/1.2 'DM Mono', monospace; letter-spacing:.08em; text-transform:uppercase; text-align:left; border-bottom:1px solid ${C.border}; }
        .skip-long-table table thead .skip-table-group-row + tr th { top:25px; }
        .skip-long-table table tbody tr:focus-visible { outline:2px solid ${C.amber}; outline-offset:-2px; }
        @media (max-width:720px) {
          .skip-content table th, .skip-content table td { padding-top:6px !important; padding-bottom:6px !important; }
          .skip-long-table { max-height:62vh; }
          .skip-long-table table thead .skip-table-group-row th { padding:5px 6px !important; font-size:8px; }
          .skip-long-table table thead .skip-table-group-row + tr th { top:24px; }
        }

        @keyframes scrollx { from { transform:translateX(0) } to { transform:translateX(-50%) } }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        /* Scrollbar theming, base :focus-visible ring, and text-selection
           color are defined globally in index.html so they're consistent
           before this component even mounts. This block only adds the
           button hover treatment and the input focus halo, which are
           specific enough to this app's look that they don't belong in
           the generic page-level stylesheet. */
        input:focus, textarea:focus  { outline:none; border-color:${C.amber} !important; box-shadow:0 0 0 3px ${C.amberSoft}; }

        tr { transition:background .16s ease; }
        .page-enter { animation: fadeUp .22s cubic-bezier(.23,1,.32,1); }
        .skip-content > * { animation: fadeUp .24s cubic-bezier(.23,1,.32,1) both; }
        .skip-content > *:nth-child(2) { animation-delay: .03s; }
        .skip-content > *:nth-child(3) { animation-delay: .06s; }
        .skip-workspace-subtabs { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:12px; padding:9px 10px; border:1px solid ${C.border}; border-radius:9px; background:${C.surface}; box-shadow:0 4px 12px color-mix(in srgb, ${C.navy} 3%, transparent); }
        .skip-workspace-subtabs-copy { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .skip-workspace-subtabs-copy span { font:700 9px/1 'DM Mono',monospace; color:${C.teal}; letter-spacing:.08em; text-transform:uppercase; }
        .skip-workspace-subtabs-copy strong { font:600 11px/1.3 'Plus Jakarta Sans',sans-serif; color:${C.text2}; }
        .skip-workspace-subtabs-controls { display:flex; align-items:center; gap:5px; flex-shrink:0; }
        .skip-workspace-subtabs-controls button { min-height:30px; padding:5px 9px; border:1px solid ${C.border}; border-radius:6px; background:${C.surface2}; color:${C.text3}; cursor:pointer; font:800 9px/1 'DM Mono',monospace; letter-spacing:.04em; text-transform:uppercase; }
        .skip-workspace-subtabs-controls button[aria-selected="true"] { border-color:${C.tealMid}; background:${C.tealSoft}; color:${C.teal}; }

        @media (prefers-reduced-motion: reduce) {
          .page-enter, .skip-content > * { animation: none !important; }
          *, *::before, *::after { transition-duration: .001ms !important; scroll-behavior: auto !important; }
          *[style*="animation"] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
        }
        @media (max-width:720px) {
          .skip-mobile-workspace-switcher { display:flex; align-items:center; gap:6px; min-height:43px; padding:6px 10px; overflow-x:auto; overscroll-behavior-x:contain; border-bottom:1px solid ${C.border}; background:${C.surface}; scrollbar-width:none; }
          .skip-mobile-workspace-switcher::-webkit-scrollbar { display:none; }
          .skip-mobile-workspace-switcher button { flex:0 0 auto; display:inline-flex; align-items:center; gap:4px; min-height:30px; padding:5px 8px; border:1px solid ${C.border}; border-radius:999px; background:${C.surface2}; color:${C.text3}; cursor:pointer; font:800 9px/1 'DM Mono',monospace; letter-spacing:.03em; white-space:nowrap; }
          .skip-mobile-workspace-switcher button[aria-current="page"] { border-color:${C.tealMid}; background:${C.tealSoft}; color:${C.teal}; }
          .skip-mobile-workspace-switcher button strong { display:inline-grid; place-items:center; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:${C.rustSoft}; color:${C.rust}; font:800 8px/1 'DM Mono',monospace; }
          .skip-workspace-subtabs { align-items:stretch; flex-direction:column; gap:9px; padding:9px; }
          .skip-workspace-subtabs-controls { width:100%; overflow-x:auto; padding-bottom:1px; }
          .skip-workspace-subtabs-controls button { flex:0 0 auto; min-height:32px; }
        }
        @media (min-width:721px) {
          .skip-mobile-workspace-switcher { display:none; }
        }
      `}</style>
    </div>

    {showPalette && (
      <Suspense fallback={null}>
        <CommandPalette
          onNavigate={key => setTab(key)}
          onOpenProspect={mlbId => {
            setTab('prospects');
            // ProspectsPage isn't mounted yet on the first render after
            // switching tabs, so it listens for this event itself (same
            // pattern as the watchlist's cross-component sync) rather than
            // this needing a ref into a component that may not exist yet.
            window.dispatchEvent(new CustomEvent('skip-open-prospect-card', { detail: { mlbId } }));
          }}
          onClose={() => setShowPalette(false)}
        />
      </Suspense>
    )}
    </>
  );
}
