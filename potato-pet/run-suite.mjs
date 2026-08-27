// Headless run of the Potato Pet hand-rolled suite. Mirrors potato-pet/tests.html:
// same module load order, same harness helpers, same *.tests.js files.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const jsdir = path.join(HERE, 'js');

// --- minimal browser-ish globals ---
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};
const listeners = {};
const windowObj = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  dispatchEvent: ev => { (listeners[ev.type] || []).forEach(fn => fn(ev)); },
};
const documentObj = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  hidden: false,
};
const TESTS = [];
const sandbox = {
  window: windowObj, document: documentObj, localStorage,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  Math, Date, JSON, Object, Array, Set, Map, String, Number, Boolean, Error,
  isNaN, parseInt, parseFloat, console, URL,
  setTimeout, clearTimeout, queueMicrotask,
  AbortController, AbortSignal,
  fetch: () => { throw new Error('real fetch must never be called in the suite'); },
  __pushTests: fn => TESTS.push(fn),
};
// Browser scripts do `window.App = window.App || {}` then use bare `App`;
// in a vm sandbox those are different bindings, so share ONE object.
const appObj = {};
sandbox.App = appObj;
sandbox.window.App = appObj;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
sandbox.window.__pushTests = sandbox.__pushTests;

function load(file) {
  const code = fs.readFileSync(path.join(jsdir, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

// module block — keep in sync with tests.html
[
  'config.js', 'remote.js', 'rng.js', 'save.js', 'world.js', 'state.js',
  'content.js', 'games.js', 'facts.js', 'interactions.js', 'room.js', 'backup.js',
].forEach(load);

// harness helpers — mirror the inline <script> in tests.html
const results = [];
sandbox.assert = (name, cond) => results.push([name, !!cond]);
sandbox.assertEq = (name, a, e) =>
  results.push([name + '  (got ' + JSON.stringify(a) + ')',
                JSON.stringify(a) === JSON.stringify(e)]);
sandbox.assertThrows = (name, fn, msg) => {
  try { fn(); results.push([name + ' — expected throw', false]); }
  catch (e) { results.push([name, !msg || String(e.message).includes(msg)]); }
};
sandbox.assertThrowsAsync = async (name, fn, msg) => {
  try { await fn(); results.push([name + ' — expected throw', false]); }
  catch (e) { results.push([name, !msg || String(e.message).includes(msg)]); }
};

// test-file block — keep in sync with tests.html
[
  'rng.tests.js', 'save.tests.js', 'remote.tests.js', 'world.tests.js', 'state.tests.js',
  'content.tests.js', 'games.tests.js', 'facts.tests.js',
  'interactions.tests.js', 'room.tests.js', 'backup.tests.js',
].forEach(f => {
  if (fs.existsSync(path.join(jsdir, f))) load(f);
});

const run = async () => {
  for (const t of TESTS) {
    try { await t(); } catch (e) { results.push(['THREW: ' + e.message, false]); }
  }
  const pass = results.filter(r => r[1]).length;
  results.filter(r => !r[1]).forEach(f => console.log('FAIL ' + f[0]));
  console.log(`\n${pass} / ${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
};
run();
