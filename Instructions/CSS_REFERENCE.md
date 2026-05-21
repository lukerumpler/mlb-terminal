# v11 Design System — CSS Reference Guide

This document outlines all CSS classes and their usage for the MLB Intelligence Terminal redesign.

---

## 🎨 Color Variables

```css
:root {
  /* Primary Colors */
  --orange: #e8722a;
  --orange-dim: rgba(232, 114, 42, 0.15);
  
  /* Secondary Colors */
  --blue-bright: #5ab4f5;
  --green: #4dce8a;
  --red: #e85a5a;
  --gold: #f5c842;
  
  /* Neutral Colors */
  --navy: #07102d;
  --navy-mid: #0d1c3a;
  --navy-light: #0f2040;
  --navy-border: #1e3055;
  --text-dim: #a0b4cc;
}
```

**Usage:**
- `--orange`: Action buttons, active states, highlights
- `--orange-dim`: Hover backgrounds, subtle accents
- `--blue-bright`: Secondary data (Statcast), info badges
- `--green`: Success messages, live indicators, active dots
- `--red`: Warnings, negative indicators
- `--gold`: Top-tier achievements, premium highlights
- `--text-dim`: Muted text, labels, helper text
- `--navy-*`: Background colors at different depths

---

## 🏗️ Layout Components

### Header
```css
.hdr {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(3, 8, 20, 0.95);
  border-bottom: 2px solid rgba(232, 114, 42, 0.35);
  backdrop-filter: blur(18px);
  padding: 12px 24px;
}

.hdr-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.hdr-right {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
```

**Key Properties:**
- Sticky positioning keeps header in view when scrolling
- Backdrop blur creates glass effect
- Flex layout ensures responsive alignment

### Tab Bar
```css
.tabs-wrap {
  background: rgba(3, 8, 20, 0.72);
  border-bottom: 1px solid var(--navy-border);
  overflow-x: auto;
  position: relative;
  z-index: 1;
}

.tabs {
  display: flex;
  min-width: max-content;
  padding: 0 4px;
}

.tab {
  padding: 12px 16px;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  cursor: pointer;
  border-bottom: 3px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
}

.tab.on {
  color: var(--orange);
  border-bottom-color: var(--orange);
}

.tab:hover:not(.on) {
  color: #fff;
  border-bottom-color: rgba(255, 255, 255, 0.15);
}

.tab-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 9px 4px;
  flex-shrink: 0;
}
```

**Key Properties:**
- `.tab.on` shows orange underline for active state
- Smooth transitions for hover/active effects
- Divider creates visual separation

### Page Container
```css
.body {
  padding: 20px 22px;
  position: relative;
  z-index: 1;
  max-width: 1800px;
  margin: 0 auto;
}

.pg {
  display: none;
}

.pg.on {
  display: block;
}
```

**Key Properties:**
- Max-width centers content on wide screens
- Z-index layering ensures proper stacking
- `.pg.on` shows only active page

---

## 🎭 Panel & Card Components

### Panel
```css
.panel {
  background: rgba(6, 14, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 20px;
  padding: 22px 24px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
}

.panel-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 28px;
  letter-spacing: 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 12px;
  margin-bottom: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pt-badge {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--orange);
}
```

**Usage:**
- `.panel`: Container for any grouped content section
- `.panel-title`: Section heading with optional badge
- `.pt-badge`: Status badge (e.g., "2026", "LIVE")

### Hero Card
```css
.hero {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
  background: rgba(6, 14, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 20px;
  margin-bottom: 18px;
  backdrop-filter: blur(12px);
}

.hero-photo {
  width: 90px;
  height: 90px;
  border-radius: 16px;
  object-fit: cover;
  background: rgba(13, 28, 58, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

.hero-bio {
  flex: 1;
  min-width: 0;
}

.hero-team {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--orange);
  margin-bottom: 4px;
}

.hero-name {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 40px;
  letter-spacing: 3px;
  line-height: 1;
}

.hero-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 8px;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 600;
  letter-spacing: 1px;
}
```

**Usage:**
- `.hero`: Featured player display at top of overview
- `.hero-photo`: Player headshot image
- `.hero-name`: Large, prominent player name
- `.hero-meta`: Supporting info (position, age, handedness)

---

## 📊 Stat Components

### Quick Stats Grid (4-column)
```css
.qs-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.qs-cell {
  background: rgba(6, 14, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  padding: 18px 12px;
  text-align: center;
  backdrop-filter: blur(12px);
}

.qs-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.qs-val {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 48px;
  line-height: 1;
  letter-spacing: 1px;
}
```

**Usage:**
- `.qs-grid`: Container for 4 quick stat cells
- `.qs-val`: Large stat values (AVG, HR, RBI, OPS)
- **Responsive:** Collapses to 2-col on tablets, 1-col on mobile

### Stat Grid (2-column Advanced)
```css
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.stat-cell {
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 16px 12px;
}

.stat-cell:nth-child(odd) {
  border-right: 1px solid rgba(255, 255, 255, 0.07);
}

.stat-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 4px;
  text-align: center;
}

.stat-val {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 52px;
  line-height: 1;
  letter-spacing: 1px;
  color: #fff;
  text-align: center;
}

.stat-rank {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--orange);
  margin-top: 3px;
  text-align: center;
}

.stat-rank.blue {
  color: var(--blue-bright);
}
```

**Usage:**
- `.stat-grid`: 2-column layout for advanced metrics
- `.stat-val`: Large 52px values (xwOBA, Exit Velo, etc.)
- `.stat-rank`: Optional ranking below each stat
- **Note:** Larger than `.qs-val` (52px vs 48px)

---

## 📋 Table Components

### Standard Table
```css
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tbl th {
  text-align: left;
  padding: 8px 10px;
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--navy-border);
  font-family: 'Barlow Condensed', sans-serif;
}

.tbl td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 13px;
}

.tbl tr:last-child td {
  border-bottom: none;
}

.tbl tr:hover td {
  background: rgba(255, 255, 255, 0.03);
}
```

**Usage:**
- `.tbl`: Any tabular data display
- Headers: Uppercase with letter-spacing
- Rows: Subtle hover effect

---

## 🎪 Specialty Components

### Team Picker Grid
```css
.team-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 7px;
}

.team-chip {
  background: rgba(13, 28, 58, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  padding: 9px 12px;
  font-family: 'Barlow Condensed', sans-serif;
  text-align: left;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-chip:hover {
  background: rgba(232, 114, 42, 0.15);
  border-color: rgba(232, 114, 42, 0.4);
}

.team-chip.selected {
  background: rgba(232, 114, 42, 0.2);
  border-color: var(--orange);
}

.team-abbr {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  color: var(--orange);
  min-width: 34px;
}

.team-city {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.3;
}

.div-label {
  grid-column: 1 / -1;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding-bottom: 5px;
  margin-top: 10px;
}
```

**Usage:**
- `.team-picker-grid`: Container for team selection chips
- `.div-label`: Division headers (AL East, NL Central, etc.)
- `.team-chip`: Individual team selector with hover/selected states

### Flag Cards
```css
.flag-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(13, 28, 58, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  margin-bottom: 8px;
}

.flag-card:last-child {
  margin-bottom: 0;
}

.flag-icon {
  font-size: 22px;
  flex-shrink: 0;
  margin-top: 1px;
}

.flag-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 3px;
}

.flag-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.4;
}
```

**Usage:**
- `.flag-card`: Intelligence insight or warning card
- `.flag-icon`: Emoji or icon for visual interest
- `.flag-title`: Main message
- `.flag-desc`: Detailed description

### Search Input
```css
.psearch-wrap {
  position: relative;
}

input.tpick {
  background: rgba(13, 28, 58, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: #fff;
  padding: 8px 14px;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: text;
  outline: none;
  min-width: 200px;
}

input.tpick::placeholder {
  color: var(--text-dim);
}

input.tpick:focus {
  border-color: var(--orange);
}

#psearch-results {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #0d1c3a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  z-index: 200;
  max-height: 280px;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}

#psearch-results .sr-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: background 0.12s;
}

#psearch-results .sr-item:hover {
  background: rgba(232, 114, 42, 0.15);
}

#psearch-results .sr-pos {
  font-size: 10px;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.07);
  padding: 2px 7px;
  border-radius: 4px;
}
```

**Usage:**
- `.tpick`: Styled input field (used for search)
- `.sr-item`: Search result dropdown items
- Smooth transitions and proper z-index for dropdown

---

## 📐 Layout Grids

### 2-Column Grid
```css
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
```

### 3-Column Grid
```css
.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1.1fr;
  gap: 18px;
}
```

**Responsive:**
```css
@media (max-width: 900px) {
  .grid2, .grid3 {
    grid-template-columns: 1fr;
  }
  
  .qs-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .body {
    padding: 12px;
  }
  
  .tab {
    padding: 9px 11px;
    font-size: 9px;
  }
  
  .stat-val {
    font-size: 42px;
  }
  
  .qs-val {
    font-size: 36px;
  }
}
```

---

## ✨ Visual Effects

### Live Dot Animation
```css
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: livepulse 1.5s infinite;
}

@keyframes livepulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.3;
    transform: scale(0.8);
  }
}
```

### Gradient Text
```css
.dash-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  letter-spacing: 3px;
  line-height: 1;
  background: linear-gradient(135deg, #fff 40%, #e8722a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Background Grid
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}
```

---

## 🎓 Common Patterns

### Centered Stat Value
```css
.stat-val {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 48px; /* or 52px for larger */
  line-height: 1;
  letter-spacing: 1px;
  color: #fff;
  text-align: center;
}
```

### Uppercase Label
```css
.stat-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
}
```

### Card with Glass Effect
```css
.card {
  background: rgba(6, 14, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 20px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
}
```

### Subtle Hover Effect
```css
.interactive {
  transition: all 0.15s ease;
}

.interactive:hover {
  background: rgba(255, 255, 255, 0.03);
  transform: translateY(-2px);
}
```

---

## 📝 Notes

- All measurements use `px` for consistency
- Colors use CSS variables for easy theming
- Font families are web-safe (Google Fonts)
- Transitions are kept under 250ms for snappy feel
- Z-index layers: header (100), dropdowns (200), others (1)
- Gap between grid items: 14-18px standard
- Padding consistency: 12px small, 22px/24px large

---

## 🔗 Quick Links

- **Colors**: Use CSS variables (`--orange`, `--blue-bright`, etc.)
- **Fonts**: Bebas Neue (display), Barlow Condensed (labels), Barlow (body)
- **Spacing**: 14px gaps between items, 20px padding in body, 22px in panels
- **Responsive**: Always include tablet and mobile breakpoints
- **Effects**: Backdrop blur for glass, subtle shadows for depth

