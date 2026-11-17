'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/js/report-dashboard-panels.js'), 'utf8');

test('public homepage exits before attaching dashboard panel observers or preloads', () => {
  const document = new Proxy({}, { get() { throw new Error('Dashboard DOM must not be inspected on the public homepage.'); } });
  assert.doesNotThrow(() => vm.runInNewContext(source, { location: { pathname: '/' }, document }));
});
