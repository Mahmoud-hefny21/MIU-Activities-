const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('BUG-03: committee names match regardless of "Committee", case, spacing and punctuation', () => {
  const block = serverSource.match(/function committeeKey[\s\S]*?\n}\nfunction sameCommittee[\s\S]*?\n}/)[0];
  const { sameCommittee } = new Function(`${block}; return { sameCommittee };`)();
  assert.equal(sameCommittee('IT', 'IT Committee'), true);
  assert.equal(sameCommittee('it committee ', 'I.T'), true);
  assert.equal(sameCommittee('HR Committee', 'hr'), true);
  assert.equal(sameCommittee('لجنة الإعلام', 'لجنة الإعلام'), true);
  assert.equal(sameCommittee('Media', 'IT'), false);
  assert.equal(sameCommittee('', ''), false, 'an empty committee never matches');
});

test('BUG-03: a president can assign any member; heads stay limited to their own committee', () => {
  const options = serverSource.slice(serverSource.indexOf("app.get('/api/club/attendance-assignment-options'"), serverSource.indexOf("app.post('/api/club/attendance-assignments'"));
  assert.match(options, /if \(!isPresident && !sameCommittee\(member\.committee, req\.clubAccount\.committee\)\) return;/);
  assert.doesNotMatch(options, /information technology/);
  const assign = serverSource.slice(serverSource.indexOf("app.post('/api/club/attendance-assignments'"), serverSource.indexOf('const activeMemberDayKey'));
  assert.match(assign, /isPresident \|\| sameCommittee\(member\.committee, req\.clubAccount\.committee\)/);
});

test('BUG-11: links opened from another site reload once so SameSite=Strict sessions are sent', () => {
  const gate = serverSource.slice(serverSource.indexOf('const SIGNED_IN_PAGES'), serverSource.indexOf('const requireSpeakerManager'));
  assert.match(gate, /sec-fetch-site'\) === 'cross-site' && req\.get\('sec-fetch-mode'\) === 'navigate'/);
  assert.match(gate, /same-site-reload\.js/);
  assert.equal(fs.readFileSync(path.join(root, 'public/assets/js/same-site-reload.js'), 'utf8').includes('location.replace(location.href)'), true);
  assert.match(serverSource, /code: 'STUDENT_SESSION_REQUIRED'/);
});

test('SEC-01: the club-event cleanup matches exact events and refuses to shift legacy registrations', () => {
  const { plan, TARGETS } = require('../scripts/cleanup/remove-test-club-events.cjs');
  assert.deepEqual(TARGETS.map(t => t.title), ['E2E Tech Talk', 'testing', 'test']);
  const clubs = [
    { id: 1, name: 'Utopia', events: [{ requestId: 1, title: 'Real' }, { requestId: 2, title: 'E2E Tech Talk' }] },
    { id: 2, name: 'MIU-MUNAL', events: [{ requestId: 22, title: 'testing' }, { requestId: 23, title: 'Test' }] }
  ];
  const result = plan(clubs, []);
  assert.deepEqual(result.found.map(f => [f.clubId, f.requestId, f.index]), [[1, 2, 1], [2, 22, 0]]);
  assert.deepEqual(result.missing.map(m => m.requestId), [23], '"Test" with another capitalisation is not touched');
  const blocked = plan(clubs, [{ clubId: 1, eventIndex: 3 }]);
  assert.deepEqual(blocked.blockers, [{ clubId: 1, title: 'E2E Tech Talk', legacyRegistrationsAfterIt: 1 }]);
  assert.deepEqual(plan(clubs, [{ clubId: 1, eventIndex: 3, eventRequestId: 9 }]).blockers, [], 'requestId registrations do not move');
});

test('BUG-12: my-attendance returns only the signed-in student\'s registrations, check-ins and history', async () => {
  const { registerReverseAttendance } = require('../services/reverse-attendance-routes');
  const routes = new Map();
  const app = { get: (route, ...handlers) => routes.set(route, handlers), post() {}, put() {} };
  const chain = rows => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => rows });
  const queries = [];
  registerReverseAttendance(app, {
    service: { context: { resolve: async ref => ({ eventRequestId: 77, source: 'club', club: { image: '/c.png', name: 'Utopia' }, event: { title: 'Workshop', date: '2099-01-01', time: '10:00' } }) } },
    requireStudentAuth: (req, res, next) => next(), sameOrigin: () => true, ready: () => true,
    Club: { findOne: () => chain({ events: [{ requestId: 77 }] }), find: filter => { queries.push(['Club', filter]); return chain([{ id: 3, name: 'Robotics' }]); } },
    UniversityContent: {},
    EventRegistration: { find: filter => { queries.push(['EventRegistration', filter]); return chain([{ clubId: 1, eventIndex: 0, eventRequestId: 77 }]); } },
    AttendanceRecord: { find: filter => { queries.push(['AttendanceRecord', filter]); return chain([
      { clubId: 1, eventRequestId: 77, itemType: 'event', attendedAt: '2026-01-01T10:00:00Z', approvalStatus: 'approved' },
      { clubId: 3, eventRequestId: 5, itemType: 'event', eventTitle: 'Older event', eventDate: '2025-05-05', attendedAt: '2025-05-05T10:00:00Z' }
    ]); } }
  });
  const [, handler] = routes.get('/api/reverse-attendance/my-attendance');
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ method: 'GET', studentAccount: { email: 'Student@MIUEgypt.edu.eg' } }, response);
  assert.equal(response.code, undefined, 'no error status');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(queries.find(([model]) => model === 'AttendanceRecord')[1], { email: 'student@miuegypt.edu.eg' }, 'records come from the session email only');
  assert.equal(response.body.registered[0].attendance.verified, true);
  assert.equal(response.body.registered[0].attendance.approvalStatus, 'approved');
  assert.deepEqual(response.body.history.map(item => [item.title, item.logoLabel, item.attendance.verified]), [['Older event', 'Robotics', true]]);
  assert.equal(response.body.verifiedCount, 2);
});

test('BUG-07/SEC-01: MIU Hub only promotes events dated within one year as upcoming', () => {
  const hub = serverSource.slice(serverSource.indexOf("app.get('/api/miu-hub'"), serverSource.indexOf("app.get('/api/university-content'"));
  assert.match(hub, /item\.date >= today && item\.date <= horizon/);
  assert.match(hub, /getUTCDate\(\) \+ 366/);
});
