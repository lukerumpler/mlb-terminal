import React, { useRef } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import { C, px, sans } from '../constants/colors.js';
import { usePngExport } from '../lib/usePngExport.js';
import { useLowDataMode } from '../lib/lowData.js';

/* ── Compact, team-branded percentile radar card ───────────────────────
   A smaller, shareable cousin of the full "Player Geometry Engine" radar
   on the Players page — same underlying 0-100 axis data, just restyled
   for a quick glance / export rather than in-page analysis.

   Deliberately takes fully precomputed `axes` rather than any raw stats:
   this component never derives or invents its own numbers, it only
   renders whatever the caller already computed (see
   `computeGeometryAxes` in PlayersPage.jsx), so it can't drift out of
   sync with — or contradict — the full radar sitting right next to it.

   "Save as Image" now shares its html2canvas handling with ProspectCard.jsx
   via src/lib/usePngExport.js (dynamic import so the ~200KB library only
   loads for someone who actually clicks the button; a short on-card error
   message rather than a silent no-op if the canvas gets tainted by a
   cross-origin team-logo SVG on some browsers) — see that file for why
   this used to be two separately-maintained copies of the same logic.
------------------------------------------------------------------------ */

function TeamBadge({ teamId, teamAbbr, size = 22 }) {
  const lowDataMode = useLowDataMode();
  if (!teamId || lowDataMode) return <span aria-label={teamAbbr || 'Team logo unavailable in Low Data Mode'} style={{ width:size, height:size, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:4, background:C.surface3, color:C.text3, ...px({ fontSize:8, fontWeight:800 }) }}>{teamAbbr || '—'}</span>;
  return (
    <img
      src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
      alt={teamAbbr || ''}
      width={size} height={size} loading="lazy"
      style={{ flexShrink: 0, objectFit: 'contain' }}
    />
  );
}

export default function RadarCard({
  name,
  subtitle,
  teamId,
  teamAbbr,
  teamColor = C.amber,
  axes = [],
  filenamePrefix = 'skip-radar-card',
}) {
  const cardRef = useRef(null);
  const { downloading, error: downloadError, download } = usePngExport();

  const handleDownload = () => {
    const safeName = (name || 'player').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    // Resolve the theme's actual surface color for the export background —
    // html2canvas rasterizes computed styles fine, but a transparent
    // capture background can render as black in some PNG viewers.
    const bg = (getComputedStyle(document.documentElement).getPropertyValue('--surface') || '').trim() || '#ffffff';
    download(cardRef, `${filenamePrefix}-${safeName}.png`, { backgroundColor: bg });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div ref={cardRef} style={{
        background: C.surface, border: `0.5px solid ${C.border}`, borderTop: `3px solid ${teamColor}`,
        borderRadius: 10, padding: '14px 16px 6px', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ minWidth: 0 }}>
            <div style={sans({ fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>
              {name || 'Player'}
            </div>
            {subtitle && (
              <div style={px({ fontSize: 9.5, color: C.text3, marginTop: 1, letterSpacing: '.02em' })}>{subtitle}</div>
            )}
          </div>
          <TeamBadge teamId={teamId} teamAbbr={teamAbbr} />
        </div>

        <ResponsiveContainer width="100%" height={168}>
          <RadarChart data={axes} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
            <PolarGrid stroke={C.border} />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 8.5, fill: C.text2, fontFamily: "'DM Mono',monospace" }} tickLine={false} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar isAnimationActive={false} dataKey="val" stroke={teamColor} fill={teamColor}
              fillOpacity={0.22} strokeWidth={2} dot={{ r: 2.5, fill: teamColor }} />
          </RadarChart>
        </ResponsiveContainer>

        <div data-html2canvas-ignore="true" style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 4 }}>
          <span style={px({ fontSize: 8.5, color: C.text4, letterSpacing: '.04em' })}>SKIP</span>
        </div>
      </div>

      <button onClick={handleDownload} disabled={downloading} style={{
        alignSelf: 'flex-start', marginTop: 6, padding: '4px 10px', borderRadius: 6,
        cursor: downloading ? 'default' : 'pointer', border: `1px solid ${C.border}`,
        background: 'transparent', color: C.text2, ...sans({ fontSize: 10.5, fontWeight: 600 }),
      }}>
        {downloading ? 'Saving…' : 'Save as Image'}
      </button>
      {downloadError && (
        <span role="alert" style={{ marginTop: 4, ...sans({ fontSize: 10, fontWeight: 600, color: C.rust }) }}>
          {downloadError}
        </span>
      )}
    </div>
  );
}
