import React, { useState, useMemo, useEffect, useCallback, Suspense, lazy } from 'react';
import { C, px, sans } from './constants/colors.js';
import { TEAMS } from './constants/data.js';
import { DEFAULT_ROSTER_DEFAULTS, loadRosterDefaults, saveRosterDefaults, sanitizeRosterDefaults } from './constants/rosterFilters.js';
import { ALERTS, getDailyInsight } from './constants/alerts.js';
import { getTodaysGames } from './api/mlb.js';
import { Panel } from './components/atoms.jsx';
import { readLowDataMode, setLowDataMode } from './lib/lowData.js';
import { readFeedFreshnessSettings, saveFeedFreshnessSettings, readFeedSuccesses, summarizeFeedFreshness } from './lib/feedFreshness.js';
import RecentHistoryDropdown from './components/RecentHistoryDropdown.jsx';
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
const CommandPalette    = lazy(() => import('./components/CommandPalette.jsx'));

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
];

export default function App() {
  const [tab, setTab]               = useState('overview');
  const [showAlerts, setShowAlerts] = useState(false);
  const [liveTicker, setLiveTicker] = useState([]);
  // 'loading' | 'live' | 'empty' | 'error' — the ticker used to seed itself
  // with hardcoded SCORES and silently keep showing them forever if the
  // fetch failed or returned nothing, next to a pulsing "LIVE" dot. Tracking
  // real status means we only ever show genuinely live data as live.
  const [tickerStatus, setTickerStatus] = useState('loading');
  const [rosterDefaults, setRosterDefaults] = useState(() => loadRosterDefaults());
  const [lowDataMode, setLowDataModeState] = useState(() => readLowDataMode());
  const [feedFreshnessSettings, setFeedFreshnessSettings] = useState(() => readFeedFreshnessSettings());
  const [feedFreshnessSuccesses, setFeedFreshnessSuccesses] = useState(() => readFeedSuccesses());
  const [recentHistory, setRecentHistory] = useState(() => readRecentHistory());
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
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);
  const dailyInsight = useMemo(() => getDailyInsight(), []);
  const feedFreshnessSummary = useMemo(() => summarizeFeedFreshness(feedFreshnessSuccesses, feedFreshnessSettings), [feedFreshnessSuccesses, feedFreshnessSettings]);

  const [showPalette, setShowPalette] = useState(false);
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
      if (detail.id) recordRecentView({ type:'player', id:detail.id, label:detail.fullName || detail.name || 'Player', secondary:detail.secondary || 'Player profile' });
      setTab('players');
    };
    const onOpenAffiliate = e => {
      const detail = e.detail || {};
      const parentAbbr = String(detail.parentAbbr || '').toUpperCase();
      if (parentAbbr) {
        const team = Object.values(TEAMS).find(item => item.abbr === parentAbbr);
        recordRecentView({ type:'affiliate', affiliateId:detail.affiliateId, parentAbbr, levelId:detail.levelId, label:detail.label || 'Minor-league affiliate', secondary:detail.secondary || `${team?.name || parentAbbr} affiliate` });
        setTab('overview');
        window.dispatchEvent(new CustomEvent('skip-select-affiliate', { detail }));
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
    window.addEventListener('skip-select-affiliate', onOpenAffiliate);
    return () => {
      window.removeEventListener('skip-navigate', onNavigate);
      window.removeEventListener('skip-open-player', onOpenPlayer);
      window.removeEventListener('skip-open-team', onOpenTeam);
      window.removeEventListener('skip-select-affiliate', onOpenAffiliate);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      getTodaysGames().then(games => {
        if (!alive) return;
        if (!games.length) {
          // Genuinely no games right now (off day, etc.) vs. a fetch that
          // hasn't resolved yet — and if we already have live ticks on
          // screen from an earlier successful poll, a later empty response
          // shouldn't blank them out and flip back to a "no games" message.
          setTickerStatus(prev => (prev === 'live' ? prev : 'empty'));
          return;
        }
        const ticks = games.map(g => {
          const sc = g.away.runs != null
            ? `${g.away.abbr} ${g.away.runs}, ${g.home.abbr} ${g.home.runs}`
            : `${g.away.abbr} vs ${g.home.abbr}`;
          const status = g.status === 'Final' ? '(F)' : g.inning
            ? `(${g.inningHalf === 'top' ? '▲' : '▼'}${g.inning})` : '(Pre)';
          return `${sc} ${status}`;
        });
        setLiveTicker(ticks);
        setTickerStatus('live');
      }).catch(() => { if (alive) setTickerStatus(prev => (prev === 'live' ? prev : 'error')); });
    };
    refresh();
    // Cheap to poll — mlb() de-dupes/caches, so this just picks up whatever
    // OverviewPage/LeaguePage already fetched instead of always hitting the
    // network itself. Keeps the "LIVE" badge honest instead of freezing
    // after the very first mount.
    const id = setInterval(refresh, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <>
    <div className="skip-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:"'Plus Jakarta Sans', sans-serif", color:C.text }}>

      {/* ── SIDEBAR ── */}
      <div className="skip-sidebar" style={{ width:196, flexShrink:0, background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`4px 0 18px color-mix(in srgb, ${C.navy} 4%, transparent)` }}>

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
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:20, background:C.amberSoft, border:`0.5px solid ${C.amberMid}`, width:'fit-content' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }} />
            <span style={px({ fontSize:10, color:C.teal, letterSpacing:'.06em', fontWeight:600 })}>LIVE · 2026</span>
          </div>
        </div>

        {/* Nav */}
        <nav aria-label="SKIP workspace navigation" style={{ flex:1, padding:'6px 6px', display:'flex', flexDirection:'column', gap:1, overflowY:'auto' }}>
          {TABS.map((t, i) => (
            <React.Fragment key={t.key}>
            {(i === 0 || TABS[i - 1].section !== t.section) && (
              <div className="skip-nav-section" aria-hidden="true">{t.section}</div>
            )}
            <button title={t.label} onClick={() => setTab(t.key)} aria-current={tab===t.key ? 'page' : undefined}
              style={{ width:'100%', padding:'7px 8px', display:'flex', alignItems:'center', gap:7, background:tab===t.key?C.amberSoft:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:tab===t.key?C.amberDark:C.text2, transition:'all .12s', textAlign:'left' }}>
              <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>{t.icon}</span>
              <span className="skip-nav-label" style={sans({ fontSize:11.5, fontWeight:600, letterSpacing:'.01em' })}>{t.label}</span>
              {tab === t.key && <div style={{ marginLeft:'auto', width:3, height:14, borderRadius:1.5, background:C.amber }} />}
            </button>
            </React.Fragment>
          ))}

          <button onClick={() => setShowPalette(true)} title="Search everything"
            style={{ width:'100%', padding:'7px 8px', display:'flex', alignItems:'center', gap:7, background:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>⌕</span>
            <span className="skip-nav-label" style={sans({ fontSize:12, fontWeight:600, flex:1 })}>Search</span>
            <span className="skip-nav-shortcut" style={px({ fontSize:9.5, color:C.text4, border:`0.5px solid ${C.border}`, borderRadius:4, padding:'1px 5px' })}>⌘K</span>
          </button>

          <div style={{ height:1, background:C.border, margin:'6px 2px' }} />

          <button onClick={() => setShowAlerts(s => !s)} title="View alerts" aria-expanded={showAlerts}
            style={{ width:'100%', padding:'7px 8px', display:'flex', alignItems:'center', gap:7, background:showAlerts?C.amberSoft:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:showAlerts?C.amberDark:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span className="skip-utility-label" style={sans({ fontSize:12, fontWeight:600 })}>Alerts</span>
            <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:'#fff', background:C.rust, borderRadius:10, padding:'1px 7px' }}>
              {ALERTS.length}
            </span>
          </button>

          <button onClick={toggleTheme} title="Toggle light / dark theme"
            style={{ width:'100%', padding:'7px 8px', display:'flex', alignItems:'center', gap:7, background:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>{theme === 'dark' ? '☀' : '☾'}</span>
            <span className="skip-utility-label" style={sans({ fontSize:12, fontWeight:600 })}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
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
          <div style={sans({ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-.01em' })}>
            {TABS.find(t => t.key === tab)?.label || 'SKIP'}
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

        {/* Scrollable content */}
        <div className="skip-content" style={{ flex:1, overflowY:'auto', padding:'16px 18px 24px', display:'flex', flexDirection:'column', gap:0, minHeight:0 }}>

          {showAlerts && (
            <div style={{ marginBottom:16 }}>
              <Panel title="Active Alerts" accent={C.rust} badge="Sample feed">
                <div style={sans({ fontSize:10.5, color:C.text3, padding:'8px 14px 0', lineHeight:1.5 })}>
                  Illustrative examples — not a live feed yet.
                </div>
                {ALERTS.map((a, i) => (
                  <div key={i} style={{
                    padding:'10px 14px',
                    borderBottom: i < ALERTS.length - 1 ? `0.5px solid ${C.borderLight}` : 'none',
                    background: a.type === 'good' ? C.tealSoft : a.type === 'warn' && i < 2 ? C.rustSoft : C.amberSoft,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={sans({ fontSize:12, fontWeight:700, color:a.color })}>{a.icon} {a.title}</span>
                      <span style={px({ fontSize:10, color:C.text3 })}>{a.date}</span>
                    </div>
                    <div style={sans({ fontSize:11, color:C.text2, lineHeight:1.55 })}>{a.body}</div>
                  </div>
                ))}
              </Panel>
            </div>
          )}

          <PageErrorBoundary resetKey={tab}>
            <Suspense fallback={<PageLoading />}>
              {tab === 'overview'     && <OverviewPage rosterDefaults={rosterDefaults} />}
              {tab === 'players'      && <PlayersPage />}
              {tab === 'prospects'    && <ProspectsPage />}
              {tab === 'draft'        && <DraftPage />}
              {tab === 'league'       && <LeaguePage />}
              {tab === 'intelligence' && <IntelligencePage />}
              {tab === 'amd'          && <AMDPage />}
              {tab === 'knowledge'    && <KnowledgePage />}
              {tab === 'notes'        && <ScoutingNotesPage />}
              {tab === 'feed'         && <FeedPage />}
              {tab === 'follows'      && <FollowListPage />}
              {tab === 'settings'     && <SettingsPage theme={theme} toggleTheme={toggleTheme} lowDataMode={lowDataMode} toggleLowDataMode={toggleLowDataMode} rosterDefaults={rosterDefaults} updateRosterDefaults={updateRosterDefaults} feedFreshnessSettings={feedFreshnessSettings} feedFreshnessSuccesses={feedFreshnessSuccesses} updateFeedFreshnessSettings={updateFeedFreshnessSettings} />}
            </Suspense>
          </PageErrorBoundary>
        </div>

        {/* Live ticker */}
        <div style={{ height:32, flexShrink:0, background:C.navy, borderTop:`1px solid rgba(255,255,255,.1)`, display:'flex', alignItems:'center', overflow:'hidden' }}>
          <div style={{ flexShrink:0, padding:'0 14px', height:'100%', display:'flex', alignItems:'center', borderRight:'1px solid rgba(255,255,255,.12)', gap:6 }}>
            <div style={{
              width:6, height:6, borderRadius:'50%',
              background: tickerStatus === 'live' ? C.teal : 'rgba(255,255,255,.3)',
              animation: tickerStatus === 'live' ? 'pulse 1.6s ease-in-out infinite' : 'none',
            }} />
            <span style={px({ fontSize:10, color: tickerStatus === 'live' ? C.teal : 'rgba(255,255,255,.45)', letterSpacing:'.12em', fontWeight:500 })}>
              {tickerStatus === 'live' ? 'LIVE' : tickerStatus === 'error' ? 'OFFLINE' : tickerStatus === 'empty' ? 'NO GAMES' : 'CONNECTING'}
            </span>
          </div>
          <div style={{ overflow:'hidden', flex:1 }}>
            {tickerStatus === 'live' ? (
              <div style={{ display:'flex', alignItems:'center', whiteSpace:'nowrap', animation:'scrollx 50s linear infinite', ...px({ fontSize:11, color:'rgba(255,255,255,.72)' }) }}>
                {[...liveTicker, ...liveTicker].map((s, i) => (
                  <span key={i} style={{ padding:'0 20px', borderRight:'1px solid rgba(255,255,255,.1)' }}>{s}</span>
                ))}
              </div>
            ) : (
              <div style={{ padding:'0 20px', ...px({ fontSize:11, color:'rgba(255,255,255,.45)' }) }}>
                {tickerStatus === 'loading' && 'Connecting to live scores…'}
                {tickerStatus === 'empty'   && 'No games in progress right now.'}
                {tickerStatus === 'error'   && 'Live scores unavailable — retrying…'}
              </div>
            )}
          </div>
        </div>
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

        @media (prefers-reduced-motion: reduce) {
          .page-enter, .skip-content > * { animation: none !important; }
          *, *::before, *::after { transition-duration: .001ms !important; scroll-behavior: auto !important; }
          *[style*="animation"] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
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
