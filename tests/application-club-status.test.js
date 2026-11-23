// BL-07: applying to a Full, Closed or Opening-soon club is refused by the server, not only hidden in the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');

function routeWith(clubStatus) {
  const app = express();
  app.use(express.json());
  const reached = [];
  const context = {
    app, studentFields: require('../public/assets/js/student-fields'),
    requireLiveDatabase: () => true,
    Club: { findOne: () => ({ read() { return this; }, readConcern() { return this; }, lean: async () => ({ id: 4, name: 'DIMAS', status: clubStatus }) }) },
    cleanText: value => String(value || '').trim(),
    getManagedCommittees: () => { reached.push('committee check'); return []; },
    console
  };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/applications'");
  const end = source.indexOf("app.get('/api/student/my-forms'", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return { app, reached };
}
const body = { clubId: 4, universityId: '2024/06700', age: 20, committee: 'IT', email: 'student@miuegypt.edu.eg' };

for (const status of ['full', 'closed', 'opening-soon']) {
  test(`a direct application to a ${status} club is rejected with 409`, async t => {
    const { app, reached } = routeWith(status);
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/applications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /not open/);
    assert.deepEqual(reached, [], 'refused before any further processing');
  });
}

test('an open club passes the status check (and continues to the committee check)', async t => {
  const { app, reached } = routeWith('open');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /committee is not accepting/);
  assert.deepEqual(reached, ['committee check']);
});
