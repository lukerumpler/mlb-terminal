# Visual Design Patterns & Component Guide

## 🎨 Color Palette Reference

```
Primary Colors:
┌─ Orange (#e8722a)        Action, highlights, active states
│  └─ Orange Dim (rgba...) Hover backgrounds, tints
│
Secondary Colors:
├─ Blue Bright (#5ab4f5)   Statcast data, secondary info
├─ Green (#4dce8a)         Live, success, positive
├─ Red (#e85a5a)           Warnings, negative
└─ Gold (#f5c842)          Top-tier, premium

Neutral Colors:
├─ Navy (#07102d)          Main background
├─ Navy Mid (#0d1c3a)      Card backgrounds
├─ Navy Light (#0f2040)    Hover states
├─ Navy Border (#1e3055)   Divider lines
└─ Text Dim (#a0b4cc)      Labels, muted text
```

---

## 📐 Spacing System

```
Padding Scale:
  4px  → Small inline padding
  7px  → Badge padding
  8px  → Input/button padding
  9px  → Compact spacing
  12px → Standard cell padding
  14px → Content gaps
  16px → Stat cell padding
  18px → Card spacing
  20px → Section padding
  22px → Panel padding (horizontal)
  24px → Panel padding (horizontal+vertical)

Gap Scale:
  4px   → Inline elements
  7px   → Team chips
  9px   → Tab items
  14px  → Quick stat cells
  18px  → Panel columns
```

---

## 🏗️ Header Layout

```
┌───────────────────────────────────────────────────────────────┐
│  2026 SEASON                                   [LIVE] [SEARCH] │
│  MLB INTELLIGENCE [JARVIS]                     [LOAD]          │
└───────────────────────────────────────────────────────────────┘

Components:
- Logo block (left): Season label + gradient title + v-badge
- Live badge (right): Green dot + "LIVE DATA"
- Search wrap: Input .tpick + dropdown #psearch-results
- Refresh button: .refresh-btn
```

---

## 📑 Tab System

```
┌─ OVERVIEW | BATTING | ADVANCED | SCOUTING | GAMELOG | ━ | TEAM ─┐
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

.tab = inactive (gray text, transparent bottom)
.tab.on = active (orange text, orange border-bottom)
.tab-divider = vertical separator line
```

---

## 👤 Hero Card

```
┌─────────────────────────────────────────────────────────────────┐
│ [90x90]  │  SELECT A PLAYER                                     │
│  PHOTO   │  PLAYER NAME                                         │
│          │  POS | AGE 30 | B/T: L/R                            │
└─────────────────────────────────────────────────────────────────┘

.hero = card container
.hero-photo = 90x90 rounded image
.hero-bio = flex:1 text area
  .hero-team = orange label
  .hero-name = large Bebas name
  .hero-meta = small details
```

---

## 📊 Quick Stats (4-Column)

```
┌──────────┬──────────┬──────────┬──────────┐
│   AVG    │    HR    │   RBI    │   OPS    │
│          │          │          │          │
│  .000    │     0    │     0    │  .000    │
│          │          │          │          │
└──────────┴──────────┴──────────┴──────────┘

.qs-grid = grid-template-columns: repeat(4, 1fr)
.qs-cell = individual card
  .qs-label = 10px uppercase label (gray)
  .qs-val = 48px bold value (Bebas Neue)
```

---

## 📈 Advanced Stats (2-Column)

```
┌──────────────────────────┬──────────────────────────┐
│        xwOBA             │      Exit Velo           │
│        .380              │      92.4 mph            │
│        (orange rank)     │      (rank info)         │
├──────────────────────────┼──────────────────────────┤
│      Barrel %            │      HardHit %           │
│       12.5%              │       45.2%              │
│       (rank info)        │       (rank info)        │
└──────────────────────────┴──────────────────────────┘

.stat-grid = 2-column layout
.stat-cell = individual stat
  .stat-label = 11px uppercase (gray)
  .stat-val = 52px large (Bebas Neue) - LARGER than quick stats
  .stat-rank = small orange text below
```

---

## 🏷️ Panel Card

```
┌─────────────────────────────────────────────────────────────┐
│  SEASON STATS                        [2026 badge] │
│  ────────────────────────────────────────────────────────── │
│  STAT              VALUE                RANK              │
│  ────────────────────────────────────────────────────────── │
│  Games              125                  —               │
│  At Bats            445                  —               │
│  ...                                                       │
└─────────────────────────────────────────────────────────────┘

.panel = card container
  .panel-title = section header with optional badge
  .pt-badge = orange status badge
  .tbl = table for organized data
```

---

## 🎪 Team Picker

```
┌─────────────────────────────────────────────────────────────┐
│  AL EAST                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ BAL         │  │ BOS         │  │ NYY         │         │
│  │ Baltimore   │  │ Boston      │  │ New York    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  AL CENTRAL                                                 │
│  ┌─────────────┐  ┌─────────────┐  ...                     │
│  └─────────────┘  └─────────────┘                          │
│                                                             │
│  ... (AL WEST, NL EAST, NL CENTRAL, NL WEST)              │
└─────────────────────────────────────────────────────────────┘

.team-picker-grid = auto-fill grid (minmax 130px)
.div-label = division header (AL East, NL Central, etc)
.team-chip = individual team button
  .team-abbr = orange team code (Bebas Neue)
  .team-city = city name (small gray)
  :hover = orange tint background
  .selected = orange border + background
```

---

## 🚨 Flag Card

```
┌─────────────────────────────────────────┐
│ 🔥  Elite xwOBA                         │
│     .380 xwOBA ranks in top tier...     │
├─────────────────────────────────────────┤
│ 💥  Hard Contact Machine                │
│     92 mph average exit velocity.       │
├─────────────────────────────────────────┤
│ 📈  Due For Regression Up               │
│     xBA is .020 above actual BA...      │
└─────────────────────────────────────────┘

.flag-card = flex container
.flag-icon = large emoji/icon
.flag-title = bold text
.flag-desc = smaller muted text
```

---

## 🔍 Search Results

```
Input: [🔍 Search any MLB player...]

Dropdown below:
┌──────────────────────────────────────┐
│ [Photo] Juan Soto               [C]  │  ← sr-item
│         Washington               Nationals          │
├──────────────────────────────────────┤
│ [Photo] Francisco Soto          [SS] │
│         Houston                 Astros             │
├──────────────────────────────────────┤
│ 2 results · ↑↓ navigate · Enter      │
└──────────────────────────────────────┘

.psearch-wrap = relative container
input.tpick = styled input
#psearch-results = absolute dropdown
  .sr-item = result row
    [photo] [name] [pos]
  .sr-pos = position badge
```

---

## 📋 Table Row

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ STAT         │ VALUE        │ RANK         │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Games        │ 125          │ —            │ :hover       │
│ At Bats      │ 445          │ —            │ slight bg    │
│ Hits         │ 145          │ —            │ change       │
└──────────────┴──────────────┴──────────────┴──────────────┘

.tbl = full width
.tbl th = header row (uppercase, small text)
.tbl td = data cells
.tbl tr:hover = background tint on hover
```

---

## 🎯 Button States

```
Normal:
┌─────────────────┐
│  LOAD PLAYER    │ Dark bg, gray text
└─────────────────┘

Hover:
┌─────────────────┐
│  LOAD PLAYER    │ Orange bg, white text
└─────────────────┘

.refresh-btn = styled button
  background: navy-mid
  border: subtle
  color: text-dim
  transition: .2s
  :hover → orange bg, white text
```

---

## 🏢 Full Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ .hdr (sticky top)                                       │
│  Header with logo, search, buttons                      │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ .tabs-wrap                                              │
│  OVERVIEW | BATTING | ADVANCED | SCOUTING | ... | TEAM │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ .body                                                   │
│  .pg.on (current page visible)                          │
│   ┌─────────────────────────────────────────────────┐  │
│   │ .hero (player photo + name + meta)              │  │
│   ├─────────────────────────────────────────────────┤  │
│   │ .qs-grid (4 quick stats)                        │  │
│   ├─────────────────────────────────────────────────┤  │
│   │ .grid2 (season stats | flags)                   │  │
│   └─────────────────────────────────────────────────┘  │
│                                                         │
│  .pg (other pages hidden)                              │
│   (batting, advanced, scouting, gamelog, team)         │
└─────────────────────────────────────────────────────────┘

Z-index layering:
0 = body::before (grid overlay)
1 = .body, .tabs-wrap
100 = .hdr (sticky)
200 = dropdowns (#psearch-results)
```

---

## 📱 Responsive Transformations

### Desktop (1200px+)
```
.qs-grid: 4 columns
.grid2: 1fr 1fr (two columns)
.grid3: 1fr 1fr 1.1fr (three columns)
.team-picker-grid: full expansion
```

### Tablet (900-1199px)
```
.qs-grid: 2 columns
.grid2: 1fr (single column)
.grid3: 1fr (single column)
.team-picker-grid: still flexible
```

### Mobile (<600px)
```
.qs-grid: 1fr (single column)
.grid2: 1fr (single column)
All panels: 1fr
.body: 12px padding (vs 20px)
.stat-val: 42px (vs 52px)
.qs-val: 36px (vs 48px)
```

---

## ✨ Typography Examples

```
Hero Name:
  font-family: Bebas Neue
  font-size: 40px
  letter-spacing: 3px
  Result: "JUAN SOTO"

Panel Title:
  font-family: Bebas Neue
  font-size: 28px
  letter-spacing: 3px
  Result: "SEASON STATS"

Quick Stat Value:
  font-family: Bebas Neue
  font-size: 48px
  letter-spacing: 1px
  Result: ".345"

Advanced Stat Value:
  font-family: Bebas Neue
  font-size: 52px ← LARGER
  letter-spacing: 1px
  Result: ".380"

Label (uppercase):
  font-family: Barlow Condensed
  font-size: 10-11px
  font-weight: 700
  letter-spacing: 2px
  text-transform: uppercase
  Result: "AVG" or "XWOBA"

Body Text:
  font-family: Barlow
  font-size: 12-13px
  font-weight: 400-500
  Result: "This is normal body text"
```

---

## 🎯 Hover & Active States

```
.tab (inactive):
  color: var(--text-dim)
  border-bottom: transparent
  
.tab:hover:
  color: #fff
  border-bottom: rgba(255,255,255,.15)
  
.tab.on (active):
  color: var(--orange)
  border-bottom: var(--orange)

.team-chip:
  background: rgba(13,28,58,.7)
  border: 1px solid rgba(255,255,255,.1)
  
.team-chip:hover:
  background: rgba(232,114,42,.15)
  border-color: rgba(232,114,42,.4)
  
.team-chip.selected:
  background: rgba(232,114,42,.2)
  border-color: var(--orange)

.refresh-btn:
  background: rgba(13,28,58,.6)
  border: 1px solid rgba(255,255,255,.1)
  
.refresh-btn:hover:
  background: rgba(232,114,42,.18)
  border-color: var(--orange)
  color: #fff
```

---

## 🎬 Animations

```
Live Dot Pulse:
@keyframes livepulse {
  0%, 100%: opacity 1, scale 1
  50%: opacity .3, scale .8
  duration: 1.5s infinite
}

Smooth Transitions:
- All state changes: 0.2s
- Button hovers: 0.15s smooth
- Tab changes: 0.2s smooth
- Color changes: use transition: all 0.2s
```

---

## 📐 Grid Gaps & Spacing

```
Component Gaps:
  .qs-grid: 14px (quick stats)
  .grid2: 18px (columns)
  .grid3: 18px (columns)
  .team-picker-grid: 7px (chips)
  .stat-grid: 0 (bordered cells)

Component Padding:
  .hdr: 12px (top/bottom), 24px (left/right)
  .panel: 22px (top/bottom), 24px (left/right)
  .qs-cell: 18px (top/bottom), 12px (left/right)
  .hero: 20px (top/bottom), 24px (left/right)
  
Internal Spacing:
  .hero-meta: gap 14px
  .flag-card: gap 12px
  .team-chip: gap 8px
  .hdr-right: gap 9px
```

---

**This visual guide should help understand the layout, spacing, and component organization of the redesigned website. All measurements are in pixels (px) and all colors are defined in CSS variables for easy customization.**
