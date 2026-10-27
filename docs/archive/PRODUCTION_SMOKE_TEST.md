# Production Smoke Test — SKIP Baseball Intelligence Terminal

**Deployment:** `https://skipbasebal-mm6hz9ps.manus.space/`  
**Test date:** 2026-08-17 (MST)  
**Scope:** Post-release desktop production verification.

| Check | Observed result | Status |
| --- | --- | --- |
| Initial Overview render | The published Overview loads with no visible error boundary. The Los Angeles Dodgers are the selected MLB parent club and verified live team signals render. | Pass |
| Honest provider states | Provider-limited fields such as Playoff Odds and Team WAR are explicitly marked `Unavailable`; no substitute values are shown. | Pass |
| Explicit Minor League workflow | Affiliate controls are hidden at the initial parent-team view and appear only after selecting **Minor League**. | Pass |
| Affiliate controls | The opened workflow exposes a level filter and a separate MiLB affiliate selector; the MLB parent itself is not listed as an affiliate option. | Pass |
| Players workspace | The published Players route completed its loading state, displayed the search field and verified quick-access player cards, and showed no error boundary. | Pass |
| Production re-open | A clean direct reload returned to the Dodgers parent-team Overview, with cached MLB provenance shown rather than fabricated fallback values. | Pass |
| Mobile layout review | The release-matched mobile viewport (375 × 812) retained a compact menu, readable parent-team summary, responsive core-signal tabs, and no visible horizontal overflow or error boundary. | Pass |

## Notes

The on-demand selector also includes source-returned organization-level and developmental rows, which remain labeled by their supplied classification. These were not selected during the smoke test, so the MLB parent Overview remained intact.

The Players workspace transitioned from its loading shell to its normal search and quick-access experience without a visible production error.

The direct production reload transparently reported a one-minute MLB cache state while keeping the Los Angeles Dodgers selected. The mobile check was performed against the release-matched preview because the connected production browser runs at a fixed desktop viewport.
