// Assigns one MIU Google account as committee head in every active club.
// Dry run by default; add --apply to write, --rename to rename an existing head role. Uses MONGO_URI (MongoDB, as on Vercel).
//   node scripts/assign-head-all-clubs.cjs <email> "<committee>" [--apply]
require('dotenv').config();
const mongoose = require('mongoose');
const { Club, ClubAccount, Application } = require('../models');
const { addHead, updateHead, listHeads } = require('../services/committee-heads');

const [emailArg, committeeArg] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const rename = process.argv.includes('--rename'); // rename an existing head role in each club
const email = String(emailArg || '').trim().toLowerCase();
const committee = String(committeeArg || '').trim().replace(/\s+/g, ' ');

(async () => {
  if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(email) || !committee || committee.length > 100) {
    throw new Error('Usage: node scripts/assign-head-all-clubs.cjs <MIU email> "<committee, max 100 chars>" [--apply]');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const clubs = await Club.find({ archivedAt: null }).select('id name').sort({ id: 1 }).lean();
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'}: ${email} as head of "${committee}" in ${clubs.length} active clubs (database: ${mongoose.connection.name})\n`);
  const summary = { added: 0, skipped: 0, failed: 0 };
  for (const club of clubs) {
    const heads = await listHeads(ClubAccount, club.id);
    const mine = heads.find(head => head.email === email);
    const taken = heads.find(head => head.email !== email && head.committee.trim().toLowerCase() === committee.toLowerCase());
    const label = `#${club.id} ${club.name}`;
    if (mine && (!rename || mine.committee === committee)) { summary.skipped++; console.log(`SKIP  ${label}: already head of "${mine.committee}"`); continue; }
    if (taken) { summary.skipped++; console.log(`SKIP  ${label}: "${committee}" already headed by ${taken.email}`); continue; }
    const verb = mine ? `RENAME "${mine.committee}" ->` : 'ADD';
    if (!apply) { summary.added++; console.log(`${verb} ${label}`); continue; }
    const session = await mongoose.startSession();
    try {
      const args = { ClubAccount, session, clubId: club.id, committee, blockedEmail: value => value === adminEmail };
      await session.withTransaction(async () => {
        if (!mine) return addHead({ ...args, email });
        await updateHead({ ...args, oldEmail: email, email });
        // Members and applications follow the committee to its new name, as in the dashboard.
        await Application.updateMany({ clubId: club.id, committee: mine.committee }, { $set: { committee } }, { session });
      });
      summary.added++; console.log(`DONE  ${verb} ${label}`);
    } catch (error) {
      summary.failed++; console.log(`FAIL  ${label}: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }
  console.log(`\n${apply ? 'Added' : 'Would add'}: ${summary.added}, skipped: ${summary.skipped}, failed: ${summary.failed}`);
  if (!apply) console.log('Nothing was written. Re-run with --apply to save.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
