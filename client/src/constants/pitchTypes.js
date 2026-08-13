import { C } from './colors.js';

// Categorical color per Statcast pitch-type code. Grouped by pitch family
// so, e.g., a slider and sweeper read as "related but distinct" rather than
// all 15+ codes getting their own arbitrary hue. Originally written once
// inside PitchShapePanel.jsx (Roadmap #1); pulled out here once the live
// pitch-charting tool (Roadmap #8) needed the same color set for its pitch-
// type buttons, rather than letting a second copy drift from the first —
// same reasoning as pickSavantField()'s extraction into lib/savantField.js
// for Roadmap #3.
export const PITCH_COLOR = {
  FF: C.rust, FA: C.rust, FT: C.rust,
  SI: C.amber,
  FC: C.purple,
  SL: C.teal,
  ST: C.green, SV: C.green,
  CU: C.slate, KC: C.slate, CS: C.slate,
  CH: C.navy, FS: C.navy, FO: C.navy, SC: C.navy,
  KN: C.red, EP: C.red,
};

export const pitchColor = (pitchType) => PITCH_COLOR[pitchType] || C.text3;

// Short code -> full display name, for anywhere a button/legend needs the
// human-readable name rather than the raw Statcast code. Deliberately a
// small, common-pitch subset (not every rare code Statcast recognizes) —
// this drives the pitch-charting tool's button list (Roadmap #8), where a
// long tail of rare codes would just be UI clutter for someone charting a
// game live; PitchShapePanel.jsx doesn't need this list at all since it
// only ever displays whatever `pitch_name` Savant's own leaderboard sends.
export const PITCH_TYPES = [
  { code:'FF', name:'4-Seam' },
  { code:'SI', name:'Sinker' },
  { code:'FC', name:'Cutter' },
  { code:'SL', name:'Slider' },
  { code:'ST', name:'Sweeper' },
  { code:'CU', name:'Curveball' },
  { code:'KC', name:'Knuckle Curve' },
  { code:'CH', name:'Changeup' },
  { code:'FS', name:'Splitter' },
];
