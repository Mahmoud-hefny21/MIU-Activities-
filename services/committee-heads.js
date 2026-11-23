const crypto = require('node:crypto');
const { staffRoleAssignments } = require('./staff-google-auth');

// A committee head is a { role: 'head', clubId, committee } role assignment, so one
// MIU Google account can head committees in several clubs (one committee per club)
// alongside any other staff roles it already holds.
const norm = value => String(value || '').trim().toLowerCase();
const fail = (status, message) => Object.assign(new Error(message), { status });
const headFilter = clubId => ({ $or: [{ role: 'head', clubId }, { roleAssignments: { $elemMatch: { role: 'head', clubId } } }] });

function headsOf(accounts, clubId = null) {
  return accounts.flatMap(account => staffRoleAssignments(account)
    .filter(item => item.role === 'head' && (clubId === null || item.clubId === clubId))
    .map(item => ({ clubId: item.clubId, email: account.email, committee: item.committee })));
}

async function listHeads(ClubAccount, clubId = null) {
  const filter = clubId === null ? { $or: [{ role: 'head' }, { 'roleAssignments.role': 'head' }] } : headFilter(clubId);
  return headsOf(await ClubAccount.find(filter).select('email role clubId committee assignedClubIds roleAssignments').read('primary').lean(), clubId);
}

async function saveAssignments(ClubAccount, session, existing, email, assignments, signOut) {
  const versionFilter = existing?.sessionVersion == null
    ? { $or: [{ sessionVersion: { $exists: false } }, { sessionVersion: null }] } : { sessionVersion: existing.sessionVersion };
  if (!assignments.length) {
    const result = await ClubAccount.deleteOne({ _id: existing._id, ...versionFilter }, { session });
    if (result.deletedCount !== 1) throw fail(409, 'This account changed. Refresh and try again.');
    return null;
  }
  const primary = assignments[0];
  const fields = { role: primary.role, clubId: primary.clubId, assignedClubIds: primary.assignedClubIds, committee: primary.committee, roleAssignments: assignments };
  if (!existing) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(crypto.randomBytes(48).toString('base64url'), salt, 64).toString('hex');
    const [created] = await ClubAccount.create([{ email, ...fields, salt, passwordHash, sessionVersion: 0 }], { session });
    return created.toObject();
  }
  const saved = await ClubAccount.findOneAndUpdate({ _id: existing._id, ...versionFilter },
    { $set: fields, ...(signOut ? { $inc: { sessionVersion: 1 } } : {}) }, { session, new: true, runValidators: true }).lean();
  if (!saved) throw fail(409, 'This account changed. Refresh and try again.');
  return saved;
}

async function ensureCommitteeFree(ClubAccount, session, clubId, committee, exceptEmail = '') {
  const holders = headsOf(await ClubAccount.find(headFilter(clubId)).session(session).lean(), clubId);
  if (holders.some(head => head.email !== exceptEmail && norm(head.committee) === norm(committee))) {
    throw fail(409, exceptEmail ? 'Another head already manages this committee.' : 'This committee already has a head.');
  }
}

async function addHead({ ClubAccount, session, email, clubId, committee, blockedEmail }) {
  if (blockedEmail(email)) throw fail(400, 'Use a staff MIU Google account rather than the administrator account.');
  await ensureCommitteeFree(ClubAccount, session, clubId, committee);
  const existing = await ClubAccount.findOne({ email }).session(session).lean();
  const assignments = staffRoleAssignments(existing);
  if (existing && !assignments.length) throw fail(409, 'That email already has an account that cannot take a committee role.');
  if (assignments.some(item => item.role === 'head' && item.clubId === clubId)) {
    throw fail(409, 'This person already heads a committee in this club.');
  }
  return saveAssignments(ClubAccount, session, existing, email,
    [...assignments, { role: 'head', clubId, assignedClubIds: [], committee }], false);
}

async function removeHead({ ClubAccount, session, email, clubId }) {
  const existing = await ClubAccount.findOne({ email }).session(session).lean();
  const assignments = staffRoleAssignments(existing);
  const remaining = assignments.filter(item => !(item.role === 'head' && item.clubId === clubId));
  if (!existing || remaining.length === assignments.length) throw fail(404, 'Committee head not found.');
  return saveAssignments(ClubAccount, session, existing, email, remaining, true);
}

async function updateHead({ ClubAccount, session, oldEmail, email, clubId, committee, blockedEmail }) {
  const existing = await ClubAccount.findOne({ email: oldEmail }).session(session).lean();
  const assignments = staffRoleAssignments(existing);
  const current = assignments.find(item => item.role === 'head' && item.clubId === clubId);
  if (!current) throw fail(404, 'Committee head not found.');
  await ensureCommitteeFree(ClubAccount, session, clubId, committee, oldEmail);
  if (email === oldEmail) {
    return saveAssignments(ClubAccount, session, existing, email,
      assignments.map(item => item === current ? { ...item, committee } : item), false);
  }
  // A different email is a different person: move this club's head role to them.
  await removeHead({ ClubAccount, session, email: oldEmail, clubId });
  return addHead({ ClubAccount, session, email, clubId, committee, blockedEmail });
}

module.exports = { headsOf, listHeads, addHead, updateHead, removeHead };
