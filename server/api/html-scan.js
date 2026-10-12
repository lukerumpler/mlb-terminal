// Linear-time building blocks for scraping third-party HTML with regexes.
//
// Provider pages are read with patterns like /<tr[^>]*>([\s\S]*?)<\/tr>/g. On a
// truncated or garbled response those rescan the rest of the document once per
// unclosed opener (quadratic: 100,000 stray "<td" cost ~20 s of CPU). Two rules
// keep them linear, and every scraper shares them from here:
//
//  1. Opener character classes are `[^<>]*`, never `[^>]*`, so an opener cannot
//     run across another tag.
//  2. Only the text up to the LAST closing tag is searched. An unclosed opener
//     after it can never match, but would otherwise rescan the whole remainder.
//
// For well-formed markup the results are identical to the plain regexes.

export const TABLE_BLOCK = /<table[^<>]*>([\s\S]*?)<\/table>/gi;
export const TABLE_CLOSE = /<\/table>/gi;
export const ROW_BLOCK = /<tr[^<>]*>([\s\S]*?)<\/tr>/gi;
export const ROW_CLOSE = /<\/tr>/gi;
export const CELL_BLOCK = /<t[dh][^<>]*>([\s\S]*?)<\/t[dh]>/gi;
export const CELL_WITH_ATTRS_BLOCK = /<t([dh])([^<>]*)>([\s\S]*?)<\/t[dh]>/gi;
export const CELL_CLOSE = /<\/t[dh]>/gi;
export const ANCHOR_CLOSE = /<\/a>/gi;

// `closing` must be a global RegExp (it is scanned with matchAll).
export function upToLastClose(text, closing) {
  const source = String(text ?? "");
  let end = -1;
  for (const match of source.matchAll(closing)) end = match.index + match[0].length;
  return end < 0 ? "" : source.slice(0, end);
}

// Every <tag>...</tag> block, as matchAll results. `pattern` must be global.
export function closedBlocks(text, pattern, closing) {
  return [...upToLastClose(text, closing).matchAll(pattern)];
}

// The first block, as String.prototype.match would return it. `pattern` must NOT be global.
export function firstClosedBlock(text, pattern, closing) {
  return upToLastClose(text, closing).match(pattern);
}
