import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stylesheet = fs.readFileSync(
  path.resolve(process.cwd(), 'client/src/index.css'),
  'utf8',
);
const appSource = fs.readFileSync(
  path.resolve(process.cwd(), 'client/src/App.jsx'),
  'utf8',
);

describe('mobile command-center layout contract', () => {
  it('reserves space below the scrollable content for the fixed ticker and safe area', () => {
    expect(stylesheet).toContain('padding-bottom:calc(72px + env(safe-area-inset-bottom)) !important;');
  });

  it('keeps mobile workspace navigation touch-friendly and horizontally scrollable', () => {
    expect(stylesheet).toContain('scroll-snap-type:x proximity;');
    expect(stylesheet).toContain('.skip-mobile-workspace-switcher button {\n    min-height:36px;');
  });

  it('raises overview controls to a phone-friendly touch target', () => {
    expect(stylesheet).toContain('.skip-overview-page select,\n  .skip-overview-page button,\n  .skip-overview-page input {\n    min-height:38px;');
  });

  it('provides mobile-only quick navigation and condensed comparison card styles', () => {
    expect(stylesheet).toContain('.skip-mobile-bottom-nav {');
    expect(stylesheet).toContain('.skip-mobile-comparison-cards {');
    expect(stylesheet).toContain('.skip-mobile-comparison-card {');
  });

  it('wires guarded touch gestures to the scrollable workspace shell', () => {
    expect(appSource).toContain('handleMobileTouchStart');
    expect(appSource).toContain('handleMobileTouchEnd');
    expect(appSource).toContain("target?.closest?.('button, a, input, select, textarea, table");
    expect(appSource).toContain('MOBILE_SWIPE_TABS');
  });
});
