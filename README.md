# MLB Terminal

An elite baseball intelligence platform built for modern scouting, player evaluation, analytics, projections, simulations, and front-office decision making.

Inspired by the visual and operational philosophies of:

- Baseball Savant
- MLB Stats API
- Vercel
- Next.js
- FastAPI

Repository:  
https://github.com/lukerumpler/mlb-terminal

---

# Overview

MLB Terminal is not designed to be a traditional sports dashboard.

It is designed as:

- a baseball intelligence operating system
- a front-office decision engine
- a scouting and analytics platform
- a tactical baseball operations terminal

The system combines:

- player evaluation
- Statcast analytics
- scouting intelligence
- AI-driven summaries
- projections
- simulations
- tactical matchup analysis
- GM / roster tools
- organizational intelligence systems

The design philosophy is heavily inspired by:

- Bloomberg Terminal
- Palantir
- military intelligence systems
- quantitative trading terminals
- MLB internal baseball operations software

The platform is intended to feel:

- elite
- dense
- operational
- real-time
- tactical
- analytical
- professional

---

# Core Philosophy

The platform is explicitly NOT:

- a fan website
- a fantasy-only application
- a public stat viewer
- a decorative dashboard
- a generic SaaS analytics UI

The system IS:

- a baseball intelligence platform
- a scouting engine
- a decision-support system
- a modular operations terminal
- a scalable analytics infrastructure

The foundational system rules include:

- no fabricated data
- percentile-driven analysis
- contextual metrics over raw numbers
- intelligence-first rendering
- tactical scouting presentation

---

# Feature Set

## Player Intelligence Profiles

Advanced player profile pages include:

- player identity systems
- team branding
- percentile dashboards
- KPI engines
- advanced Statcast metrics
- scouting reports
- projections
- AI-generated evaluations
- tactical analysis
- player comps
- contract valuation

Supported metrics include:

- xwOBA
- xBA
- xSLG
- Barrel%
- HardHit%
- Chase%
- Whiff%
- BB%
- K%
- Sprint Speed
- OAA
- EV
- WAR
- OPS+
- custom proprietary KPIs

---

## JARVIS Intelligence Engine

JARVIS is the platform’s AI-powered decision layer.

It transforms raw analytics into:

- scouting summaries
- player archetypes
- risk analysis
- recommendations
- valuation insights
- acquisition signals
- confidence scoring

Core outputs:

```js
JarvisOutput = {
  summary: "",
  archetype: "",
  strengths: [],
  risks: [],
  recommendation: "",
  confidence: ""
};

The platform integrates real Baseball Savant data instead of placeholder analytics.

Advanced Scouting Engine

The scouting layer includes:

vulnerability matrices
pitch-type attack systems
count matrices
zone heatmaps
arsenal tables
release-point analysis
pitch movement systems
biomechanical overlays
tactical matchup intelligence

The system is designed to answer:

What pitches beat this hitter?
Where are the damage zones?
What counts matter?
How should we attack this player?
KPI & Percentile Engine

The analytics engine prioritizes percentile-based intelligence over raw statistics.

Core KPIs include:

KPI	Meaning
CAS	Contact Authority Score
DQS	Decision Quality Score
DPI	Damage Potential Index
TPVI	True Player Value Index

Example formulas:

DQS = 0.5*BB + 0.3*K(inverted) + 0.2*CHASE(inverted)
DPI = 0.6*XSLG + 0.25*BARREL + 0.15*EV

Percentiles are treated as the primary evaluative layer.

Visual Design System

The MLB Terminal visual system combines:

dark operational themes
terminal-style interfaces
dense information presentation
tactical visual hierarchy
intelligence-grade layouts

The visual language is built around:

navy/black backgrounds
orange tactical highlights
heatmap-centric analysis
compact data tables
modular panel systems
scouting-grade visualization

The UI system emphasizes:

tactical readability
operational density
layered intelligence
rapid cognition
professional baseball workflows
Technology Stack
Frontend
Next.js
React
Tailwind CSS
Modular component architecture
App Router structure
Backend
FastAPI
Vercel serverless APIs
Redis caching
PostgreSQL
Precomputed profile pipelines
Data Sources
MLB Stats API
Baseball Savant
Deployment
Vercel
Architecture
CLIENT
  ↓
/api/mlb OR /api/savant
  ↓
PROCESSING LAYER
  ↓
ANALYTICS ENGINE
  ↓
JARVIS ENGINE
  ↓
UI RENDER ENGINE
Project Structure
mlb-terminal/

├── app/
│   ├── player/[id]/
│   ├── compare/
│   ├── gm/
│
├── components/
│   ├── core/
│   ├── profile/
│   ├── scouting/
│   ├── ai/
│   ├── gm/
│
├── engine/
│   ├── analytics.ts
│   ├── percentiles.ts
│   ├── kpis.ts
│   ├── insights.ts
│   ├── comps.ts
│
├── lib/
├── api/
├── styles/
└── public/
Core Systems
Analytics Engine

Transforms raw baseball data into:

percentiles
KPIs
intelligence signals
scouting grades
projections
player archetypes
Scouting System

Scouting visualization includes:

radar charts
percentile bars
attack zones
vulnerability matrices
pitch movement systems
swing path overlays
release-point maps
heatmaps
pitch tunnels
GM Mode

The platform includes a complete front-office simulation layer.

Capabilities include:

roster valuation
team strength estimation
trade simulation
season simulation
Monte Carlo projections
organizational analysis

Example:

function estimateWins(team){
  let base = 81;
  let offenseAdj = (team.offense - 50) * 0.6;
  let disciplineAdj = (team.discipline - 50) * 0.3;
  return Math.round(base + offenseAdj + disciplineAdj);
}
Strategy Engine

The strategy engine evaluates tactical baseball decisions using RE24 and run expectancy systems.

Supports:

bunt evaluation
matchup optimization
tactical recommendations
leverage analysis
run expectancy modeling

Example:

function runValue(oldRE, newRE, runs){
  return newRE - oldRE + runs;
}
Simulation Engine

Simulation systems include:

pitch-by-pitch simulations
at-bat simulations
season simulations
roster projections
probabilistic forecasting
Machine Learning Layer

Planned ML systems include:

projection models
player similarity embeddings
classification systems
archetype clustering
outcome prediction

Example use cases:

Top player comps
Prospect similarity
Projection forecasting
Risk classification
Database Design

Core schema includes:

players
player_stats
percentiles
pitch_events
milb_stats
fantasy_stats

Supports:

MLB
MiLB
prospects
fantasy systems
scouting systems
simulations
UI Philosophy

The platform should feel like:

an MLB war room
a scouting command center
a baseball operations terminal
an intelligence platform

The system prioritizes:

Information clarity
Tactical readability
Speed of cognition
Data density
Strategic awareness
Professional aesthetics

Avoided intentionally:

excessive whitespace
oversized cards
consumer sports aesthetics
generic SaaS design
fantasy-app styling
Current Goals
Phase 1
Core player profiles
Statcast integration
Savant data pipelines
UI framework
Phase 2
JARVIS intelligence engine
Scouting systems
KPI engine
Percentile systems
Phase 3
GM mode
Trade simulation
Strategy engine
Monte Carlo systems
Phase 4
MiLB integration
Prospect systems
Fantasy systems
Organizational intelligence
Long-Term Vision

The ultimate goal is to build:

A modern baseball operations operating system.

A platform capable of supporting:

scouts
analysts
player development staff
coaches
front-office executives
fantasy analysts
baseball researchers

The platform aims to combine:

analytics
scouting
simulations
machine learning
tactical strategy
visualization
baseball intelligence

into a single modular ecosystem.

Development Philosophy

Core development rules:

build modularly
precompute aggressively
cache intelligently
optimize continuously
prioritize information density
build systems, not pages

Workflow:

FEATURE → MODULE → ENGINE → UI

Always:

build small modules
test in isolation
iterate quickly

Never:

build monolithic systems
overload live requests
compute expensive logic repeatedly
Performance Philosophy

The platform is optimized around:

Precompute → Cache → Return JSON

Cache layers include:

Memory cache
Session storage
CDN edge cache
Optional Redis
Inspiration

Primary inspirations include:

Baseball Savant
FanGraphs
Bloomberg Terminal
Palantir
MLB internal systems
Tactical intelligence dashboards
Quantitative trading software
License

MIT License

Author

Luke Rumpler

GitHub:
https://github.com/lukerumpler

Project:
https://github.com/lukerumpler/mlb-terminal
