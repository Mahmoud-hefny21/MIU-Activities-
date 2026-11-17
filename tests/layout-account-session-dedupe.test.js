'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/js/layout.js'), 'utf8');
const start = source.indexOf('window.__miuAccountSessionRequest = () => {');
const end = source.indexOf('window.loadAccountPhoto', start);
assert.ok(start >= 0 && end > start, 'shared session request helper exists');

test('shares only concurrent account-session reads and allows a later fresh read', async () => {
  let calls = 0;
  const window = {};
  const sandbox = {
    window,
    fetch: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ authenticated: false }) };
    }
  };
  vm.runInNewContext(source.slice(start, end), sandbox);

  const first = window.__miuAccountSessionRequest();
  const second = window.__miuAccountSessionRequest();
  assert.strictEqual(first, second);
  assert.deepEqual(await first, { authenticated: false });
  assert.equal(calls, 1);
  assert.deepEqual(await window.__miuAccountSessionRequest(), { authenticated: false });
  assert.equal(calls, 2);
});
