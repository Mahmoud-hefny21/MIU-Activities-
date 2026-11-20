const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBooking, publicSlots, cleanSlot, slotLabel, registerInterviewSlotRoutes } = require('../services/interview-slots');

// Fixed clock: 20 Nov 2026, 12:00 in Cairo (10:00 UTC).
const NOW = new Date('2026-11-20T10:00:00Z');
const chain = (rows) => ({ select() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => rows });
function fakeApplications(bookings) {
  return { find: (query) => chain(bookings.filter((row) => row.clubId === query.clubId && query.status.$in.includes(row.status) && row.interviewSlotId)) };
}
const slot = (id, date, start, end, capacity) => ({ id, date, start, end, capacity, location: '' });
const club = { id: 7, interviewSlots: [slot('aaaaaaaaaaaaaaaa', '2026-11-22', '13:00', '13:15', 2), slot('bbbbbbbbbbbbbbbb', '2026-11-19', '10:00', '10:15', 5)] };

test('slot validation rejects bad days, times, order and seat counts', () => {
  assert.throws(() => cleanSlot({ date: '2026-13-40', start: '10:00', end: '11:00', capacity: 2 }), /valid interview day/);
  assert.throws(() => cleanSlot({ date: '2026-11-22', start: '25:00', end: '11:00', capacity: 2 }), /start and end/);
  assert.throws(() => cleanSlot({ date: '2026-11-22', start: '11:00', end: '10:00', capacity: 2 }), /after the start/);
  assert.throws(() => cleanSlot({ date: '2026-11-22', start: '10:00', end: '11:00', capacity: 0 }), /1 to 500/);
  assert.match(cleanSlot({ date: '2026-11-22', start: '10:00', end: '11:00', capacity: 3 }).id, /^[a-f0-9]{16}$/);
  assert.equal(slotLabel(club.interviewSlots[0]), 'Sun, 22 Nov 2026 · 1:00 PM – 1:15 PM');
});

test('applicants only see upcoming times, with seats left', () => {
  const counts = new Map([['aaaaaaaaaaaaaaaa', 1]]);
  const shown = publicSlots(club, counts, NOW);
  assert.equal(shown.length, 1, 'the passed slot is hidden');
  assert.equal(shown[0].seatsLeft, 1);
});

test('booking checks the club list, the date and the seats; own booking is not counted twice', async () => {
  const Application = fakeApplications([
    { clubId: 7, status: 'pending', interviewSlotId: 'aaaaaaaaaaaaaaaa' },
    { clubId: 7, status: 'accepted', interviewSlotId: 'aaaaaaaaaaaaaaaa' },
    { clubId: 7, status: 'rejected', interviewSlotId: 'aaaaaaaaaaaaaaaa' }
  ]);
  await assert.rejects(resolveBooking({ Application, club, slotId: 'aaaaaaaaaaaaaaaa', now: NOW }), /full/);
  await assert.rejects(resolveBooking({ Application, club, slotId: 'bbbbbbbbbbbbbbbb', now: NOW }), /already passed/);
  await assert.rejects(resolveBooking({ Application, club, slotId: 'cccccccccccccccc', now: NOW }), /offered by this club/);
  const kept = await resolveBooking({ Application, club, slotId: 'aaaaaaaaaaaaaaaa', ownSlotId: 'aaaaaaaaaaaaaaaa', now: NOW });
  assert.equal(kept.interviewSlotId, 'aaaaaaaaaaaaaaaa');
  const none = await resolveBooking({ Application, club: { id: 7, interviewSlots: [] }, slotId: 'anything', now: NOW });
  assert.deepEqual(none, { interviewSlotId: '', slot: '' }, 'clubs without times store no slot');
});

test('presidents cannot remove a booked time, cut its seats below bookings or move it', async () => {
  const routes = {};
  const app = { get(path, ...handlers) { routes['GET ' + path] = handlers.at(-1); }, put(path, ...handlers) { routes['PUT ' + path] = handlers.at(-1); } };
  let saved = null;
  const stored = { id: 7, interviewSlots: [slot('aaaaaaaaaaaaaaaa', '2030-01-10', '13:00', '13:15', 3)] };
  const Club = { findOne: () => chain(stored), updateOne: async (filter, update) => { saved = update.$set.interviewSlots; } };
  const Application = fakeApplications([{ clubId: 7, status: 'pending', interviewSlotId: 'aaaaaaaaaaaaaaaa' }, { clubId: 7, status: 'pending', interviewSlotId: 'aaaaaaaaaaaaaaaa' }]);
  registerInterviewSlotRoutes(app, { Club, Application, requireClubAuth() {}, requireLiveDatabase: () => true, sameOrigin: () => true });
  const call = async (slots, role = 'president') => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
    await routes['PUT /api/club/interview-slots']({ clubAccount: { role, clubId: 7 }, body: { slots } }, res); return res;
  };
  assert.equal((await call([], 'head')).code, 403, 'only the president manages times');
  assert.match((await call([])).body.message, /cannot be removed/);
  assert.match((await call([{ ...stored.interviewSlots[0], capacity: 1 }])).body.message, /cannot be fewer/);
  assert.match((await call([{ ...stored.interviewSlots[0], start: '14:00', end: '14:15' }])).body.message, /cannot change/);
  assert.equal(saved, null, 'nothing was saved by the refused requests');
  const ok = await call([{ ...stored.interviewSlots[0], capacity: 5 }, { date: '2030-01-10', start: '14:00', end: '14:15', capacity: 4 }]);
  assert.equal(ok.code, 200); assert.equal(saved.length, 2); assert.equal(saved[0].capacity, 5);
  assert.match((await call([{ date: '2030-01-10', start: '14:00', end: '14:15', capacity: 1 }, { date: '2030-01-10', start: '14:00', end: '14:30', capacity: 1 }, stored.interviewSlots[0]])).body.message, /same moment/);
});
