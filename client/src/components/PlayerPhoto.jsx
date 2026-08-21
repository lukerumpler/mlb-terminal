import React, { useEffect, useMemo, useState } from 'react';
import { C } from '../constants/colors.js';
import { placeholderColors } from '../lib/theme.js';
import { useLowDataMode } from '../lib/lowData.js';

function initialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
}

export default function PlayerPhoto({ id, name, size = 96, alt = name || '', variant = 'portrait', style }) {
  const [failed, setFailed] = useState(false);
  const lowDataMode = useLowDataMode();
  const verifiedId = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
  const avatar = variant === 'avatar';
  const height = avatar ? size : Math.round(size * 1.25);
  const initials = useMemo(() => initialsFromName(name), [name]);
  const { bg, fg } = placeholderColors();

  useEffect(() => { setFailed(false); }, [verifiedId]);

  const baseStyle = {
    width:size,
    height,
    borderRadius:avatar ? '50%' : 10,
    border:`1px solid ${C.border}`,
    flexShrink:0,
    background:C.surface2,
    display:'block',
    ...style,
  };

  if (!verifiedId || failed || lowDataMode) {
    return <span
      aria-hidden={alt === '' ? 'true' : undefined}
      aria-label={alt || undefined}
      role={alt ? 'img' : undefined}
      style={{ ...baseStyle, display:'inline-grid', placeItems:'center', color:fg, background:bg, fontFamily:"'DM Mono',monospace", fontSize:Math.max(8, Math.round(size * .34)), fontWeight:800, letterSpacing:'.02em' }}
    >
      {initials}
    </span>;
  }

  const source = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${verifiedId}/headshot/67/current`;
  // The Team Leaders card is the only avatar surface. A slight vertical
  // center offset retains the face and chin in its square crop instead of
  // pinning the source image to the top and trimming the lower face.
  return <img src={source} onError={() => setFailed(true)} alt={alt} loading="lazy" style={{ ...baseStyle, objectFit:'cover', objectPosition:avatar ? 'center 35%' : 'center top' }} />;
}
