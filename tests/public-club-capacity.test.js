// BL-01/02/03: clubs have no application seat limit, so the public API reports seats as null (unlimited)
// instead of stale seed numbers. BL-04: public events say whether registration is open right now.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizePublicClub } = require('../services/public-club-media');
const { toPublicUniversityContent } = require('../services/university-content');

test('public clubs report seats as null (unlimited), whatever the stored seed value', () => {
  for (const seats of [0, 18, 30, undefined]) assert.equal(sanitizePublicClub({ id: 4, status: 'full', seats, members: 0 }).seats, null);
});

test('club events report registrationOpen: false once the date has passed or registration is off', () => {
  const club = sanitizePublicClub({ id: 2, events: [
    { title: 'past', date: '2026-10-19', time: '10:00', registrationEnabled: true },
    { title: 'future', date: '2099-01-01', time: '10:00', registrationEnabled: true },
    { title: 'off', date: '2099-01-01', time: '10:00', registrationEnabled: false },
    { title: 'cancelled', date: '2099-01-01', time: '10:00', registrationEnabled: true, cancelled: true }
  ] });
  assert.deepEqual(club.events.map(event => [event.title, event.registrationOpen]),
    [['past', false], ['future', true], ['off', false], ['cancelled', false]]);
  assert.equal(club.events[0].registrationEnabled, true, 'the configured setting is still reported');
});

test('university events report registrationOpen the same way', () => {
  const event = (date, registrationEnabled = true) => toPublicUniversityContent({ id: 1, type: 'event', title: 'x', date, time: '15:41', registrationEnabled });
  assert.equal(event('2026-11-22').registrationOpen, false);
  assert.equal(event('2099-11-22').registrationOpen, true);
  assert.equal(event('2099-11-22', false).registrationOpen, false);
});
