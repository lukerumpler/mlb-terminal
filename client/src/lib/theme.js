// SVG data-URIs (used for headshot/photo fallback placeholders) are loaded
// via <img src="data:..."> as a fully separate, opaque document — they
// cannot inherit the host page's CSS custom properties, so `fill={C.border}`
// doesn't work inside one. Components that build a fallback SVG need to pick
// their fill colors explicitly based on the current theme instead.
export function isDarkTheme() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
  }
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// Matches --border-light / --text4 in each theme (see index.html) — used for
// placeholder-avatar fallback shapes.
export function placeholderColors() {
  return isDarkTheme()
    ? { bg: '#252C3A', fg: '#3A4260' }
    : { bg: '#EDE6D6', fg: '#C9B5A8' };
}
