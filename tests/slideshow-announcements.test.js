// Home "Upcoming" slideshow: recent MIU and faculty announcements are shown after the events.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/js/app-home.js'), 'utf8');
const take = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a, start); return source.slice(a, b); };
const context = vm.createContext({ Date });
vm.runInContext(take('function parseEventDate', 'function startOfLocalDay') + take('function startOfLocalDay', '\n}\n') + '\n}\n'
  + take('const SLIDESHOW_ANNOUNCEMENT_DAYS', 'function renderEventsSlideshow'), context);

test('announcements from the last 90 days are included, newest first, at most 6; events and older ones are not', () => {
  const today = new Date('2026-11-23T00:00:00');
  const item = (id, contentType, createdAt) => ({ id, contentType, createdAt });
  const items = [item(1, 'feed', '2026-10-09T22:50:46Z'), item(2, 'event', '2026-11-23T10:00:00Z'), item(3, 'feed', '2026-08-01T00:00:00Z'),
    ...[10, 11, 12, 13, 14, 15, 16].map(day => item(day, 'feed', `2026-11-${day}T09:00:00Z`))];
  const result = context.recentUniversityAnnouncements(items, today);
  assert.deepEqual(result.map(entry => entry.id), [16, 15, 14, 13, 12, 11]);
  assert.ok(!result.some(entry => entry.contentType === 'event'));
  assert.deepEqual(context.recentUniversityAnnouncements([item(1, 'feed', '2026-10-09T22:50:46Z')], today).map(entry => entry.id), [1], 'a 45-day-old announcement is shown');
  assert.deepEqual(context.recentUniversityAnnouncements([item(3, 'feed', '2026-08-01T00:00:00Z')], today), [], 'older than 90 days is not');
});

test('the slideshow adds the announcements after the upcoming events', () => {
  const render = take('function renderEventsSlideshow', 'track.innerHTML = items.map');
  assert.ok(render.indexOf('isUpcomingUniversityEvent') < render.indexOf('recentUniversityAnnouncements(universityItems'));
});
