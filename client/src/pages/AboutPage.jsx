import React from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel } from '../components/atoms.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

// Profile links and image are statically configured for this profile page.
const LINKEDIN_URL = 'https://www.linkedin.com/in/lucasrumpler/';
const HEADSHOT_SRC = '/headshot.jpg';

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
      'Excel + Power BI',
      'Contract + draft projection',
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
    detail: 'Spring Training operations with the \u201cTodd Squad\u201d: clubhouse, transportation, and events, plus Excel pitching-evaluation data and exposure to Video Operations (BATS).',
  },
  {
    org: 'Arizona Fall League',
    role: 'Finance & Business Development Associate',
    detail: 'Worked under the league director through MLB\u2019s Office of the Commissioner: invoices, reimbursements, a Power BI spending dashboard, and 2023\u201325 budget analysis for 2026.',
  },
  {
    org: 'Arizona State Baseball',
    role: 'Student Manager (Division I)',
    detail: 'Practice and game support, plus pitch tracking and camera setup with Synergy and Yakkertech.',
  },
  {
    org: 'Arizona Diamondbacks',
    role: 'Guest Relations Representative',
    detail: 'Chase Field guest relations and ADA services; 2024 Guest Relations Rookie of the Year; worked the 2023 World Series.',
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

// Only a real https URL turns the button on; anything else (empty, '#', a typo'd
// scheme) renders nothing instead of a dead or unsafe link.
export function isUsableProfileUrl(value) {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AboutPage({ onNavigate, linkedInUrl = LINKEDIN_URL, headshotSrc = HEADSHOT_SRC }) {
  const showLinkedIn = isUsableProfileUrl(linkedInUrl);
  return (
    <div className="page-enter" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <Breadcrumbs items={[{ label:'Overview', onClick:() => onNavigate?.('overview') }, { label:'About Lucas' }]} accent={C.rust} />
        <h1 style={sans({ fontSize:24, fontWeight:800, color:C.text, letterSpacing:'-.04em', lineHeight:1.1, margin:'3px 0 4px' })}>About the builder</h1>
        <div style={sans({ fontSize:11.5, color:C.text3 })}>Professional background, evaluation philosophy, and the work behind SKIP.</div>
      </div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'stretch' }}>
        <div style={{ flex:'2 1 340px', minWidth:0 }}><Panel title="Lucas Rumpler" accent={C.rust} badge="Baseball operations + scouting">
          <div style={{ padding:'14px' }}>
            <h2 style={sans({ fontSize:17, fontWeight:800, color:C.text, lineHeight:1.3, margin:'0 0 10px' })}>
              Building a better connection between scouting and analytics.
            </h2>
            <p style={sans({ fontSize:11.5, color:C.text2, lineHeight:1.6, margin:'0 0 10px' })}>
              I&rsquo;m Lucas Rumpler, a baseball operations and scouting professional with a B.A. in Business &amp; Statistics from Arizona State University. I&rsquo;ve worked inside baseball for several years, from Spring Training operations with the Padres and finance for the Arizona Fall League to pitch tracking with ASU&rsquo;s Division I team. Along the way I started grading players every time I watched.
            </p>
            <p style={sans({ fontSize:11.5, color:C.text2, lineHeight:1.6, margin:'0 0 10px' })}>
              SKIP is my attempt to put the observations, data, context, and decision questions around a player in one place. It runs on live MLB Stats API and Baseball Savant data, and layers on original tools like the SKIP Score and AMD / IMD swing metrics. It is a working beta: trade simulation, scouting reports, and user accounts are still in progress.
            </p>
            <p style={sans({ fontSize:11.5, color:C.text2, lineHeight:1.6, margin:'0 0 14px' })}>
              Outside SKIP, I build my own 2026 MLB Draft board and project free-agent contracts, then compare both against what actually happened. My blended contract projections came within $5M AAV on 84% of 171 signings, and I keep the misses because they teach me the most.
            </p>
            {showLinkedIn && (
              <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', border:`1px solid ${C.tealMid}`, borderRadius:7, background:C.tealSoft, color:C.teal, textDecoration:'none', ...sans({ fontSize:11, fontWeight:700 }) }}>
                LinkedIn <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </Panel></div>

        <div style={{ flex:'1 1 200px', minWidth:0 }}><Panel title="Professional headshot" accent={C.amber}>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
            {headshotSrc ? (
              <img src={headshotSrc} alt="Lucas Rumpler" style={{ width:'100%', aspectRatio:'4 / 5', objectFit:'cover', borderRadius:8, border:`1px solid ${C.border}` }} />
            ) : (
            <div role="img" aria-label="Lucas Rumpler professional headshot placeholder" style={{
              width:'100%', aspectRatio:'4 / 3', borderRadius:8, background:`linear-gradient(135deg, ${C.surface3}, ${C.surface2})`,
              border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center',
              ...px({ fontSize:28, fontWeight:800, color:C.text4 }),
            }}>
              LR
            </div>
            )}
            <div style={px({ fontSize:9, color:C.text4, letterSpacing:'.04em' })}>LUCAS RUMPLER / PROFILE ASSET</div>
          </div>
        </Panel></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden', boxShadow:`0 8px 24px color-mix(in srgb, ${C.navy} 7%, transparent)` }}>
        <div style={{ borderRight:`0.5px solid ${C.borderLight}` }}><ProfileStat label="Education" value="ASU" sub="Business + Statistics" /></div>
        <div style={{ borderRight:`0.5px solid ${C.borderLight}` }}><ProfileStat label="FA projections" value="$3.7M" sub="Avg AAV error · 171 signings" color={C.teal} /></div>
        <div><ProfileStat label="Contact" value="Email" sub="lukerumpler@gmail.com" /></div>
      </div>

      <Panel title="Core skills" accent={C.teal}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:0 }}>
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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:12, alignItems:'start' }}>
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
              <div key={e.org} style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:'4px 12px', padding:'11px 14px', borderBottom: i < EXPERIENCE.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
                <div style={{ minWidth:0, flex:'0 0 160px' }}>
                  <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>{e.org}</div>
                  <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.purple })}>{e.role}</div>
                </div>
                <div style={sans({ fontSize:10.5, color:C.text3, lineHeight:1.5, flex:'1 1 180px' })}>{e.detail}</div>
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
