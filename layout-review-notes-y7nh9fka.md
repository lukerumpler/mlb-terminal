# Layout Review Notes

## Source
- Attached reference: `/home/ubuntu/upload/MLBDashboardProjectVisualExamples.pdf`

## Key findings relevant to the next SKIP layout pass

1. The strongest examples use a **narrower left rail** with tighter horizontal padding, smaller icon-label gaps, and more compact section spacing. This gives noticeably more width to the content canvas without removing text labels.
2. The best-performing sidebar examples still preserve **fully readable labels** by shortening line length, reducing internal padding, and using clearer section grouping rather than simply shrinking text.
3. Several references shift more visual emphasis into the **top hero/header band** and the main statistics grid, which makes the page feel wider even before changing the data density.
4. The most efficient shells avoid large empty gutters between the sidebar edge, page header, and first grid column. The workspace begins closer to the left once the rail is condensed.
5. The most modern examples treat the sidebar as a **navigation rail plus lightweight identity area**, not as a large branded panel. The logo block is present, but it does not consume excessive vertical or horizontal space.
6. The cleaner dashboards also use **shallower cards and tighter row heights** in the shell framing, which increases the amount of visible analysis content above the fold.
7. For SKIP specifically, the safest direction is to make the desktop sidebar slimmer while preserving text labels, then keep the current icon-first compact behavior on mobile.

## Recommended non-implementation direction

- Reduce the desktop sidebar width moderately rather than aggressively.
- Tighten sidebar padding, section spacing, and icon-label spacing before reducing font sizes.
- Compress the logo/header block so the workspace begins higher and further left.
- Rebalance the page shell so the main content column gains width while labels remain fully visible.
- Keep a hard rule against truncating nav labels; instead, reclaim space from padding, margins, and oversized shell chrome.
