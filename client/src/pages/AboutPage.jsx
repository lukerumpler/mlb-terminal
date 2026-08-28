import React from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from '../components/atoms.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

// Static profile content — mirrors the /about page on the live managed
// deployment. Not sourced from any provider or API (unlike the rest of
// SKIP), so there's no freshness/provenance badge here — this is the one
// page in the app that's just hand-written, not data-driven.

const CORE_SKILLS = [
  {
    heading: 'Baseball Operations',
    items: [
      'Scouting + player evaluation',
      'Roster and player context',
      'Clubhouse + event operations',
      'BATS, Synergy + Yakkertech',
    ],
  },
  {
    heading: 'Analytics + Systems',
    items: [
      'SQL + Power BI',
      'Player valuation + contracts',
      'Data QA + reporting',
      'MLB Stats API + Baseball Savant',
    ],
  },
  {
    heading: 'Execution',
    items: [
      'Process improvement',
      'Cross-functional communication',
      'Microsoft Office + Teams',
      'Operational accuracy',
    ],
  },
];

const EVALUATION_PRINCIPLES = [
  {
    icon: '◉',
    title: 'Watch first',
    body: 'Evaluation starts with movement, mechanics, athleticism, body control, competitiveness, and projection.',
  },
  {
    icon: '📊',
    title: 'Use data to challenge',
    body: 'Tracking data and advanced metrics refine an observation; they do not replace the work of seeing and thinking clearly.',
  },
  {
    icon: '✓',
    title: 'Be honest about uncertainty',
    body: 'Missed evaluations are part of the process. Reviewing them is how a framework becomes more useful over time.',
  },
];

const EXPERIENCE = [
  {
    org: 'San Diego Padres',
    role: 'Operations Assistant',
    detail: 'Clubhouse operations, organizational events, transportation, and workflows, BATS, and video systems.',
  },
  {
    org: 'Arizona Fall League',
    role: 'Finance Associate',
    detail: 'Invoice accuracy, reimbursement visibility, Power BI dashboard organization for the MLB Office of the Commissioner.',
  },
  {
    org: 'Arizona Diamondbacks',
    role: 'Guest Relations Representative',
    detail: 'VIP services, ADA support, event operations, and guest experience, and 2023 World Series.',
  },
];

function ProfileStat({ label, value, sub, color = C.text }) {
  return (
    <div style={{ padding:'13px 14px', display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
      <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.text3 })}>{label}</div>
      <div style={px({ fontSize:20, fontWeight:800, color, lineHeight:1.1, overflowWrap:'anywhere' })}>{value}</div>
      {sub && <div style={sans({ fontSize:10, color:C.text3, overflowWrap:'anywhere' })}>{sub}</div>}
    </div>
  );
}

export default function AboutPage({ onNavigate }) {
  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <Breadcrumbs items={[{ label:'Overview', onClick:() => onNavigate?.('overview') }, { label:'About Lucas' }]} accent={C.rust} />
        <h1 style={sans({ fontSize:24, fontWeight:800, color:C.text, letterSpacing:'-.04em', lineHeight:1.1, margin:'3px 0 4px' })}>About the builder</h1>
        <div style={sans({ fontSize:11.5, color:C.text3 })}>Professional background, evaluation philosophy, and the work behind SKIP.</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, alignItems:'stretch' }}>
        <Panel title="Lucas Rumpler" accent={C.rust} badge="Baseball operations + scouting">
          <div style={{ padding:'14px' }}>
            <h2 style={sans({ fontSize:17, fontWeight:800, color:C.text, lineHeight:1.3, margin:'0 0 10px' })}>
              Building a better connection between scouting and analytics.
            </h2>
            <p style={sans({ fontSize:11.5, color:C.text2, lineHeight:1.6, margin:'0 0 10px' })}>
              I&rsquo;m Lucas Rumpler, a baseball operations and scouting professional with a B.A. in Business &amp; Statistics from Arizona State University. SKIP is my working attempt to bring the observations, data, context, and decision questions around a player into one place.
            </p>
            <p style={sans({ fontSize:11.5, color:C.text2, lineHeight:1.6, margin:'0 0 14px' })}>
              The platform is in development. Some phases run on live MLB Stats API and Baseball Savant data, while other tools are still being tested and refined.
            </p>
            {/* TODO: swap in the real LinkedIn profile URL */}
            <a href="#" target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', border:`1px solid ${C.tealMid}`, borderRadius:7, background:C.tealSoft, color:C.teal, textDecoration:'none', ...sans({ fontSize:11, fontWeight:700 }) }}>
              LinkedIn <span aria-hidden="true">↗</span>
            </a>
          </div>
        </Panel>

        <Panel title="Professional headshot" accent={C.amber}>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
            {/* TODO: replace with the real headshot asset (client/src/assets or similar) */}
            <div role="img" aria-label="Lucas Rumpler professional headshot placeholder" style={{
              width:'100%', aspectRatio:'4 / 3', borderRadius:8, background:`linear-gradient(135deg, ${C.surface3}, ${C.surface2})`,
              border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center',
              ...px({ fontSize:28, fontWeight:800, color:C.text4 }),
            }}>
              LR
            </div>
            <div style={px({ fontSize:9, color:C.text4, letterSpacing:'.04em' })}>LUCAS RUMPLER / PROFILE ASSET</div>
          </div>
        </Panel>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden', boxShadow:`0 8px 24px color-mix(in srgb, ${C.navy} 7%, transparent)` }}>
        <div style={{ borderRight:`0.5px solid ${C.borderLight}` }}><ProfileStat label="Education" value="ASU" sub="Business + Statistics" /></div>
        <div style={{ borderRight:`0.5px solid ${C.borderLight}` }}><ProfileStat label="Evaluation" value="SKIP" sub="Live data + original models" color={C.teal} /></div>
        <div><ProfileStat label="Contact" value="Email" sub="lukerumpler@gmail.com" /></div>
      </div>

      <Panel title="Core skills" accent={C.teal}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0 }}>
          {CORE_SKILLS.map((col, i) => (
            <div key={col.heading} style={{ padding:'12px 14px', borderRight: i < CORE_SKILLS.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
              <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:C.text3, marginBottom:8 })}>{col.heading}</div>
              <ul style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:6 }}>
                {col.items.map(item => (
                  <li key={item} style={{ display:'flex', alignItems:'flex-start', gap:6 }}>
                    <span aria-hidden="true" style={{ color:C.teal, fontSize:8, lineHeight:1.7 }}>●</span>
                    <span style={sans({ fontSize:11, color:C.text2, lineHeight:1.5 })}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start' }}>
        <Panel title="How I evaluate" accent={C.slate} badge="Process">
          <div style={{ display:'flex', flexDirection:'column' }}>
            {EVALUATION_PRINCIPLES.map((p, i) => (
              <div key={p.title} style={{ display:'flex', gap:10, padding:'11px 14px', borderBottom: i < EVALUATION_PRINCIPLES.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                <div aria-hidden="true" style={{ width:26, height:26, flexShrink:0, borderRadius:7, background:C.surface3, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:C.slate }}>{p.icon}</div>
                <div>
                  <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text, marginBottom:2 })}>{p.title}</div>
                  <div style={sans({ fontSize:10.5, color:C.text3, lineHeight:1.5 })}>{p.body}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Selected experience" accent={C.purple}>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {EXPERIENCE.map((e, i) => (
              <div key={e.org} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'11px 14px', borderBottom: i < EXPERIENCE.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                <div style={{ minWidth:0, flexShrink:0, width:150 }}>
                  <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>{e.org}</div>
                  <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.purple })}>{e.role}</div>
                </div>
                <div style={sans({ fontSize:10.5, color:C.text3, lineHeight:1.5, textAlign:'right' })}>{e.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 4px', ...px({ fontSize:9.5, color:C.text4 }) }}>
        <span aria-hidden="true" style={{ width:6, height:6, borderRadius:'50%', background:C.teal }} />
        <span>PROFILE · SKIP About</span>
        <span style={{ color:C.text4 }}>·</span>
        <span>Static profile view — no live provider polling on this page.</span>
      </div>
    </div>
  );
}
