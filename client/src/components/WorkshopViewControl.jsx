import React, { useEffect, useRef, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { WORKSHOP_OPTIONS, WORKSHOP_DEFAULTS, useWorkshopPreferences, saveWorkshopPreferences, resetWorkshopPreferences } from '../lib/workshopPreferences.js';

// Team Overview header configuration control. Same interaction shape as
// RecentHistoryDropdown (outside-click + Escape to close, role="menu") so it
// reads as part of the same header-control family rather than a one-off
// widget. Every checkbox here maps to a real conditional already present in
// OverviewPage.jsx — see workshopPreferences.js's header comment.
export default function WorkshopViewControl() {
  const [open, setOpen] = useState(false);
  const prefs = useWorkshopPreferences();
  const rootRef = useRef(null);
  const isDefault = WORKSHOP_OPTIONS.every(opt => prefs[opt.key] === WORKSHOP_DEFAULTS[opt.key]);

  useEffect(() => {
    const onOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const toggle = (key) => saveWorkshopPreferences(current => ({ ...current, [key]: !current[key] }));

  return (
    <div ref={rootRef} className="skip-workshop-root" style={{ position:'relative', flexShrink:0 }}>
      <button type="button" className="skip-workshop-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label="Workshop View — choose which optional Team Overview panels are shown"
        title="Workshop View — choose which optional panels are shown"
        onClick={() => setOpen(value => !value)}
        style={{ display:'inline-flex', alignItems:'center', gap:5, height:30, padding:'0 10px', border:`1px solid ${open ? C.tealMid : C.border}`, borderRadius:7, background:open ? C.tealSoft : C.surface, color:open ? C.teal : C.text2, cursor:'pointer', ...px({ fontSize:9.5, fontWeight:800, letterSpacing:'.05em' }) }}>
        WORKSHOP VIEW
        {!isDefault && <span aria-hidden="true" style={{ width:6, height:6, borderRadius:'50%', background:C.teal }} />}
        <span aria-hidden="true" style={{ fontSize:8 }}>▾</span>
      </button>

      {open && (
        <div role="menu" aria-label="Workshop View options" className="skip-workshop-menu"
          style={{ position:'absolute', zIndex:30, top:'calc(100% + 8px)', right:0, width:236, maxWidth:'calc(100vw - 24px)', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:10, background:C.surface, boxShadow:`0 16px 32px color-mix(in srgb, ${C.navy} 18%, transparent)` }}>
          <div style={sans({ fontSize:9, color:C.text4, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8 })}>
            Workshop View
          </div>
          <div style={sans({ fontSize:9.5, color:C.text3, lineHeight:1.4, marginBottom:9 })}>
            Choose which optional panels show on this Team Overview.
          </div>
          {WORKSHOP_OPTIONS.map(opt => (
            <label key={opt.key} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 0', cursor:'pointer' }}>
              <input type="checkbox" checked={Boolean(prefs[opt.key])} onChange={() => toggle(opt.key)}
                style={{ width:14, height:14, marginTop:1, accentColor:C.teal, flexShrink:0, cursor:'pointer' }} />
              <span style={{ minWidth:0 }}>
                <span style={{ display:'block', ...sans({ fontSize:11.5, fontWeight:700, color:C.text }) }}>{opt.label}</span>
                <span style={{ display:'block', ...sans({ fontSize:9.5, color:C.text3, lineHeight:1.35 }) }}>{opt.description}</span>
              </span>
            </label>
          ))}
          <button type="button" role="menuitem" onClick={() => resetWorkshopPreferences()} disabled={isDefault}
            style={{ marginTop:8, width:'100%', height:28, border:`1px solid ${C.border}`, borderRadius:6, background:C.surface2, color:isDefault ? C.text4 : C.text3, cursor:isDefault ? 'default' : 'pointer', ...sans({ fontSize:10, fontWeight:700 }) }}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
