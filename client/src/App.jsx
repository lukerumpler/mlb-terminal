import React, { useState, useMemo, useEffect, useCallback, Suspense, lazy } from 'react';
import { C, px, sans } from './constants/colors.js';
import { ALERTS, getDailyInsight } from './constants/alerts.js';
import { getTodaysGames } from './api/mlb.js';
import { Panel } from './components/atoms.jsx';

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
  { key:'overview',     icon:'⊞', label:'Overview'     },
  { key:'players',      icon:'◷', label:'Players'      },
  { key:'prospects',    icon:'↑', label:'Prospects'    },
  { key:'draft',        icon:'◈', label:'Draft'        },
  { key:'league',       icon:'◎', label:'League'       },
  { key:'intelligence', icon:'◆', label:'Intelligence' },
  { key:'amd',          icon:'⊛', label:'AMD / IMD'    },
  { key:'knowledge',    icon:'◉', label:'Knowledge'    },
  { key:'notes',        icon:'✎', label:'Scouting Notes' },
  { key:'feed',         icon:'▤', label:'Intel Feed'     },
  { key:'follows',      icon:'⤴', label:'Follow List'    },
  { key:'settings',     icon:'⚙', label:'Settings'     },
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
    <div className="skip-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:"'Plus Jakarta Sans', sans-serif" }}>

      {/* ── SIDEBAR ── */}
      <div className="skip-sidebar" style={{ width:200, flexShrink:0, background:C.surface, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Logo */}
        <div style={{ padding:'14px 14px 12px', borderBottom:`1px solid ${C.border}` }}>
          <svg className="skip-sidebar-logo" viewBox="0 0 200 78" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', maxWidth:172, height:'auto', display:'block', marginBottom:10 }}>
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
        <div style={{ flex:1, padding:'8px 8px', display:'flex', flexDirection:'column', gap:1, overflowY:'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab===t.key ? 'page' : undefined}
              style={{ width:'100%', padding:'8px 10px', display:'flex', alignItems:'center', gap:9, background:tab===t.key?C.amberSoft:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:tab===t.key?C.amberDark:C.text2, transition:'all .12s', textAlign:'left' }}>
              <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>{t.icon}</span>
              <span className="skip-nav-label" style={sans({ fontSize:12, fontWeight:600, letterSpacing:'.01em' })}>{t.label}</span>
              {tab === t.key && <div style={{ marginLeft:'auto', width:3, height:14, borderRadius:1.5, background:C.amber }} />}
            </button>
          ))}

          <button onClick={() => setShowPalette(true)} title="Search everything"
            style={{ width:'100%', padding:'8px 10px', display:'flex', alignItems:'center', gap:9, background:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>⌕</span>
            <span className="skip-nav-label" style={sans({ fontSize:12, fontWeight:600, flex:1 })}>Search</span>
            <span className="skip-nav-shortcut" style={px({ fontSize:9.5, color:C.text4, border:`0.5px solid ${C.border}`, borderRadius:4, padding:'1px 5px' })}>⌘K</span>
          </button>

          <div style={{ height:1, background:C.border, margin:'6px 2px' }} />

          <button onClick={() => setShowAlerts(s => !s)} aria-expanded={showAlerts}
            style={{ width:'100%', padding:'8px 10px', display:'flex', alignItems:'center', gap:9, background:showAlerts?C.amberSoft:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:showAlerts?C.amberDark:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span className="skip-utility-label" style={sans({ fontSize:12, fontWeight:600 })}>Alerts</span>
            <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:'#fff', background:C.rust, borderRadius:10, padding:'1px 7px' }}>
              {ALERTS.length}
            </span>
          </button>

          <button onClick={toggleTheme} title="Toggle light / dark theme"
            style={{ width:'100%', padding:'8px 10px', display:'flex', alignItems:'center', gap:9, background:'transparent', border:'none', borderRadius:7, cursor:'pointer', color:C.text2, transition:'all .12s', textAlign:'left' }}>
            <span style={{ fontSize:14, flexShrink:0, width:20, textAlign:'center' }}>{theme === 'dark' ? '☀' : '☾'}</span>
            <span className="skip-utility-label" style={sans({ fontSize:12, fontWeight:600 })}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>

        <div className="skip-sidebar-insight" style={{ padding:'10px 12px', borderTop:`1px solid ${C.border}` }}>
          <div style={{ marginBottom:5, fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700, color:C.amber, letterSpacing:'.08em' }}>SKIP INSIGHT</div>
          <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:10, color:C.text2, lineHeight:1.5, fontStyle:'italic' }}>
            &ldquo;{dailyInsight}&rdquo;
          </div>
        </div>
      </div>

      {/* ── WORKSPACE ── */}
      <div className="skip-workspace" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>

        {/* Top bar */}
        <div className="skip-topbar" style={{ height:42, flexShrink:0, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 20px', gap:16 }}>
          <div style={sans({ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-.01em' })}>
            {TABS.find(t => t.key === tab)?.label || 'SKIP'}
          </div>
          <div style={{ flex:1 }} />
          <div style={sans({ fontSize:11, color:C.text3, letterSpacing:'.02em' })}>Scouting Knowledge & Intelligence Platform</div>
          <div style={{ height:7, width:7, borderRadius:'50%', background:C.teal, animation:'pulse 1.6s ease-in-out infinite' }} />
        </div>

        {/* Scrollable content */}
        <div className="skip-content" style={{ flex:1, overflowY:'auto', padding:'16px 20px 20px', display:'flex', flexDirection:'column', gap:0, minHeight:0 }}>

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
              {tab === 'overview'     && <OverviewPage />}
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
              {tab === 'settings'     && <SettingsPage theme={theme} toggleTheme={toggleTheme} />}
            </Suspense>
          </PageErrorBoundary>
        </div>

        {/* Live ticker */}
        <div style={{ height:28, flexShrink:0, background:C.navy, borderTop:`1px solid rgba(255,255,255,.1)`, display:'flex', alignItems:'center', overflow:'hidden' }}>
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

        @keyframes scrollx { from { transform:translateX(0) } to { transform:translateX(-50%) } }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        /* Scrollbar theming, base :focus-visible ring, and text-selection
           color are defined globally in index.html so they're consistent
           before this component even mounts. This block only adds the
           button hover treatment and the input focus halo, which are
           specific enough to this app's look that they don't belong in
           the generic page-level stylesheet. */
        button:hover { filter: brightness(0.97); }
        input:focus  { outline:none; border-color:${C.amber} !important; box-shadow:0 0 0 2px ${C.amberSoft}; }

        tr { transition:background .1s ease; }
        .page-enter { animation: fadeUp .22s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .page-enter { animation: none; }
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
