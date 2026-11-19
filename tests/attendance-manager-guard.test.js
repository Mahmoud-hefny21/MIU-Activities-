// Regression test for SEC-01: the attendance-manager guard must await the admin session check.
// Without await, the Promise is truthy and every anonymous request was treated as the admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const start = source.indexOf('async function requireAttendanceSessionManager');
const end = source.indexOf('function attendanceTokenHash', start);
const code = source.slice(start, end);

function guard({ staff = null, admin = false }) {
  const context = {
    getClubAccountFromRequest: async () => staff,
    isAdminSessionValid: async () => admin,
    adminAuthState: { email: 'admin@miuegypt.edu.eg' }, getConfiguredAdminEmail: () => 'admin@miuegypt.edu.eg'
  };
  vm.createContext(context);
  vm.runInContext(code + '\nthis.requireAttendanceSessionManager = requireAttendanceSessionManager;', context);
  return context.requireAttendanceSessionManager;
}
const run = async (fn) => {
  const req = {}, res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  await fn(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};

test('anonymous requests are refused by the attendance-manager guard (401, never admin)', async () => {
  const { res, nextCalled, req } = await run(guard({ admin: false }));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(req.clubAccount, undefined);
});

test('a valid admin session and a staff account still pass the guard', async () => {
  const admin = await run(guard({ admin: true }));
  assert.equal(admin.nextCalled, true);
  assert.equal(admin.req.clubAccount.role, 'admin');
  const staff = await run(guard({ staff: { role: 'president', clubId: 1, email: 'p@miuegypt.edu.eg' } }));
  assert.equal(staff.nextCalled, true);
  assert.equal(staff.req.clubAccount.role, 'president');
});
