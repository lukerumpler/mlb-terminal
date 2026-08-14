import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const isBrowserTest =
  typeof window !== "undefined" && typeof document !== "undefined";

if (isBrowserTest) {
  // Simulate a fully offline environment for browser tests so fallback-to-static-data
  // code paths remain deterministic.
  global.fetch = vi.fn(() =>
    Promise.reject(new Error("network unavailable (test env)"))
  );

  // jsdom doesn't implement matchMedia by default.
  window.matchMedia =
    window.matchMedia ||
    function (query) {
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
  global.ResizeObserver =
    global.ResizeObserver ||
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  // jsdom's layout engine doesn't compute real sizes, which makes recharts'
  // ResponsiveContainer report 0x0 and skip rendering children.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 500,
  });

  // jsdom doesn't implement Element.scrollIntoView either.
  Element.prototype.scrollIntoView =
    Element.prototype.scrollIntoView || function () {};
}

// Surface any error the app logs via console.error as part of the test output.
const realError = console.error;
global.__consoleErrors = [];
console.error = (...args) => {
  global.__consoleErrors.push(args.map(String).join(" "));
  realError(...args);
};
