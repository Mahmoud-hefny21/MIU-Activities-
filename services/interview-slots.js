// Interview times: each club president publishes interview slots (day, start, end, seats). Applicants see the
// upcoming slots with seats left and book one with their application. The server re-checks every booking, so a
// full or past slot can never be taken, and a president cannot remove a booked slot or cut seats below bookings.
const crypto = require('crypto');

const TIME_ZONE = 'Africa/Cairo';
const MAX_SLOTS = 60;
const ACTIVE_STATUSES = ['pending', 'accepted'];

function cairoNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isPast = (slot, now = new Date()) => { const c = cairoNow(now); return slot.date < c.date || (slot.date === c.date && slot.start <= c.time); };

function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

// "Sat, 22 Nov 2026 · 1:00 PM – 1:15 PM" (shown to applicants, stored on the application, used in dashboards).
function slotLabel(slot) {
  const day = new Date(slot.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${day} · ${formatTime(slot.start)} – ${formatTime(slot.end)}`;
}

function cleanSlot(input) {
  const slot = {
    id: typeof input?.id === 'string' && /^[a-f0-9]{16}$/.test(input.id) ? input.id : crypto.randomBytes(8).toString('hex'),
    date: String(input?.date || '').trim(),
    start: String(input?.start || '').trim(),
    end: String(input?.end || '').trim(),
    capacity: Number(input?.capacity),
    location: String(input?.location || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  };
  if (!isDate(slot.date)) throw Object.assign(new Error('Choose a valid interview day.'), { status: 400 });
  if (!isTime(slot.start) || !isTime(slot.end)) throw Object.assign(new Error('Choose a valid start and end time.'), { status: 400 });
  if (slot.end <= slot.start) throw Object.assign(new Error('The end time must be after the start time.'), { status: 400 });
  if (!Number.isInteger(slot.capacity) || slot.capacity < 1 || slot.capacity > 500) throw Object.assign(new Error('Seats per time must be a whole number from 1 to 500.'), { status: 400 });
  return slot;
}

async function bookedCounts(Application, clubId) {
  const rows = await Application.find({ clubId, status: { $in: ACTIVE_STATUSES }, interviewSlotId: { $exists: true, $ne: '' } })
    .select('interviewSlotId').read('primary').readConcern('majority').lean();
  const counts = new Map();
  for (const row of rows) counts.set(row.interviewSlotId, (counts.get(row.interviewSlotId) || 0) + 1);
  return counts;
}

// Upcoming slots with seats left, sorted by day and time (for the application form).
function publicSlots(club, counts, now = new Date()) {
  return (Array.isArray(club?.interviewSlots) ? club.interviewSlots : [])
    .filter((slot) => slot && isDate(slot.date) && isTime(slot.start) && !isPast(slot, now))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map((slot) => {
      const booked = counts.get(slot.id) || 0;
      return { id: slot.id, date: slot.date, start: slot.start, end: slot.end, location: slot.location || '', label: slotLabel(slot), seatsLeft: Math.max(0, slot.capacity - booked), capacity: slot.capacity };
    });
}

// Checks one booking. `ownSlotId` is the applicant's current slot, so keeping or re-choosing it never counts twice.
async function resolveBooking({ Application, club, slotId, ownSlotId = '', now = new Date() }) {
  const slots = Array.isArray(club?.interviewSlots) ? club.interviewSlots : [];
  if (!slots.length) return { interviewSlotId: '', slot: '' };
  const slot = slots.find((item) => item?.id === slotId);
  if (!slot) throw Object.assign(new Error('Choose one of the interview times offered by this club.'), { status: 400 });
  if (isPast(slot, now)) throw Object.assign(new Error('This interview time has already passed. Choose another time.'), { status: 409 });
  const counts = await bookedCounts(Application, club.id);
  const taken = (counts.get(slot.id) || 0) - (ownSlotId === slot.id ? 1 : 0);
  if (taken >= slot.capacity) throw Object.assign(new Error('This interview time is full. Choose another time.'), { status: 409 });
  return { interviewSlotId: slot.id, slot: slotLabel(slot) };
}

// Takes a seat atomically: the club record is locked inside a transaction, the slot's active bookings are counted
// and the application is written in that same transaction, so parallel requests can never overbook a time.
// `write(session, seatFree)` saves the application; `excludeId` leaves the applicant's own booking out of the count.
async function bookWithLock({ database, Club, Application, clubId, slotId, capacity, excludeId = null, write }) {
  const session = await database.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      if (!database.isSqlProvider) await Club.updateOne({ id: clubId, archivedAt: null }, { $inc: { registrationRevision: 1 } }, { session });
      const filter = { clubId, interviewSlotId: slotId, status: { $in: ACTIVE_STATUSES } };
      if (excludeId !== null) filter.id = { $ne: excludeId };
      const booked = await Application.countDocuments(filter).session(session);
      result = await write(session, booked < capacity);
    }, { writeConcern: { w: 'majority' } });
    return result;
  } finally { await session.endSession(); }
}

function registerInterviewSlotRoutes(app, { Club, Application, requireClubAuth, requireLiveDatabase, sameOrigin }) {
  // Applicants: the club's upcoming interview times with seats left.
  app.get('/api/clubs/:clubId/interview-slots', async (req, res) => {
    const clubId = Number(req.params.clubId);
    if (!Number.isSafeInteger(clubId) || clubId < 1) return res.status(400).json({ message: 'Choose a valid club.' });
    try {
      if (!requireLiveDatabase(res)) return;
      const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id interviewSlots').lean();
      if (!club) return res.status(404).json({ message: 'Club not found.' });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ slots: publicSlots(club, await bookedCounts(Application, clubId)) });
    } catch (error) {
      console.error('Interview slots read failed:', error.name);
      res.status(503).json({ message: 'Interview times are temporarily unavailable.' });
    }
  });

  const presidentOnly = (req, res) => {
    if (req.clubAccount?.role !== 'president') { res.status(403).json({ message: 'Only the club president can manage interview times.' }); return false; }
    return true;
  };

  // President: every slot (including past ones) with how many applicants booked it.
  app.get('/api/club/interview-slots', requireClubAuth, async (req, res) => {
    if (!presidentOnly(req, res)) return;
    try {
      if (!requireLiveDatabase(res)) return;
      const clubId = Number(req.clubAccount.clubId);
      const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id interviewSlots').read('primary').lean();
      if (!club) return res.status(404).json({ message: 'Your club could not be found.' });
      const counts = await bookedCounts(Application, clubId);
      const slots = (club.interviewSlots || []).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
        .map((slot) => ({ ...slot, label: slotLabel(slot), booked: counts.get(slot.id) || 0, past: isPast(slot) }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ slots });
    } catch (error) {
      console.error('Interview slots read failed:', error.name);
      res.status(503).json({ message: 'Interview times are temporarily unavailable.' });
    }
  });

  // President: replace the list. Booked slots cannot be removed and their seats cannot drop below the bookings.
  app.put('/api/club/interview-slots', requireClubAuth, async (req, res) => {
    if (!presidentOnly(req, res)) return;
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
    const input = Array.isArray(req.body?.slots) ? req.body.slots : null;
    if (!input || input.length > MAX_SLOTS) return res.status(400).json({ message: `Add up to ${MAX_SLOTS} interview times.` });
    let slots;
    try { slots = input.map(cleanSlot); } catch (error) { return res.status(error.status || 400).json({ message: error.message }); }
    const keys = new Set();
    for (const slot of slots) {
      const key = `${slot.date} ${slot.start}`;
      if (keys.has(key)) return res.status(400).json({ message: `Two interview times start at the same moment (${slotLabel(slot)}).` });
      keys.add(key);
    }
    try {
      if (!requireLiveDatabase(res)) return;
      const clubId = Number(req.clubAccount.clubId);
      const current = await Club.findOne({ id: clubId, archivedAt: null }).select('id interviewSlots').read('primary').lean();
      if (!current) return res.status(404).json({ message: 'Your club could not be found.' });
      const counts = await bookedCounts(Application, clubId);
      for (const old of current.interviewSlots || []) {
        const booked = counts.get(old?.id) || 0;
        if (!booked) continue;
        const kept = slots.find((slot) => slot.id === old.id);
        if (!kept) return res.status(409).json({ message: `${slotLabel(old)} has ${booked} booking${booked === 1 ? '' : 's'} and cannot be removed.` });
        if (kept.capacity < booked) return res.status(409).json({ message: `${slotLabel(old)} already has ${booked} bookings; seats cannot be fewer than that.` });
        if (kept.date !== old.date || kept.start !== old.start || kept.end !== old.end) return res.status(409).json({ message: `${slotLabel(old)} already has bookings, so its day and time cannot change.` });
      }
      await Club.updateOne({ id: clubId, archivedAt: null }, { $set: { interviewSlots: slots } }, { runValidators: true, writeConcern: { w: 'majority' } });
      res.json({ message: 'Interview times saved.', slots: slots.map((slot) => ({ ...slot, label: slotLabel(slot), booked: counts.get(slot.id) || 0, past: isPast(slot) })) });
    } catch (error) {
      console.error('Interview slots save failed:', error.name);
      res.status(503).json({ message: 'Interview times could not be saved. Please try again.' });
    }
  });
}

module.exports = { registerInterviewSlotRoutes, resolveBooking, publicSlots, slotLabel, cleanSlot, isPast, cairoNow, bookWithLock };
