import React, { useEffect, useRef } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { fmt, fmtEra } from '../lib/formatting.js';

const BATTER_ROWS = [
  { key:'fv',  label:'eFV',  fmt: v => v ?? '—',    higherBetter:true },
  { key:'avg', label:'AVG',  fmt: v => fmt(v),      higherBetter:true },
  { key:'obp', label:'OBP',  fmt: v => fmt(v),      higherBetter:true },
  { key:'slg', label:'SLG',  fmt: v => fmt(v),      higherBetter:true },
  { key:'ops', label:'OPS',  fmt: v => fmt(v),      higherBetter:true },
  { key:'hr',  label:'HR',   fmt: v => v ?? '—',    higherBetter:true },
  { key:'rbi', label:'RBI',  fmt: v => v ?? '—',    higherBetter:true },
  { key:'sb',  label:'SB',   fmt: v => v ?? '—',    higherBetter:true },
  { key:'bb',  label:'BB',   fmt: v => v ?? '—',    higherBetter:true },
  { key:'so',  label:'SO',   fmt: v => v ?? '—',    higherBetter:false },
];
const PITCHER_ROWS = [
  { key:'fv',   label:'eFV',  fmt: v => v ?? '—',   higherBetter:true },
  { key:'era',  label:'ERA',  fmt: v => fmtEra(v),  higherBetter:false },
  { key:'whip', label:'WHIP', fmt: v => v?.toFixed(2) ?? '—', higherBetter:false },
  { key:'so',   label:'SO',   fmt: v => v ?? '—',   higherBetter:true },
  { key:'bb',   label:'BB',   fmt: v => v ?? '—',   higherBetter:false },
  { key:'w',    label:'W',    fmt: v => v ?? '—',   higherBetter:true },
  { key:'l',    label:'L',    fmt: v => v ?? '—',   higherBetter:false },
  { key:'g',    label:'G',    fmt: v => v ?? '—',   higherBetter:true },
  { key:'ip',   label:'IP',   fmt: v => v ?? '—',   higherBetter:true },
];

function bestIndex(prospects, key, higherBetter) {
  let bestI = -1, bestV = null;
  prospects.forEach((p, i) => {
    const v = p[key];
    if (v == null) return;
    if (bestV == null || (higherBetter ? v > bestV : v < bestV)) { bestV = v; bestI = i; }
  });
  return bestI;
}

export default function CompareModal({ prospects, isPitcher, onClose, onRemove }) {
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
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

  const rows = isPitcher ? PITCHER_ROWS : BATTER_ROWS;

  return (
    <div onClick={onClose} role="presentation" style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200,
      display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 16px', overflowY:'auto',
    }}>
      <div ref={dialogRef} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={`Compare ${isPitcher ? 'pitchers' : 'batters'}: ${prospects.map(p => p.name).join(', ')}`} style={{
        width:'min(920px, 100%)', background:C.surface, borderRadius:12, overflow:'hidden',
        border:`0.5px solid ${C.border}`, boxShadow:'0 24px 60px rgba(0,0,0,.35)',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:`0.5px solid ${C.border}` }}>
          <div style={sans({ fontSize:14, fontWeight:800, color:C.text })}>
            Compare {isPitcher ? 'Pitchers' : 'Batters'} · {prospects.length}
          </div>
          <button ref={closeBtnRef} onClick={onClose} aria-label="Close comparison" style={{
            background:'transparent', border:'none', cursor:'pointer', fontSize:20, color:C.text3, lineHeight:1,
          }}>×</button>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding:'10px 14px', textAlign:'left', ...sans({ fontSize:10, fontWeight:700, color:C.text3, textTransform:'uppercase', letterSpacing:'.04em' }) }}>Stat</th>
                {prospects.map(p => (
                  <th key={p.mlbId} style={{ padding:'10px 14px', textAlign:'center', minWidth:130, borderLeft:`0.5px solid ${C.borderLight}` }}>
                    <div style={sans({ fontSize:12.5, fontWeight:800, color:C.text })}>{p.name}</div>
                    <div style={px({ fontSize:9.5, color:C.text3, marginTop:2 })}>{p.team} · {p.pos} · #{p.rank}</div>
                    <button onClick={() => onRemove(p.mlbId)} aria-label={`Remove ${p.name} from comparison`} style={{
                      marginTop:6, background:'transparent', border:`0.5px solid ${C.border}`, borderRadius:5,
                      color:C.text3, fontSize:9, padding:'1px 6px', cursor:'pointer',
                    }}>Remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const winnerI = bestIndex(prospects, r.key, r.higherBetter);
                return (
                  <tr key={r.key} style={{ borderTop:`0.5px solid ${C.borderLight}` }}>
                    <td style={{ padding:'8px 14px', ...sans({ fontSize:11.5, fontWeight:700, color:C.text2 }) }}>{r.label}</td>
                    {prospects.map((p, i) => (
                      <td key={p.mlbId} style={{
                        padding:'8px 14px', textAlign:'center', borderLeft:`0.5px solid ${C.borderLight}`,
                        ...px({ fontSize:13, fontWeight: i === winnerI ? 800 : 500, color: i === winnerI ? C.teal : C.text }),
                      }}>
                        {r.fmt(p[r.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding:'10px 18px', borderTop:`0.5px solid ${C.border}` }}>
          <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
            Bolded, teal value = better in that row. Comparisons use each prospect's traditional
            MiLB stat line — the same data shown on their card.
          </div>
        </div>
      </div>
    </div>
  );
}
