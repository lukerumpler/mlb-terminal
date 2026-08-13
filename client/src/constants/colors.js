// SKIP — Warm Palette Design System
//
// These values are CSS custom-property references, not literal hex codes.
// The actual light/dark values live in index.html's <style> block, keyed
// off `:root` (light) and `[data-theme="dark"]` (dark, or system preference
// via prefers-color-scheme). Because every page/component already reads
// colors from this `C` object at render time, switching the theme is just
// a matter of toggling the `data-theme` attribute on <html> — no component
// code needs to know about themes at all.
export const C = {
  bg:          'var(--bg)',
  surface:     'var(--surface)',
  surface2:    'var(--surface2)',
  surface3:    'var(--surface3)',
  border:      'var(--border)',
  borderLight: 'var(--border-light)',
  text:        'var(--text)',
  text2:       'var(--text2)',
  text3:       'var(--text3)',
  text4:       'var(--text4)',
  amber:       'var(--amber)',
  amberSoft:   'var(--amber-soft)',
  amberMid:    'var(--amber-mid)',
  amberDark:   'var(--amber-dark)',
  rust:        'var(--rust)',
  rustSoft:    'var(--rust-soft)',
  rustMid:     'var(--rust-mid)',
  teal:        'var(--teal)',
  tealSoft:    'var(--teal-soft)',
  tealMid:     'var(--teal-mid)',
  navy:        'var(--navy)',
  slate:       'var(--slate)',
  purple:      'var(--purple)',
  purpleSoft:  'var(--purple-soft)',
  green:       'var(--green)',
  greenSoft:   'var(--green-soft)',
  red:         'var(--red)',
  redSoft:     'var(--red-soft)',
};

export const px = (s) => ({ fontFamily: "'DM Mono', monospace", ...s });
export const sans = (s) => ({ fontFamily: "'Plus Jakarta Sans', sans-serif", ...s });

export const WARM_TOOLTIP = {
  wrapperStyle: { zIndex: 9999 },
  contentStyle: {
    background: C.surface,
    border: `0.5px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 11,
    color: C.text,
    fontFamily: "'DM Mono', monospace",
  },
  labelStyle: { color: C.text2 },
  itemStyle:  { color: C.amber },
};

export const GRID = {
  col2: { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 },
  col3: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 },
};
