// Home "Upcoming" slideshow: nothing old stays. Events leave once they are over; MIU and faculty
// announcements show only while new (7 days), after the events.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/js/app-home.js'), 'utf8');
const take = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a, start); return source.slice(a, b); };
const context = vm.createContext({ Date });
vm.runInContext(take('function parseEventDate', 'function startOfLocalDay') + take('function startOfLocalDay', '\n}\n') + '\n}\n'
  + take('const SLIDESHOW_ANNOUNCEMENT_DAYS', 'function renderEventsSlideshow'), context);

test('an event leaves the slideshow at its end time, or at the end of its day when it has none', () => {
  const at = text => new Date(text);
  const withEnd = { date: '2026-11-23', time: '14:46', endTime: '15:46' };
  assert.equal(context.eventIsOver(withEnd, at('2026-11-23T15:45:00')), false);
  assert.equal(context.eventIsOver(withEnd, at('2026-11-23T15:46:00')), true);
  const noEnd = { date: '2026-11-23', time: '14:46' };
  assert.equal(context.eventIsOver(noEnd, at('2026-11-23T23:59:00')), false, 'stays all of its day');
  assert.equal(context.eventIsOver(noEnd, at('2026-11-24T00:00:00')), true);
  assert.equal(context.eventIsOver({ date: '' }, at('2026-11-24T00:00:00')), false, 'undated items are handled elsewhere');
});

test('announcements show only for 7 days, newest first, at most 6; events are not counted as announcements', () => {
  const today = new Date('2026-11-23T00:00:00');
  const item = (id, contentType, createdAt) => ({ id, contentType, createdAt });
  const items = [item(1, 'feed', '2026-10-09T22:50:46Z'), item(2, 'event', '2026-11-22T10:00:00Z'),
    ...[16, 17, 18, 19, 20, 21, 22].map(day => item(day, 'feed', `2026-11-${day}T09:00:00Z`))];
  const result = context.recentUniversityAnnouncements(items, today);
  assert.deepEqual(result.map(entry => entry.id), [22, 21, 20, 19, 18, 17]);
  assert.deepEqual(context.recentUniversityAnnouncements([item(1, 'feed', '2026-10-09T22:50:46Z')], today), [], 'a 45-day-old announcement is not shown');
});

test('the slideshow drops finished events and adds new announcements after them', () => {
  const render = take('function renderEventsSlideshow', 'track.innerHTML = items.map');
  assert.match(render, /parsedDate >= todayStart && !eventIsOver\(event\)/);
  assert.match(render, /isUpcomingUniversityEvent\(item\) && !eventIsOver\(item\)/);
  assert.ok(render.indexOf('isUpcomingUniversityEvent') < render.indexOf('recentUniversityAnnouncements(universityItems'));
});

test('public events carry their end time so lists can tell when they are over', () => {
  const { sanitizePublicClub } = require('../services/public-club-media');
  const { toPublicUniversityContent } = require('../services/university-content');
  const club = sanitizePublicClub({ id: 1, events: [{ title: 'a', date: '2026-11-23', time: '14:46', attendanceSettings: { endTime: '15:46' } }, { title: 'b', date: '2026-11-23' }] });
  assert.deepEqual(club.events.map(event => event.endTime), ['15:46', '']);
  assert.equal(toPublicUniversityContent({ id: 1, type: 'event', title: 'x', date: '2026-11-23', time: '14:49', attendanceSettings: { endTime: '15:49' } }).endTime, '15:49');
});
