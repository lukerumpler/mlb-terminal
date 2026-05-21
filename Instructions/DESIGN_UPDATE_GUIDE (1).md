# MLB Intelligence Terminal — v11 Design System Update

## 🎨 Overview of Changes

Your website has been **completely redesigned to match v11.html's visual language**. The update maintains all functionality while dramatically improving visual consistency, hierarchy, and polish.

---

## ✨ Major Visual Improvements

### 1. **Header Design**
- **Gradient wordmark**: "MLB INTELLIGENCE TERMINAL" now uses v11's gradient effect (white → orange)
- **Sticky positioning**: Header stays at top with blur backdrop (backdrop-filter: blur(18px))
- **v-badge**: Version badge styled exactly like v11 (orange with orange border)
- **Live indicator**: Green pulsing dot with "LIVE DATA" label
- **Player search**: Styled as `.tpick` input matching the team picker aesthetic

### 2. **Tab System**
- **Div-based tabs**: Switched from `<button>` to `<div class="tab">` elements
- **Active indicator**: Orange underline (border-bottom) on active tab
- **Tab divider**: Subtle separator before the "Team" tab (using `.tab-divider`)
- **Typography**: Bebas Neue / Barlow Condensed with proper letter-spacing

### 3. **Quick Stats Grid** (4-column layout)
```
AVG  |  HR  |  RBI  |  OPS
────────────────────────────
.000 |  0   |   0   | .000
```
- Uses **Bebas Neue 48px** font for values (same as v11)
- **4-column layout** instead of previous structure
- Responsive: collapses to 2-col on tablets, 1-col on mobile
- Cards have `.qs-cell` styling with rounded corners and subtle borders

### 4. **Panels & Cards**
- **Rounded corners**: 20px border-radius (vs. 14px before)
- **Backdrop blur**: Enhanced glass-morphism with blur(12px)
- **Border styling**: Subtle rgba(255,255,255,.09) for consistency
- **Panel titles**: Bebas Neue 28px with orange divider line below

### 5. **Stat Grids** (2-column Advanced Metrics)
- **52px Bebas Neue** font for stat values (matching v11's offense/pitching panels)
- **Centered layout** with borders creating visual cells
- **Label + Value + Rank** structure for each stat
- Perfect for advanced metrics display

### 6. **Team Picker**
- **Division-grouped layout**: Teams organized by AL/NL divisions
- **Team chips**: Hover effect with orange background tint
- **Selected state**: Orange border + background
- **Responsive grid**: Auto-fills with 130px min-width chips

### 7. **Color System**
```css
--orange: #e8722a          /* Primary action color */
--orange-dim: rgba(232,114,42,.15)  /* Hover tint */
--blue-bright: #5ab4f5     /* Secondary accent */
--green: #4dce8a           /* Success/live indicator */
--red: #e85a5a             /* Negative/warning *)
--gold: #f5c842            /* Top-tier highlight *)
--navy: #07102d            /* Dark background *)
--text-dim: #a0b4cc        /* Muted text *)
```

---

## 🔧 Technical Fixes

### API Proxy (mlb.js)
The MLB API proxy now properly handles complex hydrate parameters:

**Before (broken):**
```javascript
// Would double-encode special characters
fetch(`/api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting)`)
// Result: hydrate=stats%28type%3Dseason%2Cgroup%3Dhitting%29 ❌
```

**After (fixed):**
```javascript
// Forwards raw query string, preserving special characters
fetch(`/api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting)`)
// Result: hydrate=stats(type=season,group=hitting) ✅
```

The fix: Extract path, filter out path= from remaining params, forward everything raw.

### Team Stats Endpoint
Team statistics now use the correct `/teams/{id}/stats` endpoint instead of hydrate params:

```javascript
// Hitting stats
/api/mlb?path=/teams/114/stats&group=hitting&season=2026&stats=season&gameType=R

// Pitching stats
/api/mlb?path=/teams/114/stats&group=pitching&season=2026&stats=season&gameType=R
```

This eliminates the `500 Internal Server Error` you were seeing.

---

## 📁 File Structure

```
/outputs/
├── index.html          ← Main shell (100% rewritten for v11 design)
├── player.js           ← Player logic (unchanged, works as-is)
├── ui.js              ← UI helpers (keyboard shortcuts, tab switching)
├── data.js            ← Data utilities (empty, ready for expansion)
├── mlb.js             ← API proxy (FIXED: handles hydrate params correctly)
└── savant.js          ← Statcast data fetcher (serverless function)
```

---

## 🚀 Deployment Instructions

### Step 1: Replace HTML
```bash
# Copy updated index.html to your web root
cp index.html /path/to/public/index.html
```

### Step 2: Update API Endpoint (Vercel)
If using Vercel:
```bash
# Update /api/mlb.js with the fixed version
cp mlb.js /path/to/api/mlb.js

# Redeploy
vercel deploy
```

### Step 3: Check JavaScript Paths
In `index.html`, make sure these script references match your structure:
```html
<script src="js/data.js"></script>
<script src="js/player.js"></script>
<script src="js/ui.js"></script>
```

If your files are in a different location, update these paths.

### Step 4: Test Player Search
1. Search for a player (e.g., "Juan Soto")
2. Verify the 4-column quick stats display
3. Check team tab loads standings/roster/stats
4. Confirm no 500 errors in the console

---

## 📊 Layout Changes by Page

### Overview Tab
```
┌─ Hero (Photo + Bio) ─────────────────┐
├─ Quick Stats (4-column grid) ────────┤
├─ Season Stats │ Intelligence Flags ──┤
└──────────────────────────────────────┘
```

### Batting Tab
```
┌─ Career Batting Table ──────────────────┐
│ (Year, G, AB, H, 2B, HR, RBI, etc.) │
└─────────────────────────────────────────┘
```

### Advanced Tab
```
┌─ Advanced Metrics (Statcast) ────────┐
│ (xwOBA, Exit Velo, Barrel %, etc.) │
└──────────────────────────────────────┘
```

### Team Tab
```
┌─ Team Picker (Division Groups) ──────┐
├─ Standings │ Team Offense ───────────┤
├─ Active Roster ──────────────────────┤
├─ Team Pitching ──────────────────────┤
└──────────────────────────────────────┘
```

---

## 🎯 Key CSS Classes (Reference)

| Class | Purpose |
|-------|---------|
| `.hdr` | Sticky header |
| `.tab` / `.tab.on` | Tab buttons |
| `.panel` | Card container |
| `.qs-grid` | 4-column quick stats |
| `.qs-val` | 48px stat value (Bebas Neue) |
| `.stat-grid` | 2-column stat cells |
| `.stat-val` | 52px stat value (Bebas Neue) |
| `.team-chip` | Team selector button |
| `.flag-card` | Intelligence flag item |

---

## 🔍 Responsive Behavior

### Desktop (1200px+)
- 4-column quick stats
- 2-column grids (standings/offense, etc.)
- Full team picker grid

### Tablet (900px–1199px)
- 2-column quick stats
- 1-column layouts (fallback to single panel)
- Team picker still flexible

### Mobile (< 600px)
- 1-column layout throughout
- Smaller tab padding (9px vs. 12px)
- Stat fonts scale down (36px vs. 48px)

---

## ✅ Verification Checklist

- [ ] Header displays with gradient wordmark + v-badge
- [ ] Player search autocomplete works
- [ ] Quick stats show in 4-column layout
- [ ] Team picker displays all 30 teams grouped by division
- [ ] Season stats table populates when player is loaded
- [ ] Advanced metrics display without errors
- [ ] Team standings/roster/stats load without 500 errors
- [ ] Tab switching works smoothly
- [ ] Responsive design works on mobile
- [ ] Console shows no JavaScript errors

---

## 📝 Notes

1. **Color palette**: All colors defined in `:root` CSS variables—easy to customize
2. **Font stack**: Uses Google Fonts (Bebas Neue, Barlow Condensed, Barlow)—all are free
3. **Performance**: Backdrop filters enabled (GPU-accelerated on modern browsers)
4. **Accessibility**: Maintained semantic HTML, keyboard navigation supported
5. **Dark mode**: This is a dark-first design—no light mode toggle needed

---

## 🐛 Troubleshooting

### Team stats showing 500 error?
- Ensure `/api/mlb.js` is updated with the FIXED version
- Check that the endpoint uses `/teams/{id}/stats` (not hydrate params)
- Verify season parameter is valid (2026 or current season)

### Quick stats not showing values?
- Check that player data is loading (look at hero section)
- Verify the stat values are in `player?.stats?.[0]?.splits?.[0]?.stat`
- Check console for any fetch errors

### Tab switching not working?
- Ensure `ui.js` is loaded (or inline switchTab function exists)
- Check that tab data-attributes match page IDs (e.g., `data-tab="overview"` → `id="pg-overview"`)

---

## 🎉 You're All Set!

Your website now matches v11.html's professional design while maintaining all backend functionality. The visual improvements make it look modern and cohesive, and the API fixes eliminate the server errors.

**Next steps:**
1. Deploy the updated files
2. Test thoroughly in production
3. Gather user feedback
4. Consider adding more advanced metrics or features

Happy coding! 🚀
