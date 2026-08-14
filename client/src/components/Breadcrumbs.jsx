import React from 'react';
import { C, px, sans } from '../constants/colors.js';

export default function Breadcrumbs({ items = [], accent = C.amber }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" style={{ display:'flex', alignItems:'center', gap:5, minWidth:0, marginBottom:7, ...sans({ fontSize:10.5, color:C.text3 }) }}>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && <span aria-hidden="true" style={{ color:C.text4, ...px({ fontSize:10 }) }}>/</span>}
            {isCurrent ? (
              <span aria-current="page" style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:C.text2, fontWeight:700 }}>{item.label}</span>
            ) : (
              <button type="button" onClick={item.onClick} style={{ padding:0, border:0, background:'transparent', color:accent, cursor:'pointer', whiteSpace:'nowrap', ...sans({ fontSize:10.5, fontWeight:700 }) }}>
                {item.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
