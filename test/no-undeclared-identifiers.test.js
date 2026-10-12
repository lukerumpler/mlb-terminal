import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import globals from 'globals';

const traverse = _traverse.default ?? _traverse;

// An identifier that is read but never declared or imported is a ReferenceError waiting
// for the first time that line runs. Handlers wrap work in try/catch and event handlers
// only run on click, so these ship silently: `providerJson` (typo for fetchProviderJson)
// made the Baseball-Reference player fallback always report "unavailable";
// `formatWinPct` broke the standings CSV export; `SEASON` (imported as CURRENT_SEASON)
// broke the Overview PDF export. Scope analysis finds them without running anything.
const ROOT = process.cwd();
const SCAN_DIRS = ['client/src', 'server', 'api'];
const KNOWN_GLOBALS = new Set(Object.keys({
  ...globals.builtin, ...globals.es2021, ...globals.browser, ...globals.node,
}));

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('__old_')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(js|jsx|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function undeclared(file) {
  const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  const found = [];
  traverse(ast, {
    Program(path) {
      for (const [name, node] of Object.entries(path.scope.globals)) {
        if (!KNOWN_GLOBALS.has(name)) found.push(`${relative(ROOT, file)}:${node.loc?.start.line} ${name}`);
      }
    },
  });
  return found;
}

describe('shipped source has no undeclared identifiers', () => {
  it('every client and server module only reads names it declares, imports, or the platform provides', () => {
    const files = SCAN_DIRS.flatMap(dir => sourceFiles(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(100); // the scan really ran
    expect(files.flatMap(undeclared).sort()).toEqual([]);
  });

  it('detects an undeclared name (the scanner itself works)', () => {
    const ast = parse('import { a } from "x"; export const f = () => a + notDeclared;', { sourceType: 'module' });
    let names = [];
    traverse(ast, { Program(path) { names = Object.keys(path.scope.globals); } });
    expect(names).toEqual(['notDeclared']);
  });
});
