/*
Our goal is to catch a name that our code reads but never created or imported. JavaScript only complains about a name like
that (a ReferenceError) the moment the line runs. Our handlers wrap their work in try/catch and our buttons only run when
someone clicks them, so these mistakes shipped without anyone seeing them. Four of them did:
  - providerJson (a typo for fetchProviderJson) made the Baseball-Reference player backup always say "unavailable"
  - formatWinPct (never imported) broke the standings CSV download
  - SEASON (imported as CURRENT_SEASON) broke the Overview PDF download
  - bestCandidate (never declared) made the Spotrac contract reader crash on every match

To solve this we are going to:
  1. Collect every .js, .jsx and .mjs source file in client/src, server and api (not the tests)
  2. Read each file and let Babel work out which names are declared or imported inside it
  3. Keep every name that is used but not declared, unless the browser or Node provides it (like "window" or "Buffer")
  4. Cross-check that our scanner works by giving it a made-up file with a bad name and checking that it finds it

We never run the code, we only read it, so this finds mistakes even in lines no test reaches.
*/
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import globals from 'globals';

const traverse = _traverse.default ?? _traverse;                  // Babel's traverse can arrive wrapped, this unwraps it

// Section A: Inputs

const ROOT = process.cwd();
const SCAN_DIRS = ['client/src', 'server', 'api'];                // The folders that hold our shipped source

const KNOWN_GLOBALS = new Set(Object.keys({                       // Names the platform gives us for free
  ...globals.builtin,                                             // Things like Object, Promise and undefined
  ...globals.es2021,
  ...globals.browser,                                             // Things like window, document and fetch
  ...globals.node,                                                // Things like process and Buffer
}));


// Section B: Finding the files and the bad names

function sourceFiles(dir) {
  /*
  Our "sourceFiles" is a function that lists every source file inside a folder, including its sub-folders. When we give it:
                  a folder path
  it returns to us:
                  a list of file paths (test files and our scratch copies are left out)
  */
  if (!existsSync(dir)) {
    return [];                                                    // A folder that does not exist has no files
  }
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('__old_')) {
      continue;                                                   // Skip installed packages and any scratch copies
    }
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));                           // Go into the sub-folder
    } else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) {
      files.push(path);                                           // A source file that is not a test
    }
  }
  return files;
}

function undeclared(file) {
  /*
  Our "undeclared" is a function that finds names a file uses without creating them. When we give it:
                  a file path
  it returns to us:
                  a list of "file:line name" notes, one for each bad name (an empty list means the file is clean)
  */
  const source = readFileSync(file, 'utf8');
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });   // Babel turns the text into a tree we can walk
  const found = [];

  traverse(tree, {
    Program(path) {
      for (const [name, node] of Object.entries(path.scope.globals)) {   // Babel's list of names used but never declared in this file
        if (!KNOWN_GLOBALS.has(name)) {
          found.push(`${relative(ROOT, file)}:${node.loc?.start.line} ${name}`);   // Not provided by the platform either, so it is a mistake
        }
      }
    },
  });
  return found;
}


// Section C: Our checks

describe('shipped source has no undeclared identifiers', () => {
  it('every client and server module only reads names it declares, imports, or the platform provides', () => {
    const files = [];
    for (const dir of SCAN_DIRS) {
      files.push(...sourceFiles(join(ROOT, dir)));
    }
    expect(files.length).toBeGreaterThan(100);                    // Sanity check, we really did look at the whole project

    const problems = files.flatMap(undeclared).sort();            // Every bad name in every file
    expect(problems).toEqual([]);                                 // We want an empty list
  });

  it('detects an undeclared name (the scanner itself works)', () => {
    const tree = parse('import { a } from "x"; export const f = () => a + notDeclared;', { sourceType: 'module' });
    let names = [];
    traverse(tree, {
      Program(path) {
        names = Object.keys(path.scope.globals);
      },
    });
    expect(names).toEqual(['notDeclared']);                       // "a" is imported so it is fine, "notDeclared" is the mistake
  });
});
