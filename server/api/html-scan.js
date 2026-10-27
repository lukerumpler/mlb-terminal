/*
Our goal is to pull tables and links out of web pages from other websites (FanGraphs, Baseball-Reference, Spotrac and so on)
without letting a messy page make our program slow. We find the pieces we want with regular expressions, and a pattern like
<tr ...> ... </tr> has a weakness: if a page is cut off or garbled, every "<tr" that never gets a closing "</tr>" makes the
search start over and read the rest of the page again. The work then grows with the square of the page size (100,000 stray
"<td" tags cost about 20 seconds of CPU).

To solve this we are going to:
  1. Never let an opening tag run across another tag (we use [^<>]* instead of [^>]*)
  2. Only search the part of the page that ends at the LAST closing tag, since anything after it can never match
  3. Keep both rules in this one file so every scraper gets the same protection
  4. Cross-check our results: on a well-formed page the output is identical to the plain regular expressions
*/

// Section A: The patterns we search for
// Each BLOCK pattern finds a whole <tag ...> ... </tag> piece, and each CLOSE pattern finds only the closing tag

export const TABLE_BLOCK = /<table[^<>]*>([\s\S]*?)<\/table>/gi;               // A whole table, group 1 is what is inside
export const TABLE_CLOSE = /<\/table>/gi;                                       // Just the closing table tag
export const ROW_BLOCK = /<tr[^<>]*>([\s\S]*?)<\/tr>/gi;                       // A whole table row, group 1 is what is inside
export const ROW_CLOSE = /<\/tr>/gi;                                            // Just the closing row tag
export const CELL_BLOCK = /<t[dh][^<>]*>([\s\S]*?)<\/t[dh]>/gi;                // A whole cell (td or th), group 1 is what is inside
export const CELL_WITH_ATTRS_BLOCK = /<t([dh])([^<>]*)>([\s\S]*?)<\/t[dh]>/gi; // A cell where we also keep the td/th letter (group 1) and the attributes (group 2)
export const CELL_CLOSE = /<\/t[dh]>/gi;                                        // Just the closing cell tag
export const ANCHOR_CLOSE = /<\/a>/gi;                                          // Just the closing link tag


// Section B: The helper functions

export function upToLastClose(text, closing) {
  /*
  Our "upToLastClose" is a function that cuts the page off right after its last closing tag. When we give it:
                  the page text and a closing pattern (this pattern must have the g flag)
  it returns to us:
                  the text from the start of the page through the end of the last closing tag, or "" if there is none
  */
  const source = String(text ?? "");                  // Turn the input into a string, null and undefined become ""
  let end = -1;                                       // Where the last closing tag ends, -1 means we have not found one yet

  for (const match of source.matchAll(closing)) {     // Look at every closing tag in the page
    end = match.index + match[0].length;              // Remember where this one ends, the last one we see is the one we keep
  }

  if (end < 0) {
    return "";                                        // No closing tag at all means nothing can match
  }
  return source.slice(0, end);                        // Keep everything up to the end of the last closing tag
}

export function closedBlocks(text, pattern, closing) {
  /*
  Our "closedBlocks" is a function that finds every <tag> ... </tag> piece in the page. When we give it:
                  the page text, a BLOCK pattern (this pattern must have the g flag), and its CLOSE pattern
  it returns to us:
                  a list of matches, the same kind of list matchAll gives, so group 1 is what is inside each block
  */
  const searchable = upToLastClose(text, closing);    // Only search the part of the page that can still hold a match
  return [...searchable.matchAll(pattern)];           // Collect every block into a list
}

export function firstClosedBlock(text, pattern, closing) {
  /*
  Our "firstClosedBlock" is a function that finds only the first <tag> ... </tag> piece in the page. When we give it:
                  the page text, a BLOCK pattern (this pattern must NOT have the g flag), and its CLOSE pattern
  it returns to us:
                  the first match, the same thing String.match gives, or null if there is no block
  */
  const searchable = upToLastClose(text, closing);    // Only search the part of the page that can still hold a match
  return searchable.match(pattern);                   // The first block, or null when nothing matches
}
