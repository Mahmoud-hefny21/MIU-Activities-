// BL-10: a My Forms code opens only the exact application it was issued for, and when that application
// belongs to a student account, only while that same account is signed in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');

const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const slice = (from, to) => { const start = source.indexOf(from), end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, from); return source.slice(start, end); };
const query = value => ({ read() { return this; }, readConcern() { return this; }, select() { return this; }, lean: async () => value && structuredClone(value) });

async function harness(t) {
  const app = express();
  app.use(express.json());
  const rows = [], writes = [], deletes = [];
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => key === '$or' ? value.some(part => matches(row, part))
    : value && typeof value === 'object' && '$ne' in value ? row[key] !== value.$ne : String(row[key]) === String(value));
  const context = {
    app, crypto, Buffer, console, applications: [], mongoReady: true, clubs: [],
    limitMyFormAccessAttempts: (req, res, next) => next(),
    requireLiveDatabase: () => true,
    getStudentAccountFromRequest: async req => req.headers['x-student'] ? { _id: req.headers['x-student'], email: req.headers['x-student'] + '@miuegypt.edu.eg' } : null,
    cleanText: value => String(value || '').trim(),
    studentFields: require('../public/assets/js/student-fields'),
    Club: { findOne: () => ({ select() { return this; }, lean: async () => ({ id: 1, interviewSlots: [] }) }) },
    Application: {
      findOne: filter => query(rows.find(row => matches(row, filter)) || null),
      findOneAndUpdate: (filter, update) => { writes.push(filter); const row = rows.find(item => matches(item, filter)); return { lean: async () => row ? { ...row, ...update.$set } : null }; },
      deleteOne: async filter => { deletes.push(filter); const index = rows.findIndex(row => matches(row, filter)); if (index >= 0) rows.splice(index, 1); return { deletedCount: index >= 0 ? 1 : 0 }; }
    },
    toApiRecord: record => record, removeApplicantPhoto: async () => {}
  };
  vm.createContext(context);
  vm.runInContext(slice('const MY_FORM_CODE_ALPHABET', 'async function limitMyFormAccessAttempts')
    + slice('function getMyFormToken', 'async function initializeMongoData')
    + slice("app.post('/api/my-forms/access'", "app.patch('/api/applications/:id/status'"), context);
  const code = () => vm.runInContext('generateMyFormCode()', context);
  const hash = value => vm.runInContext(`hashMyFormToken(${JSON.stringify(value)})`, context);
  const codes = { guestA: code(), guestB: code(), owned: code() };
  rows.push({ id: 101, clubId: 1, status: 'pending', managementTokenHash: hash(codes.guestA) },
    { id: 202, clubId: 1, status: 'pending', managementTokenHash: hash(codes.guestB) },
    { id: 303, clubId: 1, status: 'pending', managementTokenHash: hash(codes.owned), studentAccountId: 'student-a', email: 'student-a@miuegypt.edu.eg' });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (method, path, code, student, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(code ? { Authorization: `Bearer ${code}` } : {}), ...(student ? { 'x-student': student } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { call, codes, writes, deletes, hash, rows };
}

test("a code never opens another application: A's code on B's application, no code, or a guessed code", async t => {
  const f = await harness(t);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    assert.equal((await f.call(method, '/api/my-forms/202', f.codes.guestA, null, method === 'PATCH' ? { notes: 'x' } : null)).status, 404, `${method} A's code on B`);
    assert.equal((await f.call(method, '/api/my-forms/101', f.codes.guestB, null, method === 'PATCH' ? { notes: 'x' } : null)).status, 404, `${method} B's code on A`);
    assert.equal((await f.call(method, '/api/my-forms/101', 'ABCDEFGHJKLM', null, method === 'PATCH' ? { notes: 'x' } : null)).status, 404, `${method} guessed code`);
    assert.equal((await f.call(method, '/api/my-forms/101', '', null, method === 'PATCH' ? { notes: 'x' } : null)).status, 404, `${method} no code, not signed in`);
  }
  assert.equal(f.writes.length, 0); assert.equal(f.deletes.length, 0);
});

test('an application sent while signed in needs its own account too, not only the code', async t => {
  const f = await harness(t);
  assert.equal((await f.call('PATCH', '/api/my-forms/303', f.codes.owned, null, { notes: 'x' })).status, 403, 'code alone, not signed in');
  assert.equal((await f.call('PATCH', '/api/my-forms/303', f.codes.owned, 'student-b', { notes: 'x' })).status, 403, 'code + a different account');
  assert.equal((await f.call('GET', '/api/my-forms/303', f.codes.owned, 'student-b')).status, 403);
  assert.equal((await f.call('POST', '/api/my-forms/access', f.codes.owned, 'student-b', {})).status, 403);
  assert.equal((await f.call('DELETE', '/api/my-forms/303', f.codes.owned, 'student-b')).status, 403);
  assert.equal(f.writes.length, 0); assert.equal(f.deletes.length, 0);
  const owner = await f.call('PATCH', '/api/my-forms/303', f.codes.owned, 'student-a', { notes: 'changed' });
  assert.equal(owner.status, 200, 'code + the owning account');
  assert.equal(f.writes[0].managementTokenHash, f.hash(f.codes.owned), 'the database write is bound to the code as well');
});

test('an application sent without signing in is opened by its own code alone, and the write is bound to that code', async t => {
  const f = await harness(t);
  assert.equal((await f.call('POST', '/api/my-forms/access', f.codes.guestA, null, {})).status, 200);
  assert.equal((await f.call('GET', '/api/my-forms/101', f.codes.guestA)).status, 200);
  assert.equal((await f.call('PATCH', '/api/my-forms/101', f.codes.guestA, null, { notes: 'changed' })).status, 200);
  assert.equal(f.writes[0].id, 101);
  assert.equal(f.writes[0].managementTokenHash, f.hash(f.codes.guestA));
  assert.equal((await f.call('DELETE', '/api/my-forms/101', f.codes.guestA)).status, 204);
  assert.equal(f.deletes[0].managementTokenHash, f.hash(f.codes.guestA));
});
