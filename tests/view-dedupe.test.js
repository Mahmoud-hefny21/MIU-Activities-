// BL-09: view counters count one view per visitor per item within the window.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createViewDeduper } = require('../services/view-dedupe');

test('repeated views from the same visitor count once per 30 minutes', () => {
  let now = 0;
  const first = createViewDeduper({ secret: 'test-secret', clock: () => now });
  assert.equal(first('club:2', '1.2.3.4', 'Chrome'), true);
  for (let i = 0; i < 50; i++) assert.equal(first('club:2', '1.2.3.4', 'Chrome'), false);
  now += 30 * 60 * 1000 - 1;
  assert.equal(first('club:2', '1.2.3.4', 'Chrome'), false);
  now += 1;
  assert.equal(first('club:2', '1.2.3.4', 'Chrome'), true, 'counted again after the window');
});

test('different visitors and different items are counted separately', () => {
  const first = createViewDeduper({ secret: 'test-secret' });
  assert.equal(first('club:2', '1.2.3.4', 'Chrome'), true);
  assert.equal(first('club:3', '1.2.3.4', 'Chrome'), true);
  assert.equal(first('club:2', '5.6.7.8', 'Chrome'), true);
  assert.equal(first('club:2', '1.2.3.4', 'Firefox'), true);
  assert.equal(first('event:2:request:9', '1.2.3.4', 'Chrome'), true);
});

test('memory stays bounded', () => {
  const first = createViewDeduper({ secret: 'test-secret', maxEntries: 100 });
  for (let i = 0; i < 1000; i++) first('club:' + i, '1.2.3.4', 'Chrome');
  assert.equal(first('club:999', '1.2.3.4', 'Chrome'), false, 'recent entries are kept');
  assert.equal(first('club:0', '1.2.3.4', 'Chrome'), true, 'the oldest entries were dropped');
});

test('both view endpoints check for a first view before incrementing', () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const club = source.slice(source.indexOf("app.post('/api/clubs/:id/view'"), source.indexOf("app.get('/api/admin/session'"));
  assert.ok(club.indexOf('firstViewOf(req') < club.indexOf('+ 1'));
  const event = source.slice(source.indexOf("app.post('/api/events/:clubId/:eventIndex/view'"), source.indexOf("app.get('/api/club-auth/session'"));
  assert.ok(event.indexOf('firstViewOf(req') < event.indexOf('+ 1'));
  assert.ok(event.indexOf('firstViewOf(req') < event.indexOf('detailViews'), 'interest score is not raised by repeats');
});
