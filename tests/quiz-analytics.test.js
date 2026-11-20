const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { scoreSubmission, registerQuizAnalytics } = require('../services/quiz-analytics');
const { aggregateStream } = require('../database/aggregate-stream');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../public/assets/js/quiz.js'), 'utf8'), context);
const engine = context.MiuQuizEngine;
const answers = Object.fromEntries(engine.QUESTIONS.map(question => [question.id, question.options[0].id]));
const CLUBS = [{ id: 1, name: 'Current club name', category: 'Coding and programming', status: 'open' }, { id: 999, name: '<New club>', category: 'Model United Nations debate', status: 'open' }, { id: 5, name: 'Theatre', category: 'Drama and music', status: 'closed' }];
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

function fixture() {
  const saved = new Map();
  const routes = new Map();
  const model = {
    async findOneAndUpdate(filter, operation) { saved.set(filter.attemptId, structuredClone(operation.$set)); },
    async countDocuments(filter) { return (await aggregateStream((async function* () { yield* saved.values(); })(), [{ $match: filter }])).length; },
    aggregate(pipeline) { return aggregateStream((async function* () { yield* saved.values(); })(), pipeline); }
  };
  const app = { post: (url, ...handlers) => routes.set('POST ' + url, handlers), get: (url, ...handlers) => routes.set('GET ' + url, handlers) };
  let ready = true;
  registerQuizAnalytics(app, {
    model, getClubs: () => CLUBS,
    getAccountEmail: async req => req.email,
    requireAdmin: (req, res, next) => req.admin ? next() : res.status(401).json({ message: 'Sign in.' }),
    requireLiveDatabase: res => ready || (res.status(503).json({ message: 'Unavailable' }), false)
  });
  return {
    saved, setReady: value => { ready = value; },
    async call(method, url, body, admin = false, email = 'one@example.test') {
      const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
      const handlers = routes.get(method + ' ' + url);
      const run = async index => handlers[index] && handlers[index]({ body, admin, email }, res, () => run(index + 1));
      await run(0);
      return res;
    }
  };
}

test('rejects missing or invalid answers', () => {
  assert.equal(scoreSubmission({ answers: {} }, CLUBS), null);
  assert.equal(scoreSubmission({ answers: { ...answers, q10: 'bad' } }, CLUBS), null);
  assert.equal(scoreSubmission({}, CLUBS), null);
});
test('scores on the server (top clubs get 3, 2, 1) and ignores submitted point values', () => {
  const baseline = scoreSubmission({ answers }, CLUBS);
  assert.ok(baseline.scores.length >= 1 && baseline.scores.length <= 3);
  assert.equal(baseline.scores[0].points, 3);
  assert.deepEqual(scoreSubmission({ answers, scores: [{ clubId: 1, points: 999999 }] }, CLUBS), baseline);
});
test('quiz has 10 short questions and recommends the 3 best open clubs', () => {
  assert.equal(engine.QUESTIONS.length, 10);
  assert.ok(engine.QUESTIONS.every(q => q.text.length <= 40 && q.options.every(o => o.label.length <= 24)));
  const tech = Object.fromEntries(engine.QUESTIONS.map(q => [q.id, (q.options.find(o => o.tags.tech) || q.options[0]).id]));
  const top = engine.recommend([...CLUBS, { id: 7, name: 'Rawi', tagline: 'Storytelling', status: 'open' }], tech);
  assert.equal(top[0].club.id, 1, 'the coding club wins for tech answers');
  assert.ok(top.every(row => row.club.status !== 'closed'));
  assert.ok(top[0].reasons.includes('technology'));
});
test('totals are private, start at zero, include new clubs and use current names', async () => {
  const f = fixture();
  assert.equal((await f.call('GET', '/api/admin/quiz-points')).statusCode, 401);
  const result = await f.call('GET', '/api/admin/quiz-points', null, true);
  assert.equal(result.data.totalSubmissions, 0);
  assert.ok(result.data.clubs.every(club => club.points === 0));
  assert.equal(result.data.clubs.find(club => club.clubId === 1).name, 'Current club name');
  assert.ok(result.data.clubs.some(club => club.clubId === 999));
});
test('retakes and new browser attempt IDs cannot add a second contribution for the same account', async () => {
  const f = fixture();
  const send = (attemptId, selected = answers) => f.call('POST', '/api/quiz/submissions', { attemptId, answers: selected });
  assert.equal((await send(first)).statusCode, 200);
  await send(first);
  assert.equal(f.saved.size, 1);
  const changed = { ...answers, q1: 'q1b', q3: 'q3b' };
  await send(first, changed);
  await send(second, changed);
  assert.equal(f.saved.size, 1);
  await f.call('POST', '/api/quiz/submissions', { attemptId: first, answers }, false, 'two@example.test');
  assert.equal(f.saved.size, 2);
  const result = (await f.call('GET', '/api/admin/quiz-points', null, true)).data;
  assert.equal(result.totalSubmissions, 2);
  const expected = new Map();
  for (const attempt of [scoreSubmission({ answers: changed }, CLUBS), scoreSubmission({ answers }, CLUBS)]) {
    for (const row of attempt.scores) expected.set(row.clubId, (expected.get(row.clubId) || 0) + row.points);
  }
  for (const row of result.clubs) assert.equal(row.points, expected.get(row.clubId) || 0);
  assert.ok(result.clubs.every((row, index, rows) => !index || rows[index - 1].points >= row.points));
});
test('account identity comes from the session, is normalized, and cannot be forged in the payload', async () => {
  const f = fixture();
  await f.call('POST', '/api/quiz/submissions', { attemptId: first, answers, email: 'forged@example.test' }, false, ' ONE@EXAMPLE.TEST ');
  await f.call('POST', '/api/quiz/submissions', { attemptId: second, answers, accountId: 'different' }, false, 'one@example.test');
  assert.equal(f.saved.size, 1);
  assert.ok([...f.saved.keys()][0].startsWith('account:'));
  assert.ok(!JSON.stringify([...f.saved.values()]).includes('example.test'));
});
test('guests contribute no points and old anonymous attempts are excluded without deleting them', async () => {
  const f = fixture();
  const response = await f.call('POST', '/api/quiz/submissions', { attemptId: first, answers, email: 'forged@example.test' }, false, '');
  assert.equal(response.statusCode, 401);
  assert.equal(f.saved.size, 0);
  f.saved.set(first, { attemptId: first, ...scoreSubmission({ answers }, CLUBS) });
  const totals = (await f.call('GET', '/api/admin/quiz-points', null, true)).data;
  assert.equal(totals.totalSubmissions, 0);
  assert.ok(totals.clubs.every(club => club.points === 0));
  assert.equal(f.saved.size, 1);
});
test('invalid submissions and database outages never report a successful save', async () => {
  const f = fixture();
  assert.equal((await f.call('POST', '/api/quiz/submissions', {})).statusCode, 400);
  assert.equal(f.saved.size, 0);
  f.setReady(false);
  assert.equal((await f.call('POST', '/api/quiz/submissions', { attemptId: first, answers })).statusCode, 503);
  assert.equal((await f.call('GET', '/api/admin/quiz-points', null, true)).statusCode, 503);
});
