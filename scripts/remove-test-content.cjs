// Removes known test/junk content from the live site (BL-05). Dry run by default; add --apply to write.
// Uses MONGO_URI (MongoDB, as on Vercel):  DATABASE_PROVIDER=mongodb node scripts/remove-test-content.cjs [--apply]
// Every removed record is first saved to database-backup/ so it can be restored.
// Club events are removed the way the Dean's delete does it: taken off the club, and the content request is
// kept in the review history with status "deleted". Registrations and attendance records are kept.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { Club, ContentRequest, UniversityContent } = require('../models');

// Exact items by club and request ID (club events) or content ID (university), checked against the title.
const CLUB_EVENTS = [
  [2, 18, 'acae'], [2, 17, 'miu'], [2, 21, 'miu'], [2, 22, 'testing'], [2, 24, 'miuuu'], [2, 23, 'test'],
  [2, 25, 'alo'], [2, 26, 'TC #1'], [2, 27, 'TC #2'],
  [1, 6, 'Generic endpoint event'], [1, 2, 'E2E Tech Talk'], [1, 8, 'paintball']
];
const UNIVERSITY_ITEMS = [[534314197, 'QR concurrency test'], [2, 'Test'], [1795353768522831, 'Test Case Direct Event From MIU HUB']];
const apply = process.argv.includes('--apply');

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} on database: ${mongoose.connection.name}\n`);
  const backup = { takenAt: new Date().toISOString(), clubEvents: [], contentRequests: [], universityContent: [] };
  const plan = [];
  for (const [clubId, requestId, title] of CLUB_EVENTS) {
    const club = await Club.findOne({ id: clubId }).select('id name events').lean();
    const event = club?.events?.find(item => Number(item.requestId) === requestId);
    if (!event) { console.log(`SKIP  club #${clubId} event ${requestId}: not found (already removed?)`); continue; }
    if (event.title !== title) { console.log(`SKIP  club #${clubId} event ${requestId}: title is "${event.title}", expected "${title}"`); continue; }
    const request = await ContentRequest.findOne({ id: requestId, clubId }).lean();
    backup.clubEvents.push({ clubId, event });
    if (request) backup.contentRequests.push(request);
    plan.push({ kind: 'club', clubId, requestId, hasRequest: Boolean(request) });
    console.log(`REMOVE club #${clubId} ${club.name}: "${title}" (${event.date || 'no date'})${request ? ' + mark its content request deleted' : ''}`);
  }
  for (const [id, title] of UNIVERSITY_ITEMS) {
    const record = await UniversityContent.findOne({ id }).lean();
    if (!record) { console.log(`SKIP  university ${id}: not found (already removed?)`); continue; }
    if (record.title !== title) { console.log(`SKIP  university ${id}: title is "${record.title}", expected "${title}"`); continue; }
    backup.universityContent.push(record);
    plan.push({ kind: 'university', id });
    console.log(`REMOVE university ${id}: "${title}" (${record.date || 'no date'})`);
  }
  if (!apply) { console.log(`\nWould remove ${plan.length} items. Nothing was written. Re-run with --apply.`); return; }
  if (!plan.length) { console.log('\nNothing to remove.'); return; }

  const dir = path.join(__dirname, '..', 'database-backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `test-content-removal-${backup.takenAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\nBackup saved: ${file}`);

  for (const item of plan) {
    if (item.kind === 'club') {
      const result = await Club.updateOne({ id: item.clubId }, { $pull: { events: { requestId: item.requestId } } });
      if (item.hasRequest) await ContentRequest.updateOne({ id: item.requestId, clubId: item.clubId, status: { $ne: 'deleted' } },
        { $set: { status: 'deleted', deletedAt: new Date() }, $unset: { publishedAt: 1 } });
      console.log(`${result.modifiedCount ? 'REMOVED' : 'UNCHANGED'} club #${item.clubId} event ${item.requestId}`);
    } else {
      const result = await UniversityContent.deleteOne({ id: item.id });
      console.log(`${result.deletedCount ? 'REMOVED' : 'UNCHANGED'} university ${item.id}`);
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
