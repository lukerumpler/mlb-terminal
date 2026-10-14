import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { expect, vi } from "vitest";

// Provider proxy tests must not read shared production durable-cache rows.
// The application still uses durable caching in development and production.
process.env.NODE_ENV = "test";

const isBrowserTest =
  typeof window !== "undefined" && typeof document !== "undefined";

if (isBrowserTest) {
  // Testing Library only waits 1 second by default for something to show up on the screen (findBy and waitFor).
  // Loading a whole page (Overview, Prospects, App) can take longer than that when the computer is busy, so a test
  // that is correct fails at random. We raise the wait to 10 seconds. It costs nothing when the element shows up
  // quickly, it only makes a test that is truly broken fail a little later. A { timeout } written inside a test still wins.
  //
  // Loading Testing Library takes about 90 ms, so only the files that can use it pay for it: any .jsx test,
  // any file that mentions it, or any file we cannot read.
  let usesTestingLibrary = true;                                                  // When in doubt, set it up
  try {
    const testPath = expect.getState().testPath || "";                            // The test file that is about to run
    usesTestingLibrary =
      !testPath ||                                                                // We could not tell which file it is
      testPath.endsWith(".jsx") ||                                                // Every .jsx test draws something on the screen
      readFileSync(testPath, "utf8").includes("@testing-library");                // Or the file says it uses the library
  } catch {
    usesTestingLibrary = true;                                                    // If we cannot read the file, set it up anyway
  }
  if (usesTestingLibrary) {
    const { configure } = await import("@testing-library/dom");
    configure({ asyncUtilTimeout: 10_000 });                                      // Wait up to 10 seconds instead of 1
  }

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
