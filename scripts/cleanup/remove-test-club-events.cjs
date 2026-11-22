// Removes the known test events embedded in club records (homepage "Upcoming" and club pages):
//   Utopia (club 1)     "E2E Tech Talk"  requestId 2   (2026-12-01)
//   MIU-MUNAL (club 2)  "testing"        requestId 22  (2026-10-19)
//   MIU-MUNAL (club 2)  "test"           requestId 23  (2026-10-19)
// plus their registrations and check-ins. None of these is created by code in this repository
// (no test, fixture or script writes them); they were entered by hand through the club studio.
//
// REVIEW BEFORE RUNNING. Nothing is changed unless you pass --apply.
//   Dry run (default):  node scripts/cleanup/remove-test-club-events.cjs --confirm-database <name>
//   Apply:              node scripts/cleanup/remove-test-club-events.cjs --confirm-database <name> --apply
// --confirm-database must equal the configured SQL database name, so the target is always explicit.
// Every event is matched by club id AND requestId AND exact title; anything else is left alone.
// The whole change runs in one SQL transaction: any mismatch or error rolls everything back.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const { provider, sqlConfig } = require('../../database/config');

const TARGETS = Object.freeze([
  { clubId: 1, requestId: 2, title: 'E2E Tech Talk' },
  { clubId: 2, requestId: 22, title: 'testing' },
  { clubId: 2, requestId: 23, title: 'test' }
]);

function plan(clubs, registrations) {
  const found = [], missing = [], blockers = [];
  for (const target of TARGETS) {
    const club = clubs.find(item => Number(item.id) === target.clubId);
    const index = (club?.events || []).findIndex(event => Number(event.requestId) === target.requestId && event.title === target.title);
    if (index < 0) { missing.push(target); continue; }
    found.push({ ...target, index, clubName: club.name, date: club.events[index].date || '' });
  }
  // Removing an event shifts the position of later events. Registrations saved before events had a
  // requestId are matched by position, so they would point at a different event: refuse instead.
  for (const item of found) {
    const legacy = registrations.filter(row => Number(row.clubId) === item.clubId && !(Number(row.eventRequestId) > 0) && Number(row.eventIndex) > item.index);
    if (legacy.length) blockers.push({ clubId: item.clubId, title: item.title, legacyRegistrationsAfterIt: legacy.length });
  }
  return { found, missing, blockers };
}

async function main(args = process.argv.slice(2)) {
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const apply = args.includes('--apply');
  if (!['sqlserver', 'azuresql'].includes(provider())) throw new Error('This script runs against the configured SQL database only.');
  const database = sqlConfig().database;
  if (option('--confirm-database') !== database) throw new Error(`Pass --confirm-database ${database} to confirm the target database.`);
  const runtime = require('../../database/runtime');
  const models = require('../../models');
  await runtime.connect();
  let session;
  try {
    const clubs = await models.Club.find({ id: { $in: [...new Set(TARGETS.map(t => t.clubId))] } }).select('id name events').lean();
    const registrations = await models.EventRegistration.find({ clubId: { $in: [...new Set(TARGETS.map(t => t.clubId))] } }).select('clubId eventIndex eventRequestId').lean();
    const result = plan(clubs, registrations);
    const related = {};
    for (const item of result.found) {
      const filter = { clubId: item.clubId, eventRequestId: item.requestId };
      related[`${item.clubId}:${item.requestId}`] = {
        registrations: await models.EventRegistration.countDocuments(filter),
        checkIns: await models.AttendanceRecord.countDocuments(filter),
        sessions: await models.AttendanceSession.countDocuments(filter)
      };
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', database, events: result.found, related, notFound: result.missing, blockers: result.blockers }, null, 2));
    if (!apply) { console.log('Dry run only. Nothing was changed.'); return; }
    if (result.blockers.length) throw new Error('Legacy position-based registrations would be shifted. Nothing was changed.');
    if (!result.found.length) { console.log('Nothing to remove.'); return; }
    session = new runtime.Session(); await session.begin();
    for (const clubId of [...new Set(result.found.map(item => item.clubId))]) {
      const club = await models.Club.findOne({ id: clubId }).select('id events').session(session).lean();
      const remove = result.found.filter(item => item.clubId === clubId);
      const events = (club.events || []).filter(event => !remove.some(item => Number(event.requestId) === item.requestId && event.title === item.title));
      if ((club.events || []).length - events.length !== remove.length) throw new Error('Club events changed since the preview. Nothing was changed.');
      await models.Club.updateOne({ id: clubId }, { $set: { events } }, { session });
    }
    for (const item of result.found) {
      const filter = { clubId: item.clubId, eventRequestId: item.requestId };
      await models.EventRegistration.deleteMany(filter, { session });
      await models.AttendanceRecord.deleteMany(filter, { session });
      await models.AttendanceSession.deleteMany(filter, { session });
    }
    await session.commitTransaction();
    console.log(JSON.stringify({ ok: true, removedEvents: result.found.length }));
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    throw error;
  } finally { await session?.endSession(); await runtime.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error('Cleanup stopped:', error.message); process.exitCode = 1; });
module.exports = { TARGETS, plan };
