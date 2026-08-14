import React, { useState, useEffect, useRef } from 'react';
import { trueIP } from '../lib/formatting.js';
import { SEASON } from '../constants/data.js';
import { percentile } from '../lib/percentile.js';
import { usePngExport } from '../lib/usePngExport.js';
import { useLowDataMode } from '../lib/lowData.js';

/* ── Draft Prospect Profile Card ──────────────────────────────────────
   Styled after a printed scouting portfolio: cream paper, navy ink, a
   single rust accent, a serif nameplate, and percentile "tool" rows laid
   out as a dot-on-track scale rather than filled progress bars.

   Deliberately uses its own fixed palette (not the app's light/dark theme
   tokens) since this is meant to read like a printed scouting sheet
   regardless of which theme the rest of the app is in.

   Only real fields the app actually has are shown — no fabricated 20-80
   tool grades, comps, or bio details the data model doesn't contain.
   "Statistical Strengths" / "Watch Points" are generated live from each
   prospect's actual percentile standing in the tracked pool below, not
   scouting opinions SKIP has no basis to offer.
------------------------------------------------------------------------ */

const CARD = {
  paper: '#F4F3EF', panel: '#EBEAE5', ink: '#141B22', inkSoft: '#535C66',
  // `rust` is reserved for large text (≥18px bold, e.g. the FV numeral) and
  // purely decorative accents (the performance-line border), where it clears
  // WCAG's 3:1 threshold. `rustText` is a darkened variant for every small
  // rust-colored label/value below that size — at 11px/9.5px, the brighter
  // rust only hits ~3.1–3.4:1 against this cream palette, short of the
  // 4.5:1 AA minimum for normal text; this variant clears 4.5:1+ on both
  // `paper` and `panel`.
  rust: '#DD5B29', rustText: '#B04820',
  line: '#DEDAD0', onInk: '#F2ECE0', goldOnInk: '#D9A96A',
};

function CardPhoto({ id, name }) {
  const [err, setErr] = useState(false);
  const lowDataMode = useLowDataMode();
  const primary = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;
  const fallback = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
    `<rect width="96" height="96" fill="${CARD.panel}"/>` +
    `<circle cx="48" cy="36" r="17" fill="${CARD.line}"/>` +
    `<ellipse cx="48" cy="88" rx="30" ry="20" fill="${CARD.line}"/></svg>`
  )}`;
  return (
    <img src={err || lowDataMode ? fallback : primary} onError={() => setErr(true)} alt={name} loading="lazy"
      style={{ width: 92, height: 92, objectFit: 'cover', objectPosition: 'center top',
        border: `1px solid ${CARD.line}`, borderRadius: 2, display: 'block', flexShrink: 0,
        background: CARD.panel }} />
  );
}

function ToolRow({ label, value, pct }) {
  // percentile() now returns null (not a fabricated 50) when there isn't
  // enough pool data to rank against — show an honest blank dot/value
  // rather than quietly drawing a mid-track marker for missing data.
  const hasData = pct != null;
  const p = hasData ? Math.max(0, Math.min(100, pct)) : 50;
  const strong = hasData && pct >= 80;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <div style={{ width: 44, fontSize: 11, fontWeight: 700, color: CARD.ink, flexShrink: 0 }}>{label}</div>
      <div role="img" aria-label={hasData ? `${label} percentile ${pct}` : `${label} percentile unavailable`} style={{ flex: 1, position: 'relative', height: 4, background: `linear-gradient(to right, ${CARD.rustText} 0%, #c89a46 50%, #168c7a 100%)`, borderRadius: 2, opacity: hasData ? 1 : .45 }}>
        {hasData && (
          <div style={{
            position: 'absolute', left: `${p}%`, top: '50%', transform: 'translate(-50%,-50%)',
            width: 10, height: 10, borderRadius: '50%', background: CARD.panel,
            border: `2px solid ${CARD.panel}`, boxShadow: `0 0 0 1px ${CARD.rustText}`,
          }} />
        )}
      </div>
      <div style={{ width: 54, textAlign: 'right', fontSize: 12, fontWeight: 800, color: strong ? CARD.rustText : CARD.ink, flexShrink: 0 }}>{value}</div>
      <div style={{ width: 34, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 10, color: CARD.inkSoft, flexShrink: 0 }}>{hasData ? `${pct}%` : '—'}</div>
    </div>
  );
}

function BioItem({ label, value, last }) {
  return (
    <div style={{ padding: '10px 14px', borderRight: last ? 'none' : `1px solid ${CARD.line}` }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: CARD.rustText }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: CARD.ink, marginTop: 2 }}>{value ?? '—'}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
      color: CARD.rustText, paddingBottom: 6, borderBottom: `1px solid ${CARD.line}` }}>
      {children}
    </div>
  );
}

export default function ProspectCard({ prospect, isPitcher, pool, onClose }) {
  const p = prospect;

  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  // html2canvas dynamic-import/tainted-canvas handling now lives in one
  // shared place (src/lib/usePngExport.js) instead of a copy here and
  // another in RadarCard.jsx — see that file's header comment for why,
  // including the silent-failure UX bug fixed as part of that extraction.
  // dialogRef doubles as both the focus-trap container below and the
  // capture target here, so the hook takes a ref rather than owning one.
  const { downloading, error: downloadError, download } = usePngExport();
  const handleDownload = () => {
    const safeName = (p.name || 'prospect').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    // headshot comes from img.mlbstatic.com, cross-origin — useCORS handles
    // the common case, backgroundColor keeps a transparent capture from
    // rendering as black in some PNG viewers.
    download(dialogRef, `skip-scouting-card-${safeName}.png`, { backgroundColor: CARD.paper });
  };

  useEffect(() => {
    // Standard modal a11y: move focus in on open, trap Tab/Shift+Tab inside
    // the dialog while it's open, restore focus to whatever triggered it
    // on close.
    const previouslyFocused = document.activeElement;
    closeBtnRef.current?.focus();

    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  if (!p) return null;

  const bb100  = p.pa ? Math.round((p.bb / p.pa) * 1000) / 10 : null;
  const k100   = p.pa ? Math.round((p.so / p.pa) * 1000) / 10 : null;
  // IP is recorded in MLB's .1/.2-for-partial-innings notation (thirds, not
  // tenths/hundredths) — trueIP() converts before any rate-stat division.
  const ipTrue = trueIP(p.ip);
  const bbRate = ipTrue ? Math.round((p.bb / ipTrue) * 900) / 10 : null; // per 9 (approx)
  const kRate  = ipTrue ? Math.round((p.so / ipTrue) * 9 * 10) / 10 : null;

  const perfBars = isPitcher ? [
    { label: 'ERA',  value: p.era?.toFixed(2) ?? '—', pct: percentile(p.era, pool.map(x => x.era), false) },
    { label: 'WHIP', value: p.whip?.toFixed(2) ?? '—', pct: percentile(p.whip, pool.map(x => x.whip), false) },
    { label: 'K/9',  value: kRate ?? '—', pct: percentile(kRate, pool.map(x => trueIP(x.ip) ? (x.so / trueIP(x.ip)) * 9 : null)) },
    { label: 'BB/9', value: bbRate ?? '—', pct: percentile(bbRate, pool.map(x => trueIP(x.ip) ? (x.bb / trueIP(x.ip)) * 9 : null), false) },
  ] : [
    { label: 'AVG', value: p.avg?.toFixed(3)?.replace(/^0/, '') ?? '—', pct: percentile(p.avg, pool.map(x => x.avg)) },
    { label: 'OBP', value: p.obp?.toFixed(3)?.replace(/^0/, '') ?? '—', pct: percentile(p.obp, pool.map(x => x.obp)) },
    { label: 'SLG', value: p.slg?.toFixed(3)?.replace(/^0/, '') ?? '—', pct: percentile(p.slg, pool.map(x => x.slg)) },
    { label: 'K%',  value: k100 != null ? `${k100}%` : '—', pct: percentile(k100, pool.map(x => x.pa ? (x.so / x.pa) * 100 : null), false) },
    { label: 'BB%', value: bb100 != null ? `${bb100}%` : '—', pct: percentile(bb100, pool.map(x => x.pa ? (x.bb / x.pa) * 100 : null)) },
  ];

  // "Statistical Strengths" / "Watch Points" are generated straight from
  // the percentile rows above, not a scouting opinion — a stat only shows
  // up here because it's genuinely top- or bottom-quartile in the pool.
  const strengths = perfBars.filter(b => b.pct >= 75).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const watchPoints = perfBars.filter(b => b.pct <= 25).sort((a, b) => a.pct - b.pct).slice(0, 3);

  const perfLine = isPitcher
    ? `${SEASON} MiLB — ${p.era?.toFixed(2) ?? '—'} ERA, ${p.whip?.toFixed(2) ?? '—'} WHIP, ${p.so ?? '—'} SO, ${p.ip ?? '—'} IP (${p.g ?? '—'} G)`
    : `${SEASON} MiLB — ${p.avg?.toFixed(3)?.replace(/^0/, '') ?? '—'}/${p.obp?.toFixed(3)?.replace(/^0/, '') ?? '—'}/${p.slg?.toFixed(3)?.replace(/^0/, '') ?? '—'}, ${p.hr ?? '—'} HR, ${p.rbi ?? '—'} RBI, ${p.sb ?? '—'} SB (${p.pa ?? '—'} PA)`;

  const projWarStr = p.projWar != null ? (+p.projWar).toFixed(1) : '—';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,27,34,.55)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto',
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${p.name ?? 'Prospect'} scouting card`}
        onClick={e => e.stopPropagation()} style={{
        width: 600, background: CARD.paper, borderRadius: 6, overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,.35)', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
        color: CARD.ink,
      }}>
        {/* Close / Download */}
        <div data-html2canvas-ignore="true" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '10px 12px 0' }}>
          {downloadError && (
            <span role="alert" style={{ marginRight: 'auto', fontSize: 10, fontWeight: 600, color: CARD.rustText }}>
              {downloadError}
            </span>
          )}
          <button onClick={handleDownload} disabled={downloading} aria-label="Download scouting card as image"
            title="Download as PNG" style={{
            background: 'transparent', border: `1px solid ${CARD.line}`, borderRadius: 4, cursor: downloading ? 'default' : 'pointer',
            fontSize: 10.5, fontWeight: 700, color: CARD.inkSoft, padding: '4px 9px', opacity: downloading ? .6 : 1,
          }}>{downloading ? 'Rendering…' : '⭳ PNG'}</button>
          <button ref={closeBtnRef} onClick={onClose} aria-label="Close prospect card" style={{
            background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: CARD.inkSoft, lineHeight: 1,
          }}>×</button>
        </div>

        {/* ── Report header band ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          margin: '6px 32px 0', paddingBottom: 10, borderBottom: `1px solid ${CARD.line}` }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500,
            letterSpacing: '.12em', textTransform: 'uppercase', color: CARD.rustText }}>
            SKIP Rank #{p.rank ?? '—'} · {p.level}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500,
            letterSpacing: '.1em', textTransform: 'uppercase', color: CARD.inkSoft }}>
            Scouting Report
          </span>
        </div>

        {/* ── Nameplate ── */}
        <div style={{ display: 'flex', gap: 20, padding: '18px 32px 0', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 700, fontSize: 32,
              color: CARD.ink, lineHeight: 1.08, letterSpacing: '-.01em' }}>
              {p.name}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: CARD.ink }}>
              {p.pos} <span style={{ color: CARD.inkSoft, fontWeight: 500 }}>· {p.team}</span>
            </div>
            <div style={{ marginTop: 4, fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic',
              fontSize: 13.5, color: CARD.inkSoft }}>
              {p.risk ?? '—'}-Risk Projection · ETA {p.eta ?? '—'}
            </div>
          </div>
          <CardPhoto id={p.mlbId} name={p.name} />
        </div>

        {/* ── Bio strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', margin: '18px 32px 0',
          background: CARD.panel, borderRadius: 3 }}>
          <BioItem label="Age" value={p.age} />
          <BioItem label="Position" value={p.pos} />
          <BioItem label="Level" value={p.level} />
          <BioItem label="Organization" value={p.team} last />
        </div>

        {/* ── Percentile panel + Future Value ── */}
        <div style={{ margin: '16px 32px 0', background: CARD.panel, borderRadius: 3, padding: '14px 18px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700,
            letterSpacing: '.09em', textTransform: 'uppercase', color: CARD.inkSoft, marginBottom: 10 }}>
            <span>{isPitcher ? 'Pitching' : 'Batting'} Percentile vs. Prospect Pool</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 400, letterSpacing: 0 }}>0 ── 50 ── 100</span>
          </div>
          {perfBars.map(b => <ToolRow key={b.label} {...b} />)}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CARD.line}` }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: CARD.inkSoft }}>
              Future Value
            </span>
            <span style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 700, fontSize: 26, color: CARD.rust }}>
              {p.fv ?? '—'}
            </span>
          </div>
        </div>

        {/* ── Performance line ── */}
        <div style={{ margin: '16px 32px 0', paddingLeft: 14, borderLeft: `2px solid ${CARD.rust}` }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: CARD.rustText }}>
            Performance{' '}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: CARD.ink }}>{perfLine}</span>
        </div>

        {/* ── Strengths / Watch Points ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, margin: '20px 32px 0' }}>
          <div>
            <SectionLabel>Statistical Strengths</SectionLabel>
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
              {strengths.length ? strengths.map(s => (
                <li key={s.label} style={{ fontSize: 12, lineHeight: 1.5, color: CARD.ink, marginBottom: 8, paddingLeft: 13, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 1, color: CARD.rustText }}>▸</span>
                  <b>{s.label}</b> — {s.value}, top {100 - s.pct}% of tracked pool
                </li>
              )) : (
                <li style={{ fontSize: 12, lineHeight: 1.5, color: CARD.inkSoft, fontStyle: 'italic' }}>
                  No top-quartile stats at current sample size
                </li>
              )}
            </ul>
          </div>
          <div style={{ borderLeft: `1px solid ${CARD.line}`, paddingLeft: 28 }}>
            <SectionLabel>Watch Points</SectionLabel>
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
              {watchPoints.length ? watchPoints.map(s => (
                <li key={s.label} style={{ fontSize: 12, lineHeight: 1.5, color: CARD.ink, marginBottom: 8, paddingLeft: 13, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 1, color: CARD.rustText }}>▸</span>
                  <b>{s.label}</b> — {s.value}, bottom {s.pct}% of tracked pool
                </li>
              )) : (
                <li style={{ fontSize: 12, lineHeight: 1.5, color: CARD.inkSoft, fontStyle: 'italic' }}>
                  No bottom-quartile stats at current sample size
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Projection ── */}
        <div style={{ margin: '20px 32px 0', background: CARD.ink, borderRadius: 3, padding: '16px 20px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
            color: CARD.goldOnInk, marginBottom: 6 }}>
            Projection
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: CARD.onInk }}>
            <span style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 700 }}>
              {p.risk ?? '—'}-risk, FV {p.fv ?? '—'}
            </span>
            {' — '}Projects to roughly {projWarStr} WAR over the first five MLB seasons, with an estimated debut by {p.eta ?? '—'}.
          </div>
        </div>

        {/* ── Methodology note ── */}
        <div style={{ margin: '16px 32px 0', fontSize: 9.5, color: CARD.inkSoft, lineHeight: 1.5 }}>
          Percentiles calculated against SKIP&rsquo;s current tracked {isPitcher ? 'pitching' : 'batting'} prospect
          pool using traditional MiLB stat lines. Advanced Statcast tracking isn&rsquo;t available for most MiLB
          games and is intentionally omitted rather than estimated. FV is a continuous grade recomputed live from
          board position, level-relative performance, and age-for-level — see Knowledge → Future Value for the
          full methodology.
        </div>

        {/* ── Footer ── */}
        <div style={{ margin: '16px 32px 0', padding: '12px 0 20px', borderTop: `1px solid ${CARD.line}`, textAlign: 'center' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, letterSpacing: '.12em',
            textTransform: 'uppercase', color: CARD.inkSoft }}>
            SKIP Scouting Report · {p.name}
          </span>
        </div>
      </div>
    </div>
  );
}
