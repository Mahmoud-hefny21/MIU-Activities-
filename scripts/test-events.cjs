// Test events for attendance testing on the live site. Every event is titled "[TEST] …" so it can be removed.
//   DATABASE_PROVIDER=mongodb node scripts/test-events.cjs create <number>   adds test event <number> (1, 2, 3 …)
//   DATABASE_PROVIDER=mongodb node scripts/test-events.cjs remove [--apply]  removes all [TEST] events (dry run by default)
// Each event is open to all students with attendance on, starts 10 minutes after it is created (check-in opens
// 30 minutes before the start, so straight away) and ends 60 minutes after the start. Registration alternates:
// odd numbers need registration, even numbers do not (any student can check in).
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { Club, UniversityContent, EventRegistration, AttendanceRecord } = require('../models');

const PREFIX = '[TEST] ';
// Rotation: clubs, MIU and faculties take turns.
const ROTATION = [
  { kind: 'club', clubId: 1 }, { kind: 'miu' }, { kind: 'faculty', key: 'computer-science', name: 'Faculty of Computer Science' },
  { kind: 'club', clubId: 2 }, { kind: 'club', clubId: 6 }, { kind: 'faculty', key: 'engineering', name: 'Faculty of Engineering Sciences and Arts' },
  { kind: 'club', clubId: 5 }, { kind: 'miu' }, { kind: 'faculty', key: 'business', name: 'Faculty of Business Administration and International Trade' },
  { kind: 'club', clubId: 9 }, { kind: 'club', clubId: 12 }, { kind: 'faculty', key: 'pharmacy', name: 'Faculty of Pharmacy' }
];

function cairo(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

async function create(number) {
  const slot = ROTATION[(number - 1) % ROTATION.length];
  const start = cairo(new Date(Date.now() + 10 * 60 * 1000));
  const end = cairo(new Date(Date.now() + 70 * 60 * 1000));
  const registrationEnabled = number % 2 === 1;
  const attendanceSettings = { timeZone: 'Africa/Cairo', ...(end.date === start.date ? { endTime: end.time } : {}), cancellationEnabled: false };
  const id = Date.now() * 1000 + crypto.randomInt(1000);
  const how = registrationEnabled ? 'registration required' : 'no registration';
  if (slot.kind === 'club') {
    const club = await Club.findOne({ id: slot.clubId, archivedAt: null }).select('id name image').lean();
    if (!club) throw new Error(`Club ${slot.clubId} not found.`);
    const title = `${PREFIX}#${number} ${club.name} attendance test`;
    const event = { requestId: id, contentType: 'event', title, date: start.date, time: start.time, location: 'Test — main campus',
      budget: '', description: `Test event ${number} for attendance testing (${how}). Open to all students. Will be removed after testing.`,
      image: club.image, createdAt: new Date(), registrationEnabled, attendanceEnabled: true, attendanceAudience: 'all_students',
      attendanceSettings, capacity: null };
    const result = await Club.updateOne({ id: club.id, archivedAt: null }, { $push: { events: event } });
    if (result.modifiedCount !== 1) throw new Error('The event was not saved.');
    return `${title} — ${start.date} ${start.time} (${how})`;
  }
  const publisher = slot.kind === 'faculty' ? slot.name : 'MIU';
  const title = `${PREFIX}#${number} ${publisher} attendance test`;
  await UniversityContent.create({ id, type: 'event', title, date: start.date, time: start.time, location: 'Test — main campus',
    description: `Test event ${number} for attendance testing (${how}). Open to all students. Will be removed after testing.`,
    registrationEnabled, attendanceEnabled: true, attendanceAudience: 'all_students', attendanceSettings,
    publishedBy: 'test-events script', publisherType: slot.kind === 'faculty' ? 'faculty' : 'miu', publisherKey: slot.kind === 'faculty' ? slot.key : '' });
  return `${title} — ${start.date} ${start.time} (${how})`;
}

async function remove(apply) {
  const match = { $regex: '^\\[TEST\\] ' };
  const clubs = await Club.find({ 'events.title': match }).select('id name events').lean();
  const clubEvents = clubs.flatMap(club => (club.events || []).filter(event => String(event.title).startsWith(PREFIX)).map(event => ({ clubId: club.id, event })));
  const university = await UniversityContent.find({ title: match }).lean();
  const registrations = await EventRegistration.find({ eventTitle: match }).lean();
  const attendance = await AttendanceRecord.find({ eventTitle: match }).lean();
  console.log(`[TEST] club events: ${clubEvents.length}, MIU/faculty events: ${university.length}, registrations: ${registrations.length}, attendance records: ${attendance.length}`);
  for (const item of clubEvents) console.log('  club #' + item.clubId + ': ' + item.event.title);
  for (const item of university) console.log('  ' + item.title);
  if (!apply) return console.log('Nothing was written. Re-run with --apply to remove them.');
  const dir = path.join(__dirname, '..', 'database-backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `test-events-removal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ clubEvents, university, registrations, attendance }, null, 2));
  console.log('Backup saved: ' + file);
  for (const club of clubs) await Club.updateOne({ id: club.id }, { $pull: { events: { title: match } } });
  await UniversityContent.deleteMany({ title: match });
  await EventRegistration.deleteMany({ eventTitle: match });
  await AttendanceRecord.deleteMany({ eventTitle: match });
  console.log('Removed.');
}

(async () => {
  const [command, value] = process.argv.slice(2);
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  if (command === 'create' && Number.isInteger(Number(value)) && Number(value) > 0) console.log(new Date().toISOString() + ' CREATED ' + await create(Number(value)));
  else if (command === 'remove') await remove(process.argv.includes('--apply'));
  else throw new Error('Usage: test-events.cjs create <number> | remove [--apply]');
})().catch(error => { console.error('ERROR ' + error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
