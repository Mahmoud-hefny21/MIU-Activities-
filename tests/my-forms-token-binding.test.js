// BL-10: a My Forms code edits only the exact application it was issued for.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');

const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const slice = (from, to) => { const start = source.indexOf(from), end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, from); return source.slice(start, end); };

async function harness(t) {
  const app = express();
  app.use(express.json());
  const writes = [];
  const context = {
    app, crypto, Buffer, console, applications: [], mongoReady: true, clubs: [],
    limitMyFormAccessAttempts: (req, res, next) => next(),
    requireLiveDatabase: () => true,
    cleanText: value => String(value || '').trim(),
    studentFields: require('../public/assets/js/student-fields'),
    Club: { findOne: () => ({ select() { return this; }, lean: async () => ({ id: 1, interviewSlots: [] }) }) },
    Application: { findOneAndUpdate: (filter, update) => { writes.push(filter); return { lean: async () => ({ id: filter.id, ...update.$set }) }; } },
    toApiRecord: record => record, removeApplicantPhoto: async () => {}
  };
  vm.createContext(context);
  vm.runInContext(slice('const MY_FORM_CODE_ALPHABET', 'async function limitMyFormAccessAttempts')
    + slice('function getMyFormToken', 'async function initializeMongoData')
    + slice("app.patch('/api/my-forms/:id'", "app.delete('/api/my-forms/:id'"), context);
  const codeA = vm.runInContext('generateMyFormCode()', context), codeB = vm.runInContext('generateMyFormCode()', context);
  const hash = code => vm.runInContext(`hashMyFormToken(${JSON.stringify(code)})`, context);
  context.applications.push({ id: 101, clubId: 1, status: 'pending', managementTokenHash: hash(codeA) },
    { id: 202, clubId: 1, status: 'pending', managementTokenHash: hash(codeB) });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const patch = (id, code) => fetch(`http://127.0.0.1:${server.address().port}/api/my-forms/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(code ? { Authorization: `Bearer ${code}` } : {}) },
    body: JSON.stringify({ notes: 'changed' })
  });
  return { patch, codeA, codeB, writes, hash };
}

test("A's code cannot edit B's application, and no code edits nothing", async t => {
  const f = await harness(t);
  assert.equal((await f.patch(202, f.codeA)).status, 404, "A's code on B's application");
  assert.equal((await f.patch(101, f.codeB)).status, 404, "B's code on A's application");
  assert.equal((await f.patch(101, '')).status, 404, 'no code and not signed in');
  assert.equal((await f.patch(101, 'ABCDEFGHJKLM')).status, 404, 'a guessed code');
  assert.equal(f.writes.length, 0, 'nothing was written');
});

test("A's code edits A's application, and the database write is also bound to A's code", async t => {
  const f = await harness(t);
  const response = await f.patch(101, f.codeA);
  assert.equal(response.status, 200);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].id, 101);
  assert.equal(f.writes[0].managementTokenHash, f.hash(f.codeA));
});
