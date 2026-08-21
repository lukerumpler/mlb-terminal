import React, { useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { PlayerMediaPanel } from '../features/player-profile/PlayerMediaPanel.jsx';
import { BoxscoreSplitPanel, ReconciliationPanel } from '../features/player-profile/PlayerBoxscorePanels.jsx';

const PREVIEW_PROFILE = {
  id: 'player-profile-preview',
  fullName: 'Preview Player',
  currentTeam: { name: 'SKIP Preview Club', abbreviation: 'SKIP' },
};

const READY_BOXSCORE = {
  status: 'live', source: 'Illustrative UI fixture · not live data', windowLabel: 'Preview sample', retrievedAt: Date.UTC(2026, 7, 21, 12), games: 6,
  batting: [{ label:'All', games:6, plateAppearances:25, atBats:22, hits:7, homeRuns:2, walks:3, avg:.318, obp:.400, slg:.636, ops:1.036 }],
  recentGames: [
    { gamePk:'preview-1', date:'2026-08-20', opponent:'Preview A', batting:{ ops:1.250 } },
    { gamePk:'preview-2', date:'2026-08-19', opponent:'Preview B', batting:{ ops:.833 } },
    { gamePk:'preview-3', date:'2026-08-18', opponent:'Preview C', batting:{ ops:1.100 } },
  ],
};

function previewPlayerForState(state) {
  const boxscoreSplits = state === 'ready' ? READY_BOXSCORE : state === 'loading'
    ? { status:'loading' }
    : { status:'unavailable', reason:'Previewing the explicit unavailable state; no live data is requested.' };
  return {
    id: PREVIEW_PROFILE.id,
    fullName: PREVIEW_PROFILE.fullName,
    name: PREVIEW_PROFILE.fullName,
    statSeason: 2026,
    isPitcher: false,
    stats: { gamesPlayed:6, plateAppearances:25, atBats:22, hits:7, homeRuns:2, baseOnBalls:3, avg:.318, obp:.400, slg:.636, ops:1.036 },
    boxscoreSplits,
  };
}

export default function PlayerProfilePreviewsPage() {
  const [boxscoreState, setBoxscoreState] = useState('ready');
  const fixturePlayer = useMemo(() => previewPlayerForState(boxscoreState), [boxscoreState]);
  return <main className="page-enter" aria-labelledby="player-profile-previews-title" style={{ display:'flex', flexDirection:'column', gap:12 }}>
    <header style={{ padding:'12px 14px', border:`1px solid ${C.purpleMid}`, borderRadius:9, background:C.surface2 }}>
      <div style={px({ fontSize:8.5, color:C.purple, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase' })}>Isolated UI fixture · not live baseball data</div>
      <h1 id="player-profile-previews-title" style={sans({ fontSize:22, fontWeight:800, color:C.text, marginTop:4, letterSpacing:'-.03em' })}>Player Profile feature previews</h1>
      <p style={sans({ fontSize:10.5, color:C.text3, marginTop:5, lineHeight:1.45 })}>Test the extracted media and boxscore workflows independently. Fixture values exist only to exercise layout and states; they are not player evaluation data.</p>
      <a href="/" style={px({ display:'inline-block', marginTop:8, fontSize:9, color:C.teal, fontWeight:800, letterSpacing:'.05em', textDecoration:'none', textTransform:'uppercase' })}>← Return to SKIP workspace</a>
    </header>

    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', padding:'8px 10px', border:`1px solid ${C.borderLight}`, borderRadius:7, background:C.surface }}>
      <label style={sans({ fontSize:10, fontWeight:700, color:C.text2 })}>Boxscore state
        <select aria-label="Preview boxscore state" value={boxscoreState} onChange={event => setBoxscoreState(event.target.value)} style={{ marginLeft:7, minHeight:28, padding:'0 7px', border:`1px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.text, fontSize:10 }}>
          <option value="ready">Verified fixture</option><option value="loading">Loading</option><option value="unavailable">Unavailable</option>
        </select>
      </label>
      <span style={sans({ fontSize:9, color:C.text4 })}>Open directly with <code>?preview=player-profile</code>.</span>
    </div>

    <div className="skip-player-profile-preview-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12 }}>
      <PlayerMediaPanel player={{ id:PREVIEW_PROFILE.id }} profile={PREVIEW_PROFILE} accent={C.teal} />
      <BoxscoreSplitPanel player={fixturePlayer} />
    </div>
    <ReconciliationPanel player={fixturePlayer} />
  </main>;
}
