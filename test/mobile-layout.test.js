import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stylesheet = fs.readFileSync(
  path.resolve(process.cwd(), 'client/src/index.css'),
  'utf8',
);

describe('mobile command-center layout contract', () => {
  it('reserves space below the scrollable content for the fixed ticker and safe area', () => {
    expect(stylesheet).toContain('padding-bottom:calc(64px + env(safe-area-inset-bottom)) !important;');
  });

  it('keeps mobile workspace navigation touch-friendly and horizontally scrollable', () => {
    expect(stylesheet).toContain('scroll-snap-type:x proximity;');
    expect(stylesheet).toContain('.skip-mobile-workspace-switcher button {\n    min-height:36px;');
  });

  it('raises overview controls to a phone-friendly touch target', () => {
    expect(stylesheet).toContain('.skip-overview-page select,\n  .skip-overview-page button,\n  .skip-overview-page input {\n    min-height:38px;');
  });
});
