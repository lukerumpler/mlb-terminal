import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Simulate a fully offline environment: every fetch rejects, the way it
// would if the sandbox has no network access. This is the harshest real
// scenario for the app's fallback-to-static-data code paths, and the one
// this test environment can actually reach — a real browser with a working
// connection is a strictly easier case for the app to handle.
global.fetch = vi.fn(() => Promise.reject(new Error('network unavailable (test env)')));

// jsdom doesn't implement matchMedia by default.
window.matchMedia = window.matchMedia || function (query) {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
};

// recharts' ResponsiveContainer needs this in non-browser environments.
global.ResizeObserver = global.ResizeObserver || class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom's layout engine doesn't compute real sizes, which makes recharts'
// ResponsiveContainer report 0x0 and skip rendering children. Stub a
// reasonable size so chart internals still mount and run.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 500 });

// jsdom doesn't implement Element.scrollIntoView either.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};

// Surface any error the app logs via console.error as part of the test
// output (React logs component errors here even when caught by an error
// boundary), without making the whole suite hard-fail on React's own
// noisy act()/deprecation warnings.
const realError = console.error;
global.__consoleErrors = [];
console.error = (...args) => {
  global.__consoleErrors.push(args.map(String).join(' '));
  realError(...args);
};
