const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  registerPostEventReports, eventEndKey, isEventCompleted, blockingEvents, summarizeEvaluations, validateEvaluation, BLOCKED_MESSAGE
} = require('../services/post-event-reports');

const query = (value) => ({ select() { return this; }, lean: async () => value });
const NOW = new Date('2026-12-10T12:00:00Z'); // 14:00 in Cairo
const goodEvaluation = { rating: 4, answers: { satisfaction: 5, organization: 4, usefulness: 4, attendAgain: 'Yes', improvements: 'More seats' }, comment: 'Great' };

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && Array.isArray(value.$in)) return value.$in.includes(row[key]);
    return row[key] === value;
  });
}

async function harness(t, { events, closures = [] } = {}) {
  const reports = [], evaluations = [];
  const club = { id: 1, name: 'Debate Club', image: '', events: events || [
    { requestId: 10, title: 'Finished event', date: '2026-12-01', location: 'Hall A' },
    { requestId: 11, title: 'Future event', date: '2026-12-20', location: 'Hall B' },
    { requestId: 12, title: 'Old event', date: '2026-10-01', location: 'Hall C' }
  ] };
  const accounts = {
    president: { role: 'president', clubId: 1, email: 'president@miu.edu' },
    otherPresident: { role: 'president', clubId: 2, email: 'other@miu.edu' },
    supervisor: { role: 'supervisor', assignedClubIds: [1], email: 'supervisor@miu.edu' },
    otherSupervisor: { role: 'supervisor', assignedClubIds: [5], email: 'supervisor2@miu.edu' },
    pr: { role: 'pr', email: 'pr@miu.edu' }, english: { role: 'english', email: 'english@miu.edu' }, dean: { role: 'dean', email: 'dean@miu.edu' },
    head: { role: 'head', clubId: 1, email: 'head@miu.edu' }
  };
  const Report = {
    find: (filter) => query(reports.filter((row) => matches(row, filter))),
    create: async (value) => {
      if (reports.some((row) => row.clubId === value.clubId && row.eventKey === value.eventKey)) throw Object.assign(new Error(), { code: 11000 });
      const row = { ...value }; reports.push(row); return row;
    },
    findOneAndUpdate: async (filter, update) => {
      const row = reports.find((item) => matches(item, filter));
      if (!row) return null;
      Object.assign(row, update.$set); row.revision += update.$inc?.revision || 0;
      for (const [key, value] of Object.entries(update.$push || {})) row[key] = [...(row[key] || []), value];
      return row;
    }
  };
  const Evaluation = {
    find: (filter) => query(evaluations.filter((row) => matches(row, filter))),
    findOne: (filter) => query(evaluations.find((row) => matches(row, filter)) || null),
    updateOne: async (key, update, options) => {
      const row = evaluations.find((item) => matches(item, key));
      if (row) Object.assign(row, update.$set);
      else if (options.upsert) evaluations.push({ ...key, ...update.$set });
    }
  };
  const app = express(); app.use(express.json());
  registerPostEventReports(app, {
    Club: { findOne: () => query(club), find: () => query([club]) },
    AttendanceActivityClosure: { find: () => query(closures) },
    Report, Evaluation, now: () => NOW,
    getAccount: async (req) => accounts[req.headers['x-as']] || null,
    isAdminSessionValid: async (req) => req.headers['x-as'] === 'admin',
    getStudentAccount: async (req) => (req.headers['x-student'] ? { email: req.headers['x-student'] } : null),
    requireStudentAuth: (req, res, next) => {
      if (!req.headers['x-student']) return res.status(401).json({ message: 'Sign in.' });
      req.studentAccount = { email: req.headers['x-student'] }; next();
    },
    sameOrigin: () => true, databaseReady: () => true,
    verifyPhoto: async (photo) => (photo?.publicId === 'miu-event-reports/ok' ? { url: photo.url, publicId: photo.publicId } : null)
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function call(method, path, { as, student, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(as ? { 'x-as': as } : {}), ...(student ? { 'x-student': student } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }
  return { call, reports, evaluations };
}

const reportPath = '/api/post-event-reports/reports/1/request%3A10';
const photo = { url: 'https://res.cloudinary.com/demo/image/upload/miu-event-reports/ok.jpg', publicId: 'miu-event-reports/ok', signature: 'x', version: '1' };
const submission = { revision: 0, submit: true, totalParticipants: 140, externalBeneficiaries: 25, photos: [photo] };

test('events complete at their scheduled end in Cairo, or when attendance is ended early', () => {
  const event = { date: '2026-12-10', scheduledEnd: '13:30', attendanceId: 4 };
  assert.equal(eventEndKey(event), '2026-12-10 13:30');
  assert.equal(isEventCompleted(event, new Set(), NOW), true);
  assert.equal(isEventCompleted({ ...event, scheduledEnd: '15:00' }, new Set(), NOW), false);
  assert.equal(isEventCompleted({ ...event, scheduledEnd: '15:00' }, new Set([4]), NOW), true);
  assert.equal(isEventCompleted({ date: '2026-12-10', attendanceId: 4 }, new Set(), NOW), false, 'no end time means end of day');
  assert.equal(isEventCompleted({ date: 'soon', attendanceId: 4 }, new Set(), NOW), false);
});

test('only completed events from the launch date onward block new requests', () => {
  const events = [
    { completed: true, date: '2026-12-01', report: null },
    { completed: true, date: '2026-12-02', report: { status: 'approved' } },
    { completed: false, date: '2026-12-20', report: null },
    { completed: true, date: '2026-10-01', report: null }
  ];
  assert.deepEqual(blockingEvents(events).map((event) => event.date), ['2026-12-01']);
});

test('reports cannot be submitted before the event ends; details are filled from the approved event', async (t) => {
  const { call } = await harness(t);
  const future = await call('PUT', '/api/post-event-reports/reports/1/request%3A11', { as: 'president', body: submission });
  assert.equal(future.status, 409);
  assert.match(future.body.message, /after the event has finished/);
  const view = await call('GET', reportPath, { as: 'president' });
  assert.equal(view.status, 200);
  assert.deepEqual([view.body.event.clubName, view.body.event.title, view.body.event.date, view.body.event.location], ['Debate Club', 'Finished event', '2026-12-01', 'Hall A']);
  assert.equal(view.body.canEdit, true);
  assert.equal(view.body.evaluation.count, 0);
});

test('one combined participant number, verified photos, server-side validation and no duplicate reports', async (t) => {
  const { call, reports } = await harness(t);
  for (const body of [
    { ...submission, totalParticipants: -1 }, { ...submission, totalParticipants: 2.5 }, { ...submission, externalBeneficiaries: 'many' },
    { ...submission, totalParticipants: null }, { ...submission, photos: [] }, { ...submission, photos: Array(13).fill(photo) }
  ]) assert.equal((await call('PUT', reportPath, { as: 'president', body })).status, 400);
  assert.equal((await call('PUT', reportPath, { as: 'president', body: { ...submission, photos: [{ ...photo, publicId: 'forged' }] } })).status, 400);
  const draft = await call('PUT', reportPath, { as: 'president', body: { revision: 0, submit: false, totalParticipants: null, externalBeneficiaries: null, photos: [] } });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.report.status, 'draft');
  assert.equal((await call('PUT', reportPath, { as: 'president', body: submission })).status, 409, 'a stale revision cannot create a second report');
  const submitted = await call('PUT', reportPath, { as: 'president', body: { ...submission, revision: 1 } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.report.status, 'pending_supervisor');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totalParticipants, 140);
  assert.equal(reports[0].eventRequestId, 10);
  assert.equal((await call('PUT', reportPath, { as: 'president', body: { ...submission, revision: 2 } })).status, 409, 'locked while under review');
  assert.equal((await call('PUT', reportPath, { as: 'otherPresident', body: submission })).status, 403);
});

test('reviews run Supervisor, PR, English, Dean in order; changes requested return to the president and restart review', async (t) => {
  const { call, reports } = await harness(t);
  await call('PUT', reportPath, { as: 'president', body: submission });
  const decide = (as, action = 'approve', comment = '') => call('POST', `${reportPath}/decision`, { as, body: { action, comment, revision: reports[0].revision } });
  for (const outOfOrder of ['pr', 'dean']) assert.equal((await decide(outOfOrder)).status, 409);
  assert.equal((await decide('english')).status, 403, 'English cannot see a report before it reaches its stage');
  assert.equal((await decide('otherSupervisor')).status, 403, 'unassigned supervisors cannot see the report');
  assert.equal((await decide('supervisor', 'request_changes')).status, 400, 'a comment is mandatory');
  assert.equal((await decide('supervisor', 'request_changes', 'Add more photos')).status, 200);
  assert.equal(reports[0].status, 'changes_requested');
  const view = await call('GET', reportPath, { as: 'president' });
  assert.equal(view.body.canEdit, true);
  assert.equal((await call('PUT', reportPath, { as: 'president', body: { ...submission, revision: reports[0].revision } })).status, 200);
  for (const [as, next] of [['supervisor', 'pending_pr'], ['pr', 'pending_english'], ['english', 'pending_dean'], ['dean', 'approved']]) {
    assert.equal((await decide(as)).status, 200);
    assert.equal(reports[0].status, next);
  }
  assert.deepEqual(reports[0].approvals.map((approval) => approval.role), ['supervisor', 'pr', 'english', 'dean']);
  assert.ok(reports[0].fullyApprovedAt);
  assert.deepEqual(reports[0].history.map((entry) => entry.action), ['submitted', 'changes_requested', 'resubmitted', 'approved', 'approved', 'approved', 'approved']);
  assert.equal((await decide('dean')).status, 409, 'nothing left to approve');
});

test('the club is blocked until every required report is fully approved, then unblocked', async (t) => {
  const { call, reports } = await harness(t);
  let status = await call('GET', '/api/post-event-reports/block-status', { as: 'president' });
  assert.equal(status.body.blocked, true);
  assert.equal(status.body.message, BLOCKED_MESSAGE);
  assert.deepEqual(status.body.pendingReports.map((item) => [item.title, item.statusLabel]), [['Finished event', 'Report Required']]);
  assert.match(status.body.pendingReports[0].link, /post-event-reports\.html\?club=1&event=request%3A10/);
  assert.equal((await call('GET', '/api/post-event-reports/block-status', { as: 'head' })).body.blocked, true, 'applies to the whole club');
  await call('PUT', reportPath, { as: 'president', body: submission });
  for (const as of ['supervisor', 'pr', 'english']) {
    await call('POST', `${reportPath}/decision`, { as, body: { action: 'approve', revision: reports[0].revision } });
    assert.equal((await call('GET', '/api/post-event-reports/block-status', { as: 'president' })).body.blocked, true);
  }
  await call('POST', `${reportPath}/decision`, { as: 'dean', body: { action: 'approve', revision: reports[0].revision } });
  status = await call('GET', '/api/post-event-reports/block-status', { as: 'president' });
  assert.equal(status.body.blocked, false);
});

test('students evaluate completed events once, can edit, and see photos only after final approval', async (t) => {
  const { call, reports, evaluations } = await harness(t);
  const feedback = '/api/event-feedback/1/0';
  assert.equal((await call('PUT', '/api/event-feedback/1/1', { student: 'a@miu.edu', body: goodEvaluation })).status, 409, 'future events cannot be evaluated');
  assert.equal((await call('PUT', feedback, { body: goodEvaluation })).status, 401);
  for (const body of [{ ...goodEvaluation, rating: 6 }, { ...goodEvaluation, answers: { ...goodEvaluation.answers, attendAgain: 'Sure' } }, { ...goodEvaluation, comment: 'x'.repeat(1001) }]) {
    assert.equal((await call('PUT', feedback, { student: 'a@miu.edu', body })).status, 400);
  }
  assert.equal((await call('PUT', feedback, { student: 'A@miu.edu', body: goodEvaluation })).status, 200);
  assert.equal((await call('PUT', feedback, { student: 'a@miu.edu', body: { ...goodEvaluation, rating: 2 } })).status, 200);
  assert.equal(evaluations.length, 1, 'a second submission edits the first');
  assert.equal(evaluations[0].rating, 2);
  await call('PUT', feedback, { student: 'b@miu.edu', body: goodEvaluation });
  let view = await call('GET', feedback, { student: 'a@miu.edu' });
  assert.equal(view.body.evaluation.mine.rating, 2);
  assert.deepEqual(view.body.photos, []);
  assert.equal(view.body.report, null, 'no report details before final approval');
  assert.equal(view.body.reportStatus, 'missing');
  await call('PUT', reportPath, { as: 'president', body: submission });
  assert.equal((await call('GET', feedback, {})).body.reportStatus, 'in_review');
  for (const as of ['supervisor', 'pr', 'english', 'dean']) await call('POST', `${reportPath}/decision`, { as, body: { action: 'approve', revision: reports[0].revision } });
  view = await call('GET', feedback, {});
  assert.deepEqual(view.body.photos, [{ url: photo.url }]);
  assert.equal(view.body.reportStatus, 'approved');
  assert.deepEqual([view.body.report.totalParticipants, view.body.report.externalBeneficiaries, view.body.report.rating], [140, 25, { average: 3, count: 2 }]);
  assert.equal(JSON.stringify(view.body).includes('miu.edu'), false, 'the public summary has no student identities');
  const results = (await call('GET', reportPath, { as: 'pr' })).body.evaluation;
  assert.equal(results.count, 2);
  assert.equal(results.average, 3);
  assert.equal(JSON.stringify(results).includes('miu.edu'), false, 'results never reveal student identities');
});

test('evaluation results follow role scope', async (t) => {
  const { call, reports } = await harness(t);
  await call('PUT', reportPath, { as: 'president', body: submission });
  for (const as of ['president', 'supervisor', 'pr', 'dean', 'admin']) assert.equal((await call('GET', reportPath, { as })).status, 200, as);
  assert.equal((await call('GET', reportPath, { as: 'english' })).status, 403, 'English sees reports once they reach its stage');
  for (const as of ['otherPresident', 'otherSupervisor']) assert.equal((await call('GET', reportPath, { as })).status, 403, as);
  assert.equal((await call('GET', reportPath, {})).status, 401);
  for (const as of ['supervisor', 'pr']) await call('POST', `${reportPath}/decision`, { as, body: { action: 'approve', revision: reports[0].revision } });
  assert.equal((await call('GET', reportPath, { as: 'english' })).status, 200);
  const admin = await call('GET', '/api/post-event-reports/overview', { as: 'admin' });
  assert.deepEqual(admin.body.blockedClubs, [{ id: 1, name: 'Debate Club', pending: 1 }]);
  const queue = await call('GET', '/api/post-event-reports/overview', { as: 'english' });
  assert.equal(queue.body.reports[0].awaitingYou, true);
});

test('evaluation answers are validated and summaries are anonymous aggregates', () => {
  assert.ok(validateEvaluation(goodEvaluation).rating);
  assert.ok(validateEvaluation({ ...goodEvaluation, answers: { ...goodEvaluation.answers, satisfaction: 0 } }).error);
  const summary = summarizeEvaluations([{ rating: 5, answers: { attendAgain: 'Yes', satisfaction: 5 }, comment: 'Loved it' }, { rating: 3, answers: { attendAgain: 'No', satisfaction: 3 } }]);
  assert.equal(summary.average, 4);
  assert.deepEqual(summary.distribution.find((row) => row.star === 5), { star: 5, count: 1 });
  assert.deepEqual(summary.questions.find((q) => q.id === 'attendAgain').counts, [{ option: 'Yes', count: 1 }, { option: 'Maybe', count: 0 }, { option: 'No', count: 1 }]);
  assert.deepEqual(summary.comments, ['Loved it']);
});
