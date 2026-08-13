import { useRef, useState, useEffect, useCallback } from 'react';

// Shared "export a DOM node to a downloadable PNG" hook.
//
// ProspectCard.jsx and RadarCard.jsx each independently implemented the
// same html2canvas dynamic-import + tainted-canvas handling before this
// extraction (RadarCard's own header comment even said so: "mirrors
// ProspectCard.jsx's html2canvas pattern") — two copies of the same logic
// that could silently drift apart, the same reasoning already behind this
// codebase's other shared-logic extractions (pickSavantField, compareValues,
// percentile()). This is that logic in one place instead of two.
//
// Debug fix (UI pass): both original copies swallowed every export failure
// silently — `catch {}` with only a comment explaining why, no state change
// a component could render off of. In practice this is a real, reachable
// failure mode (both comments called it out: a cross-origin headshot or
// team-logo image tainting the canvas), not just a theoretical one. The
// visible result was a button that said "Rendering…"/"Saving…", then just
// reverted to its idle label with nothing downloaded and no explanation —
// indistinguishable, from the person's side, from the click not having
// registered at all. This hook keeps the same "don't throw at the user for
// something outside the app's control" judgment call, but now surfaces a
// short `error` string instead of nothing, so a component using it can
// actually tell the person their download didn't go through.
//
// Deliberately doesn't own the ref to the node it captures (unlike a first
// draft of this hook) — ProspectCard's capture target is the same dialog
// node its focus-trap effect already queries via its own ref, and forcing
// two separate refs onto one element for two unrelated features would be
// the worse design. Callers pass their own ref into `download()` instead.
//
// Returns { downloading, error, download(nodeRef, filename, options) }.
// `options` is passed straight through to html2canvas (e.g. a caller-
// specific `backgroundColor`).
export function usePngExport() {
  const mountedRef = useRef(true);
  // Re-entrancy guard lives on a ref, not the `downloading` state, so
  // `download` can keep a stable `useCallback([])` identity instead of
  // needing `downloading` in its own dependency array (which would create
  // a new function identity on every start/stop of a download).
  const busyRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const download = useCallback(async (nodeRef, filename, options = {}) => {
    if (!nodeRef?.current || busyRef.current) return;
    busyRef.current = true;
    setDownloading(true);
    setError(null);
    try {
      // Dynamic import: html2canvas is ~200KB and only needed if someone
      // actually clicks the export button, so it shouldn't cost every
      // visitor who views a card but never downloads one.
      const { default: html2canvas } = await import('html2canvas');
      // The card can close (unmounting) while the import and the render-
      // to-canvas below are still in flight — both take a real, noticeable
      // moment. Re-check both flags before touching the DOM/state further
      // so a closed card doesn't trigger a download the person can no
      // longer see the source of, or a state update after unmount.
      if (!mountedRef.current || !nodeRef.current) return;
      const canvas = await html2canvas(nodeRef.current, {
        scale: 2, // export at 2x for a crisp image, not just screen resolution
        useCORS: true,
        ...options,
      });
      if (!mountedRef.current) return;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Most commonly a cross-origin image (headshot / team logo) tainting
      // the canvas — outside this app's control either way, so this stays
      // a short, calm message rather than surfacing a raw error.
      if (mountedRef.current) setError("Couldn't export image — try again.");
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setDownloading(false);
    }
  }, []);

  return { downloading, error, download };
}
