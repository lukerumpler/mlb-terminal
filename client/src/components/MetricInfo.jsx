import React, { useState } from 'react';

export const METRIC_DEFINITIONS = {
  'xwOBA': 'Expected weighted on-base average, estimated from quality and type of contact rather than the observed outcome.',
  'xBA': 'Expected batting average based on contact quality and launch characteristics.',
  'xSLG': 'Expected slugging percentage based on contact quality and launch characteristics.',
  'Barrel %': 'Share of batted balls with an optimal combination of exit velocity and launch angle.',
  'Hard Hit %': 'Share of batted balls hit at 95 mph or harder.',
  'Hard-hit %': 'Share of batted balls hit at 95 mph or harder.',
  'OPS': 'On-base plus slugging percentage, a combined measure of reaching base and hitting for power.',
  'ERA': 'Earned run average, the average earned runs allowed per nine innings.',
  'K/9 Rate': 'Strikeouts per nine innings pitched.',
  'WHIP': 'Walks and hits allowed per inning pitched.',
};

export default function MetricInfo({ label }) {
  const definition = METRIC_DEFINITIONS[label];
  const [open, setOpen] = useState(false);
  if (!definition) return <span>{label}</span>;
  return (
    <span className="skip-metric-info">
      <span>{label}</span>
      <button type="button" className="skip-metric-info-button" aria-label={`Definition for ${label}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>i</button>
      {open && <span className="skip-metric-info-popover" role="tooltip">{definition}</span>}
    </span>
  );
}
