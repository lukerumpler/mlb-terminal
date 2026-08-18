import React from 'react';
import { C, px, sans } from '../constants/colors.js';
import { SkeletonBlock } from './atoms.jsx';

function SkeletonLine({ width = '100%', height = 10, style = {} }) {
  return <SkeletonBlock width={width} height={height} radius={4} style={style} />;
}

function SkeletonPanel({ titleWidth = '34%', rows = 4, height }) {
  return (
    <div className="skip-skeleton-panel" style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      minHeight: height,
    }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.borderLight}`, background: C.surface2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonLine width={titleWidth} height={10} />
        <SkeletonLine width={52} height={18} />
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SkeletonLine width={index % 2 ? '20%' : '28%'} height={9} />
            <SkeletonLine width={index % 3 === 0 ? '42%' : '30%'} height={9} />
            <div style={{ flex: 1 }} />
            <SkeletonLine width={index % 2 ? 34 : 46} height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamOverviewSkeleton() {
  return (
    <div className="skip-overview-skeleton" role="status" aria-live="polite" aria-label="Loading team overview" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SkeletonLine width="23%" height={9} />
      <div className="skip-overview-skeleton-command" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SkeletonLine width="28%" height={10} />
          <SkeletonLine width="42%" height={27} />
          <SkeletonLine width="58%" height={10} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SkeletonLine width={92} height={30} />
          <SkeletonLine width={132} height={30} />
        </div>
      </div>
      <div className="skip-overview-skeleton-context" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <SkeletonLine width={178} height={34} />
        <SkeletonLine width={178} height={34} />
        <div style={{ display: 'flex', gap: 18, flex: '1 1 360px', justifyContent: 'space-between' }}>
          {Array.from({ length: 5 }, (_, index) => <SkeletonLine key={index} width={index === 0 ? 58 : 38} height={22} />)}
        </div>
      </div>
      <div className="skip-overview-skeleton-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {Array.from({ length: 8 }, (_, index) => <div key={index} style={{ padding: '14px 10px', borderRight: index < 7 ? `0.5px solid ${C.borderLight}` : 'none', display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}><SkeletonLine width="46%" height={18} /><SkeletonLine width="62%" height={8} /></div>)}
      </div>
      <div className="skip-overview-skeleton-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <SkeletonPanel rows={6} height={224} />
        <SkeletonPanel rows={4} height={224} />
        <SkeletonPanel rows={5} height={224} />
      </div>
    </div>
  );
}

export function RosterInsightsTableSkeleton() {
  return (
    <div className="skip-roster-insights-skeleton" role="status" aria-live="polite" aria-label="Loading roster insight table">
      <div className="skip-roster-insights-skeleton-controls">
        <SkeletonLine width={164} height={30} />
        <SkeletonLine width={112} height={30} />
        <SkeletonLine width={86} height={30} />
      </div>
      <div className="skip-roster-insights-skeleton-table">
        <div className="skip-roster-insights-skeleton-row is-header">
          {Array.from({ length: 4 }, (_, index) => <SkeletonLine key={index} width={index === 0 ? '54%' : '48%'} height={8} />)}
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skip-roster-insights-skeleton-row" key={index}>
            <SkeletonLine width={index % 2 ? '64%' : '72%'} height={11} />
            <SkeletonLine width="34%" height={10} />
            <SkeletonLine width="46%" height={10} />
            <SkeletonLine width="42%" height={11} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading verified roster statistics and player metrics.</span>
    </div>
  );
}

export function PlayerProfileSkeleton() {
  return (
    <div className="skip-profile-skeleton" role="status" aria-live="polite" aria-label="Loading player profile" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="skip-profile-skeleton-hero" style={{ display: 'flex', gap: 16, padding: '16px 4px', alignItems: 'center', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <SkeletonBlock width={88} height={110} radius={10} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SkeletonLine width="38%" height={22} />
          <SkeletonLine width="24%" height={11} />
          <SkeletonLine width="52%" height={10} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {Array.from({ length: 5 }, (_, index) => <SkeletonLine key={index} width={index === 0 ? 60 : 52} height={28} />)}
          </div>
        </div>
      </div>
      <div className="skip-profile-skeleton-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <SkeletonPanel rows={5} height={180} />
        <SkeletonPanel rows={5} height={180} />
        <SkeletonPanel rows={5} height={180} />
      </div>
      <div className="skip-profile-skeleton-lower" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <SkeletonPanel rows={7} height={210} />
        <SkeletonPanel rows={7} height={210} />
      </div>
      <div style={sans({ fontSize: 10, color: C.text3, textAlign: 'center' })}>Loading profile, season stats, career splits, and Statcast context…</div>
    </div>
  );
}

export function PlayerProfileHydrationSkeleton() {
  return (
    <section className="skip-profile-hydration-skeleton" role="status" aria-live="polite" aria-label="Loading supplemental player profile data" style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '10px 12px', background: C.surface2, border: `0.5px solid ${C.border}`, borderRadius: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={px({ fontSize: 9, fontWeight: 800, color: C.teal, letterSpacing: '.08em', textTransform: 'uppercase' })}>Core MLB profile ready</div>
        <div style={px({ fontSize: 9, color: C.text3 })}>Hydrating optional context</div>
      </div>
      <div className="skip-profile-hydration-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {[
          ['Statcast & Savant', 3],
          ['Contract & financials', 2],
          ['Career & boxscore context', 3],
        ].map(([label, rows]) => (
          <div key={label} style={{ minWidth: 0, padding: '9px 10px', borderRadius: 7, background: C.surface, border: `0.5px solid ${C.borderLight}` }}>
            <div style={px({ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8 })}>{label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Array.from({ length: rows }, (_, index) => <SkeletonLine key={index} width={index === 0 ? '70%' : index === 1 ? '92%' : '56%'} height={7} />)}
            </div>
          </div>
        ))}
      </div>
      <div style={sans({ fontSize: 10, color: C.text3, lineHeight: 1.35 })}>Loading verified supplemental data. Any unavailable fields will remain labeled as unavailable rather than estimated.</div>
    </section>
  );
}
