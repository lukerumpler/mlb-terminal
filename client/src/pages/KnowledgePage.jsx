import React, { useState, memo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { GAME_THEORY, DRAFT_INTELLIGENCE, BEHAVIORAL_BIASES, PROJECTION_SYSTEMS, PLAYER_GRADE_RUBRIC, FV_METHODOLOGY } from '../constants/data.js';
import { Panel, FVBadge, RiskDot } from '../components/atoms.jsx';

function InfoRow({ label, value, color, last = false }) {
  return (
    <div style={{ display:'flex', gap:8, padding:'5.5px 13px', borderBottom: last ? 'none' : `0.5px solid ${C.borderLight}` }}>
      <span style={sans({ fontSize:10, fontWeight:700, color:C.text2, minWidth:120, flexShrink:0 })}>{label}</span>
      <span style={sans({ fontSize:10, color: color || C.text, lineHeight:1.45, flex:1 })}>{value}</span>
    </div>
  );
}
function InsightBox({ text, color = C.amber }) {
  return (
    <div style={{ margin:'0 13px 8px', padding:'8px 10px', borderLeft:`3px solid ${color}`, background:`color-mix(in srgb, ${color} 7%, transparent)`, borderRadius:'0 6px 6px 0' }}>
      <div style={sans({ fontSize:10, color:C.text2, lineHeight:1.5 })}>{text}</div>
    </div>
  );
}
function SectionHead({ label }) {
  return (
    <div style={{ padding:'10px 13px 4px', ...sans({ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.text4 }) }}>{label}</div>
  );
}
function CountCard({ data, accent }) {
  return (
    <Panel title={data.label} accent={accent}>
      <InfoRow label="Pitcher (NE)" value={data.pitcherNE} />
      <InfoRow label="Hitter (NE)"  value={data.hitterNE}  />
      <InsightBox text={data.insight} color={accent} />
    </Panel>
  );
}
function BiasCard({ title, data, accent }) {
  return (
    <Panel title={title} accent={accent}>
      <InfoRow label="Definition"  value={data.definition} />
      {data.scoutingApplication  && <InfoRow label="Scouting"  value={data.scoutingApplication}  color={C.rust}  />}
      {data.analystApplication   && <InfoRow label="Analytics" value={data.analystApplication}   color={C.amber} />}
      {data.draftApplication     && <InfoRow label="Draft"     value={data.draftApplication}     color={C.amber} />}
      {data.tradeApplication     && <InfoRow label="Trades"    value={data.tradeApplication}     color={C.slate} />}
      {data.counterMeasure       && <InsightBox text={`Counter: ${data.counterMeasure}`} color={C.teal} />}
      {data.source               && <div style={{ padding:'4px 13px 6px', ...px({ fontSize:8.5, color:C.text4 }) }}>{data.source}</div>}
    </Panel>
  );
}

function GradeTable() {
  const grades = [
    { grade:'A1', skipVerdict:'PRIORITY ACQ', color:C.teal,   pitcher:PLAYER_GRADE_RUBRIC.A.A1_pitcher, hitter:PLAYER_GRADE_RUBRIC.A.A1_hitter, tpvi:'88–99' },
    { grade:'A2', skipVerdict:'STRONG BUY',   color:C.teal,   pitcher:PLAYER_GRADE_RUBRIC.A.A2_pitcher, hitter:PLAYER_GRADE_RUBRIC.A.A2_hitter, tpvi:'78–87' },
    { grade:'B1', skipVerdict:'MONITOR',      color:C.amber,  pitcher:PLAYER_GRADE_RUBRIC.B.B1_pitcher, hitter:PLAYER_GRADE_RUBRIC.B.B1_hitter, tpvi:'65–77' },
    { grade:'B2', skipVerdict:'HOLD',         color:C.amber,  pitcher:PLAYER_GRADE_RUBRIC.B.B2_pitcher, hitter:PLAYER_GRADE_RUBRIC.B.B2_hitter, tpvi:'52–64' },
    { grade:'C1', skipVerdict:'HOLD',         color:C.slate,  pitcher:PLAYER_GRADE_RUBRIC.C.C1_pitcher, hitter:PLAYER_GRADE_RUBRIC.C.C1_hitter, tpvi:'38–51' },
    { grade:'C2', skipVerdict:'AVOID',        color:C.rust,   pitcher:PLAYER_GRADE_RUBRIC.C.C2_pitcher, hitter:PLAYER_GRADE_RUBRIC.C.C2_hitter, tpvi:'25–37' },
    { grade:'D',  skipVerdict:'AVOID',        color:C.rust,   pitcher:PLAYER_GRADE_RUBRIC.D.pitcher_requirements, hitter:PLAYER_GRADE_RUBRIC.D.hitter_requirements, tpvi:'0–24' },
  ];
  const labelMap = { A:'Franchise / Elite', B:'Above-Average', C:'Fringe / Depth', D:'Org / Dev' };
  return (
    <Panel title="Organizational Grade Rubric" accent={C.amber} badge="A–D Scale">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
          <thead>
            <tr style={{ background:C.surface2 }}>
              {['Grade','SKIP','TPVI','Label','Pitcher Profile','Hitter Profile'].map(h => (
                <th key={h} style={{ padding:'5px 10px', fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.text3, textAlign:h==='Grade'||h==='SKIP'||h==='TPVI'?'center':'left', borderBottom:`0.5px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grades.map((g, i) => (
              <tr key={g.grade} style={{ borderBottom: i < grades.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding:'7px 10px', textAlign:'center' }}>
                  <span style={px({ fontSize:17, fontWeight:900, color:g.color })}>{g.grade}</span>
                </td>
                <td style={{ padding:'7px 10px', textAlign:'center' }}>
                  <span style={{ ...sans({ fontSize:8.5, fontWeight:700, color:g.color }), background:`color-mix(in srgb, ${g.color} 9%, transparent)`, border:`0.5px solid color-mix(in srgb, ${g.color} 33%, transparent)`, borderRadius:4, padding:'2px 7px', whiteSpace:'nowrap' }}>{g.skipVerdict}</span>
                </td>
                <td style={{ padding:'7px 10px', textAlign:'center', ...px({ fontSize:10, fontWeight:700, color:g.color }) }}>{g.tpvi}</td>
                <td style={{ padding:'7px 10px', ...sans({ fontSize:9.5, fontWeight:700, color:C.text }) }}>{labelMap[g.grade[0]]}</td>
                <td style={{ padding:'7px 10px', ...sans({ fontSize:9, color:C.text2, maxWidth:200 }) }}>{g.pitcher}</td>
                <td style={{ padding:'7px 10px', ...sans({ fontSize:9, color:C.text2, maxWidth:200 }) }}>{g.hitter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function FVWarTable() {
  return (
    <Panel title="eFV → Projected WAR Anchors" accent={C.teal} badge="5-yr Projection">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:420 }}>
          <thead>
            <tr style={{ background:C.surface2 }}>
              <th style={{ padding:'5px 10px', fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.text3, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>eFV</th>
              {FV_METHODOLOGY.warAnchors.map(([fv]) => (
                <th key={fv} style={{ padding:'5px 10px', fontSize:10, fontWeight:700, textAlign:'center', color:C.text2, borderBottom:`0.5px solid ${C.border}` }}>
                  <FVBadge fv={fv} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding:'7px 10px', ...sans({ fontSize:10, fontWeight:700, color:C.text2 }) }}>Proj. WAR</td>
              {FV_METHODOLOGY.warAnchors.map(([fv, war]) => (
                <td key={fv} style={{ padding:'7px 10px', textAlign:'center', ...px({ fontSize:12, fontWeight:800, color:C.teal }) }}>{war}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding:'8px 14px', borderTop:`0.5px solid ${C.borderLight}` }}>
        <span style={sans({ fontSize:9.5, color:C.text3, lineHeight:1.5 })}>Intermediate eFV values are linearly interpolated between these anchors — see src/engine/skip.js.</span>
      </div>
    </Panel>
  );
}

// Army leadership competency → baseball scout parallel
function ArmyParallels() {
  const parallels = [
    { army:'Leads Others', baseball:'Pitching Coach / Manager', desc:'Motivates, influences, and directs player performance toward shared organizational goals. Enforces standards without undermining confidence.' },
    { army:'Builds Trust', baseball:'Player Development Staff', desc:'Trust is the currency of the clubhouse. Development staff who deliver on promises — playing time, instruction, honest evaluations — build the culture that produces results.' },
    { army:'Communicates', baseball:'Scouting Reports / Analytics', desc:'Translates complex data into actionable player decisions. Bridges the gap between statistical models and on-field execution.' },
    { army:'Creates Positive Environment', baseball:'Clubhouse Culture / FO Philosophy', desc:'Organizations with elite player development cultures (Cardinals, Dodgers, Rays) systematically outperform draft class talent projections — culture is a multiplier.' },
    { army:'Prepares Self', baseball:'Player Self-Development', desc:'Elite players invest in off-season skill acquisition (pitch recognition, mechanics refinement) beyond what coaching mandates. Self-directed improvement drives career arcs.' },
    { army:'Develops Others', baseball:'Organizational Development Programs', desc:'The best organizations teach coaches how to teach — the multiplier effect of great development infrastructure compounds across entire prospect pipelines.' },
    { army:'Gets Results', baseball:'Front Office Decision-Making', desc:'Prioritize, organize, and execute — GMs who balance short-term contention with long-term asset accumulation consistently outperform single-dimension optimizers.' },
    { army:'Sound Judgment', baseball:'SKIP Decision Engine', desc:'Makes high-confidence decisions with incomplete information. The TPVI/CAS/DQS/DPI system mirrors the Army\'s emphasis on structured assessment frameworks over intuition alone.' },
    { army:'Mental Agility', baseball:'Pitcher Sequencing / In-Game Adjustment', desc:'The ability to break habitual thought patterns — pitchers who can vary approach by batter, game state, and count outperform pitchers who execute a fixed repertoire.' },
    { army:'Resilience', baseball:'Injury Recovery / Slump Management', desc:'Recovers from setbacks while maintaining organizational focus. The mental side of baseball is resilience made measurable.' },
  ];
  return (
    <Panel title="Army Leadership Model → Baseball Scout Parallels" accent={C.navy} badge="ADRP 6-22 Applied">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:520 }}>
          <thead>
            <tr style={{ background:C.surface2 }}>
              {['Army Competency','Baseball Parallel','Application'].map(h => (
                <th key={h} style={{ padding:'5px 10px', fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.text3, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parallels.map((p, i) => (
              <tr key={p.army} style={{ borderBottom: i < parallels.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = C.amberSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding:'6px 10px', fontFamily:"'DM Mono', monospace", fontSize:10, fontWeight:700, color:C.amber, minWidth:120, whiteSpace:'nowrap' }}>{p.army}</td>
                <td style={{ padding:'6px 10px', fontFamily:"'Plus Jakarta Sans', sans-serif", fontSize:10, fontWeight:700, color:C.teal, minWidth:160, whiteSpace:'nowrap' }}>{p.baseball}</td>
                <td style={{ padding:'6px 10px', fontFamily:"'Plus Jakarta Sans', sans-serif", fontSize:9.5, color:C.text2, lineHeight:1.5 }}>{p.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PerformanceLevels() {
  const levels = [
    { level:'Excels',          color:C.teal,   skip:'A1 / PRIORITY ACQ', desc:'Readily demonstrates at highest level. Shows initiative and adaptability in the most difficult situations. Actions have significant, enduring, positive impact.', baseball:'Cy Young / MVP caliber. Performs at peak in highest-leverage situations. Sustained elite production over multiple seasons.' },
    { level:'Proficient',      color:C.amber,  skip:'A2–B1 / STRONG BUY', desc:'Consistently demonstrates high level of competency. Proactive in challenging situations. Actions have positive impact on unit and mission.', baseball:'All-Star / Above-average. Consistent starter-quality production. Reliable in standard game situations.' },
    { level:'Capable',         color:C.slate,  skip:'B2–C1 / HOLD', desc:'Capable of demonstrating competency and frequently applies it. Actively learning to apply at a higher level. Positive but limited impact.', baseball:'Solid regular / platoon player. Performs adequately in role. Developing toward consistent starter level.' },
    { level:'Unsatisfactory',  color:C.rust,   skip:'C2–D / AVOID', desc:'Inconsistently demonstrates or fails to demonstrate competency. Unwilling or unable to improve. Efforts may have neutral or negative impact.', baseball:'Replacement level / organizational depth. Cannot reliably execute MLB-caliber performance consistently.' },
  ];
  return (
    <Panel title="Four Performance Levels — Army ADRP 6-22 Applied to SKIP" accent={C.purple} badge="Evaluation Framework">
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:0 }}>
        {levels.map((l, i) => (
          <div key={l.level} style={{ padding:'12px 14px', borderBottom: i < 2 ? `0.5px solid ${C.borderLight}` : 'none', borderRight: i % 2 === 0 ? `0.5px solid ${C.borderLight}` : 'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={px({ fontSize:14, fontWeight:800, color:l.color })}>{l.level}</span>
              <span style={{ ...sans({ fontSize:8.5, fontWeight:700, color:l.color }), background:`color-mix(in srgb, ${l.color} 9%, transparent)`, border:`0.5px solid color-mix(in srgb, ${l.color} 33%, transparent)`, borderRadius:4, padding:'2px 8px' }}>{l.skip}</span>
            </div>
            <div style={sans({ fontSize:9.5, color:C.text2, lineHeight:1.5, marginBottom:6 })}>{l.desc}</div>
            <div style={{ display:'flex', gap:5, padding:'6px 8px', background:`color-mix(in srgb, ${l.color} 6%, transparent)`, borderRadius:6, borderLeft:`2px solid ${l.color}` }}>
              <span style={sans({ fontSize:9, color:C.text3, fontWeight:700, flexShrink:0 })}>EX:</span>
              <span style={sans({ fontSize:9.5, color:C.text2, lineHeight:1.5 })}>{l.baseball}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const VIEWS = [
  { key:'gametheory',  label:'Game Theory'      },
  { key:'biases',      label:'Behavioral Biases' },
  { key:'draft',       label:'Draft Intel'       },
  { key:'futurevalue', label:'Future Value'      },
  { key:'grades',      label:'Grade Rubric'      },
  { key:'projection',  label:'Projections'       },
  { key:'leadership',  label:'Leadership Model'  },
];

function KnowledgePage() {
  const [view, setView] = useState('gametheory');
  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:2, background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:8, padding:3, alignSelf:'flex-start', flexWrap:'wrap' }}>
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)} aria-pressed={view===v.key}
            style={{ padding:'5px 12px', fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:10.5, fontWeight:600, color:view===v.key?'#fff':C.text3, background:view===v.key?C.navy:'transparent', border:'none', borderRadius:5, cursor:'pointer', whiteSpace:'nowrap' }}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'gametheory' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Core Definitions" accent={C.navy} badge="Game Theory Primer">
            {Object.entries(GAME_THEORY.definitions).map(([k, v], i, arr) => (
              <InfoRow key={k} label={k.replace(/([A-Z])/g,' $1').trim()} value={v} last={i === arr.length-1} />
            ))}
          </Panel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <CountCard data={GAME_THEORY.countStrategies.count30} accent={C.amber} />
            <CountCard data={GAME_THEORY.countStrategies.count32} accent={C.rust}  />
          </div>
          <Panel title="Cross-Count Findings — Swartz (SABR 2013)" accent={C.teal} badge="Published Research">
            <InfoRow label="Fastball Usage"     value={GAME_THEORY.countStrategies.countGeneral.fastballUsage} color={C.rust} />
            <InfoRow label="Two-Strike Hitters" value={GAME_THEORY.countStrategies.countGeneral.battersWithTwoStrikes} />
            <InsightBox text={GAME_THEORY.countStrategies.countGeneral.insight} color={C.teal} />
          </Panel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="In-Game Strategic Games" accent={C.slate}>
              <SectionHead label="Pitcher Switching" />
              <InfoRow label="Structure"   value={GAME_THEORY.inGameGames.pitcherSwitching.structure} />
              <InfoRow label="NE Outcome"  value={GAME_THEORY.inGameGames.pitcherSwitching.nashOutcome} color={C.teal} />
              <InsightBox text={GAME_THEORY.inGameGames.pitcherSwitching.insight} color={C.slate} />
              <SectionHead label="First Pitch" />
              <InsightBox text={GAME_THEORY.inGameGames.firstPitch.insight} color={C.amber} />
              <SectionHead label="Pitch Tunneling" />
              <InsightBox text={GAME_THEORY.pitchOptimization.tunneling} color={C.teal} />
            </Panel>
            <Panel title="Front Office Market Games" accent={C.amber}>
              <SectionHead label="Free Agency" />
              <InfoRow label="Structure"  value={GAME_THEORY.marketGames.freeAgency.structure} />
              <InfoRow label="NE Outcome" value={GAME_THEORY.marketGames.freeAgency.nashOutcome} color={C.rust} />
              <InsightBox text={GAME_THEORY.marketGames.freeAgency.insight} color={C.amber} />
              <SectionHead label="Contract Negotiation" />
              <InfoRow label="Structure"  value={GAME_THEORY.marketGames.contractNegotiation.structure} />
              <InfoRow label="Outcome"    value={GAME_THEORY.marketGames.contractNegotiation.outcome} color={C.teal} />
              <InsightBox text={GAME_THEORY.marketGames.contractNegotiation.insight} color={C.amber} />
            </Panel>
          </div>
          <Panel title="Game Theory as the Next Moneyball" accent={C.purple} badge="SABR 2013 Thesis">
            <InsightBox text={GAME_THEORY.nextMoneyball.thesis} color={C.purple} />
            <InfoRow label="Swartz (2013)"  value={GAME_THEORY.nextMoneyball.swartz2013} />
            <InfoRow label="Market Edge"    value={GAME_THEORY.nextMoneyball.marketEdge} color={C.amber} />
            <InfoRow label="Studeman"       value={GAME_THEORY.nextMoneyball.studeman2013} />
            <InfoRow label="Prediction"     value={GAME_THEORY.nextMoneyball.prediction} color={C.teal} last />
          </Panel>
          <Panel title="Five-Player Offseason Simulation — Goldman (2016)" accent={C.teal} badge="Coordination Game">
            <InfoRow label="Rules"            value={GAME_THEORY.simulationInsights.fivePlayerGame.rules} />
            <InfoRow label="Outcomes"         value={GAME_THEORY.simulationInsights.fivePlayerGame.outcomes} />
            <InfoRow label="Oakland Strategy" value={GAME_THEORY.simulationInsights.fivePlayerGame.oaklandStrategy} color={C.teal} />
            <InfoRow label="Trout Paradox"    value={GAME_THEORY.simulationInsights.fivePlayerGame.troutParadox} color={C.amber} />
            <InsightBox text={GAME_THEORY.simulationInsights.fivePlayerGame.insight} color={C.teal} />
          </Panel>
        </div>
      )}

      {view === 'biases' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <BiasCard title="Confirmation Bias" data={BEHAVIORAL_BIASES.confirmationBias} accent={C.rust}  />
            <BiasCard title="Recency Bias"       data={BEHAVIORAL_BIASES.recencyBias}       accent={C.amber} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <BiasCard title="Loss Aversion"   data={BEHAVIORAL_BIASES.lossAversion}   accent={C.amber} />
            <BiasCard title="Anchoring Bias"  data={BEHAVIORAL_BIASES.anchoringBias}  accent={C.slate} />
          </div>
          <Panel title="El Farol Bar Problem — Market Efficiency" accent={C.teal} badge="Arthur (1994)">
            <InfoRow label="Problem"           value={BEHAVIORAL_BIASES.elFarolEffect.definition} />
            <InfoRow label="Baseball"          value={BEHAVIORAL_BIASES.elFarolEffect.baseballApplication} color={C.rust} />
            <InfoRow label="Minority Game"     value={BEHAVIORAL_BIASES.elFarolEffect.minorityGame}        color={C.amber} />
            <InfoRow label="SKIP Implication"  value={BEHAVIORAL_BIASES.elFarolEffect.implication}         color={C.teal} />
            <InsightBox text={BEHAVIORAL_BIASES.elFarolEffect.boundedRationality} color={C.teal} />
          </Panel>
          <Panel title="Fantasy Baseball Psychology" accent={C.purple} badge="Cognitive Traps">
            <InfoRow label="Gladwell Test"   value={BEHAVIORAL_BIASES.fantasyPsychology.gladwellTest} />
            <InfoRow label="Win Probability" value={BEHAVIORAL_BIASES.fantasyPsychology.winProbability} color={C.teal} />
            <InfoRow label="DFS Correlation" value={BEHAVIORAL_BIASES.fantasyPsychology.correlated}     color={C.amber} />
            <SectionHead label="Biases in Fantasy" />
            {Object.entries(BEHAVIORAL_BIASES.fantasyPsychology.biasesInFantasy).map(([k, v], i, arr) => (
              <div key={k} style={{ display:'flex', gap:8, padding:'5px 13px', borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                <span style={sans({ fontSize:10, fontWeight:700, color:C.rust, minWidth:100, flexShrink:0, textTransform:'capitalize' })}>{k}</span>
                <span style={sans({ fontSize:10, color:C.text2, lineHeight:1.4 })}>{v}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {view === 'draft' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="Draft Structure" accent={C.amber} badge="MLB First-Year Player Draft">
              <InfoRow label="Total Rounds"   value={`${DRAFT_INTELLIGENCE.structure.rounds} rounds / ${DRAFT_INTELLIGENCE.structure.totalPicks} picks`} />
              <InfoRow label="vs. NFL"        value={DRAFT_INTELLIGENCE.structure.comparison.NFL} />
              <InfoRow label="vs. NBA"        value={DRAFT_INTELLIGENCE.structure.comparison.NBA} />
              <InfoRow label="vs. NHL"        value={DRAFT_INTELLIGENCE.structure.comparison.NHL} />
              <InfoRow label="Bonus Pools"    value={DRAFT_INTELLIGENCE.structure.bonusPools} color={C.rust} />
              <InfoRow label="Typical Path"   value={DRAFT_INTELLIGENCE.structure.typicalPath} />
              <InfoRow label="Lottery System" value={DRAFT_INTELLIGENCE.structure.lotterySystem} />
              <InfoRow label="History"        value={DRAFT_INTELLIGENCE.structure.history} last />
            </Panel>
            <Panel title="The Passan Plan — Blow Up the Draft" accent={C.rust} badge="Passan 2019">
              <InsightBox text={DRAFT_INTELLIGENCE.passanPlan.premise} color={C.rust} />
              {DRAFT_INTELLIGENCE.passanPlan.howItWorks.map((step, i, arr) => (
                <div key={i} style={{ display:'flex', gap:8, padding:'5px 13px', borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                  <span style={px({ fontSize:9, fontWeight:700, color:C.amber, minWidth:18, flexShrink:0 })}>#{i+1}</span>
                  <span style={sans({ fontSize:9.5, color:C.text2, lineHeight:1.4 })}>{step}</span>
                </div>
              ))}
              <InfoRow label="Legal Status" value={DRAFT_INTELLIGENCE.passanPlan.legalStatus}  color={C.teal} />
              <InfoRow label="Tradeoff"     value={DRAFT_INTELLIGENCE.passanPlan.tradeoff}      color={C.amber} />
              <InfoRow label="Status"       value={DRAFT_INTELLIGENCE.passanPlan.discussed} last />
            </Panel>
          </div>
          <Panel title="Perfect Draft Framework — Wharton (2017)" accent={C.teal} badge="Nandakumar / NHL Study">
            <InfoRow label="Definition"        value={DRAFT_INTELLIGENCE.draftEfficiency.definition} />
            <InfoRow label="Methodology"       value={DRAFT_INTELLIGENCE.draftEfficiency.methodology}       color={C.teal}  />
            <InfoRow label="Efficiency Metric" value={DRAFT_INTELLIGENCE.draftEfficiency.efficiencyMetric}  color={C.amber} />
            <InfoRow label="MLB Application"   value={DRAFT_INTELLIGENCE.draftEfficiency.mlbApplication} />
            <InfoRow label="Key Insight"       value={DRAFT_INTELLIGENCE.draftEfficiency.keyInsight}        color={C.teal} />
            <InsightBox text={DRAFT_INTELLIGENCE.draftEfficiency.nhFinding} color={C.slate} />
          </Panel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="Scouting Models" accent={C.amber}>
              <SectionHead label="Traditional 5-Tool" />
              <InfoRow label="Philosophy" value={DRAFT_INTELLIGENCE.scoutingFramework.oldSchool.philosophy} />
              <div style={{ padding:'5px 13px 8px', borderBottom:`0.5px solid ${C.borderLight}` }}>
                {DRAFT_INTELLIGENCE.scoutingFramework.oldSchool.tools.map((t,i) => (
                  <div key={i} style={sans({ fontSize:9.5, color:C.text, marginBottom:2 })}>• {t}</div>
                ))}
              </div>
              <SectionHead label="Moneyball Model" />
              <InfoRow label="Philosophy" value={DRAFT_INTELLIGENCE.scoutingFramework.moneyballModel.philosophy} />
              <InsightBox text={`Limitation: ${DRAFT_INTELLIGENCE.scoutingFramework.moneyballModel.limitations}`} color={C.amber} />
              <SectionHead label="Modern Hybrid" />
              <InfoRow label="Approach"      value={DRAFT_INTELLIGENCE.scoutingFramework.modernModel.approach}      color={C.teal} />
              <InfoRow label="HS vs College" value={DRAFT_INTELLIGENCE.scoutingFramework.modernModel.riskDimension} last />
            </Panel>
            <Panel title="Draft Strategy Frameworks" accent={C.slate}>
              {Object.entries(DRAFT_INTELLIGENCE.strategies).map(([k, v], i, arr) => (
                <InfoRow key={k} label={k.replace(/([A-Z])/g,' $1').trim().replace(/^./,c=>c.toUpperCase())} value={v} color={i===0?C.teal:undefined} />
              ))}
              <SectionHead label="Bargaining Theory — Garmon (2013)" />
              <InfoRow label="Finding 1" value={DRAFT_INTELLIGENCE.bargainingFindings.finding1} color={C.rust}  />
              <InfoRow label="Finding 2" value={DRAFT_INTELLIGENCE.bargainingFindings.finding2} color={C.amber} />
              <InfoRow label="Finding 3" value={DRAFT_INTELLIGENCE.bargainingFindings.finding3} color={C.amber} />
              <InsightBox text={DRAFT_INTELLIGENCE.bargainingFindings.implication} color={C.teal} />
            </Panel>
          </div>
          <Panel title="College vs HS Draft Strategy — Prisoner's Dilemma" accent={C.purple}>
            <InfoRow label="Structure"  value={GAME_THEORY.marketGames.draftCollegeVsHS.structure} />
            <InfoRow label="NE Outcome" value={GAME_THEORY.marketGames.draftCollegeVsHS.nashOutcome} color={C.teal} />
            <InsightBox text={GAME_THEORY.marketGames.draftBonusPrisonersDilemma.insight} color={C.purple} />
          </Panel>
        </div>
      )}

      {view === 'futurevalue' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="What eFV Is" accent={C.teal} badge="20–80 Scale, Continuous">
            <InsightBox text={FV_METHODOLOGY.whatItIs} color={C.teal} />
            <InfoRow label="Output Range" value={FV_METHODOLOGY.outputRange} color={C.teal} last />
          </Panel>

          <Panel title="How eFV Is Computed" accent={C.amber} badge="3 Inputs">
            {FV_METHODOLOGY.inputs.map((inp, i, arr) => (
              <div key={inp.label} style={{ display:'flex', gap:8, padding:'7px 13px', borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                <span style={{ ...sans({ fontSize:8.5, fontWeight:700, color:C.amber }), background:C.amberSoft, border:`0.5px solid ${C.amberMid}`, borderRadius:4, padding:'2px 7px', whiteSpace:'nowrap', height:'fit-content', minWidth:74, textAlign:'center' }}>{inp.weight}</span>
                <div>
                  <div style={sans({ fontSize:10.5, fontWeight:700, color:C.text, marginBottom:2 })}>{inp.label}</div>
                  <div style={sans({ fontSize:9.5, color:C.text2, lineHeight:1.5 })}>{inp.desc}</div>
                </div>
              </div>
            ))}
            <InsightBox text={FV_METHODOLOGY.whyContinuous} color={C.amber} />
          </Panel>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FVWarTable />
            <Panel title="Risk Bands" accent={C.rust} badge="Low / Medium / High">
              {FV_METHODOLOGY.riskBands.map((r, i, arr) => (
                <div key={r.band} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'8px 13px', borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                  <div style={{ paddingTop:3 }}><RiskDot risk={r.band} /></div>
                  <div>
                    <div style={px({ fontSize:10.5, fontWeight:700, color: r.band==='Low'?C.teal:r.band==='Medium'?C.amber:C.rust, marginBottom:2 })}>{r.band}</div>
                    <div style={sans({ fontSize:9.5, color:C.text2, lineHeight:1.5 })}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </Panel>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="eFV Movers" accent={C.teal} badge="Prospects Tab">
              <InsightBox text={FV_METHODOLOGY.movers} color={C.teal} />
            </Panel>
            <Panel title="Outcome Grounding" accent={C.purple} badge="Validation">
              <InsightBox text={FV_METHODOLOGY.outcomeGrounding} color={C.purple} />
            </Panel>
          </div>
        </div>
      )}

      {view === 'grades' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <GradeTable />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="D-Grade — Organizational Depth" accent={C.slate}>
              <InfoRow label="Description"      value={PLAYER_GRADE_RUBRIC.D.description} />
              <InfoRow label="Pitchers"          value={PLAYER_GRADE_RUBRIC.D.pitcher_requirements} />
              <InfoRow label="Position Players"  value={PLAYER_GRADE_RUBRIC.D.hitter_requirements} />
              <InfoRow label="Catchers"          value={PLAYER_GRADE_RUBRIC.D.catcher_requirements} />
              <InfoRow label="Character"         value={PLAYER_GRADE_RUBRIC.D.character} color={C.teal} last />
            </Panel>
            <Panel title="SKIP's Score → Grade Mapping" accent={C.amber} badge="TPVI System">
              {Object.entries(PLAYER_GRADE_RUBRIC.skipMapping).map(([grade, info], i, arr) => (
                <div key={grade} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 13px', borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                  <span style={px({ fontSize:16, fontWeight:900, color:info.color, minWidth:24 })}>{grade}</span>
                  <span style={{ ...sans({ fontSize:8.5, fontWeight:700, color:info.color }), background:`color-mix(in srgb, ${info.color} 9%, transparent)`, border:`0.5px solid color-mix(in srgb, ${info.color} 33%, transparent)`, borderRadius:4, padding:'2px 7px', whiteSpace:'nowrap', minWidth:90, textAlign:'center' }}>{info.skip}</span>
                  <span style={px({ fontSize:10, color:info.color, minWidth:52, textAlign:'right' })}>{info.tpviRange[0]}–{info.tpviRange[1]}</span>
                  <span style={sans({ fontSize:9.5, color:C.text2, flex:1 })}>{info.description}</span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}

      {view === 'projection' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Projection Systems Overview" accent={C.amber} badge="Cohen / FanGraphs 2024">
            <InsightBox text={PROJECTION_SYSTEMS.methodology} color={C.amber} />
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
                <thead>
                  <tr style={{ background:C.surface2 }}>
                    {['System','Creator','Notes'].map(h => (
                      <th key={h} style={{ padding:'5px 10px', fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:C.text3, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PROJECTION_SYSTEMS.systems.map((s, i, arr) => (
                    <tr key={s.name} style={{ borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                      <td style={{ padding:'6px 10px', ...px({ fontSize:11, fontWeight:700, color:C.amber }) }}>{s.name}</td>
                      <td style={{ padding:'6px 10px', ...sans({ fontSize:10, color:C.text2 }) }}>{s.creator || '—'}</td>
                      <td style={{ padding:'6px 10px', ...sans({ fontSize:10, color:C.text }) }}>{s.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Panel title="Auction Framework" accent={C.teal}>
              <InfoRow label="Price Points"   value={PROJECTION_SYSTEMS.auctionFramework.pricePoints} />
              <InfoRow label="Profit Metric"  value={PROJECTION_SYSTEMS.auctionFramework.profitMetric}         color={C.teal}  />
              <InfoRow label="Indifference"   value={PROJECTION_SYSTEMS.auctionFramework.indifference} />
              <InfoRow label="Roto vs Points" value={PROJECTION_SYSTEMS.auctionFramework.categoriesVsPoints}   color={C.amber} last />
            </Panel>
            <Panel title="Game Theory Angle" accent={C.purple}>
              <InsightBox text={PROJECTION_SYSTEMS.gameTheoryAngle}  color={C.purple} />
              <InsightBox text={PROJECTION_SYSTEMS.skipApplication}   color={C.amber}  />
            </Panel>
          </div>
        </div>
      )}

      {view === 'leadership' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Panel title="Army Leadership Requirements Model — ADRP 6-22" accent={C.navy} badge="Jan 2014">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
              {[
                { cat:'CHARACTER', color:C.navy, items:['Army Values','Empathy','Warrior Ethos / Service Ethos','Discipline'] },
                { cat:'PRESENCE',  color:C.teal, items:['Military & Professional Bearing','Fitness','Confidence','Resilience'] },
                { cat:'INTELLECT', color:C.amber, items:['Mental Agility','Sound Judgment','Innovation','Interpersonal Tact','Expertise'] },
              ].map((g, i) => (
                <div key={g.cat} style={{ padding:'10px 12px', borderRight: i < 2 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                  <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:g.color, marginBottom:6 })}>{g.cat}</div>
                  {g.items.map(it => (
                    <div key={it} style={{ display:'flex', gap:5, marginBottom:3 }}>
                      <div style={{ width:4, height:4, borderRadius:'50%', background:g.color, flexShrink:0, marginTop:4 }} />
                      <span style={sans({ fontSize:10, color:C.text2 })}>{it}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ borderTop:`0.5px solid ${C.border}`, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
              {[
                { cat:'LEADS', color:C.rust, items:['Leads Others','Builds Trust','Extends Influence Beyond Chain of Command','Leads by Example','Communicates'] },
                { cat:'DEVELOPS', color:C.purple, items:['Creates Positive Environment / Esprit de Corps','Prepares Self','Develops Others','Stewards the Profession'] },
                { cat:'ACHIEVES', color:C.teal, items:['Gets Results'] },
              ].map((g, i) => (
                <div key={g.cat} style={{ padding:'10px 12px', borderRight: i < 2 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                  <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:g.color, marginBottom:6 })}>{g.cat}</div>
                  {g.items.map(it => (
                    <div key={it} style={{ display:'flex', gap:5, marginBottom:3 }}>
                      <div style={{ width:4, height:4, borderRadius:'50%', background:g.color, flexShrink:0, marginTop:4 }} />
                      <span style={sans({ fontSize:10, color:C.text2 })}>{it}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
          <PerformanceLevels />
          <ArmyParallels />
          <Panel title="Quick Checks — Applied to SKIP Decision Framework" accent={C.amber} badge="ADRP 6-22 Adapted">
            {[
              ['Leads Others (→ Gets Buy-In)',        'Does the SKIP verdict generate organizational commitment to act? A PRIORITY ACQ call that isn\'t acted on reflects a failure to lead.'],
              ['Builds Trust (→ Model Transparency)', 'TPVI/CAS/DQS/DPI scores are shown explicitly — not black-box outputs. Users must trust the model to act on it. Transparency builds trust.'],
              ['Communicates (→ Verdict Clarity)',    'SKIP distills complex data into clear verdicts (STRONG BUY, HOLD, AVOID). Communication failure = analysis paralysis in front offices.'],
              ['Sound Judgment (→ Incomplete Data)',  'MLB Stats API returns incomplete 2026 data mid-season. SKIP must make confident recommendations with partial information — the hallmark of sound judgment.'],
              ['Gets Results (→ Acquisition Outcomes)','The ultimate metric: did players SKIP flagged as PRIORITY ACQ deliver results? Tracking outcome vs verdict closes the evaluation feedback loop.'],
              ['Prepares Self (→ Model Iteration)',   'SKIP MARK5 is not the final form. Continuous improvement via Statcast integration, LLM reports, and historical outcome validation is the development mandate.'],
            ].map(([label, value], i, arr) => (
              <InfoRow key={label} label={label} value={value} color={i % 2 === 0 ? C.amber : undefined} last={i === arr.length-1} />
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(KnowledgePage);
