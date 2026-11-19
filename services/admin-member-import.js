// Admin: import club members from the standard members sheet.
// Columns (header names are matched loosely): Full Name, Phone Number, MIU ID, MIU Email Address, Faculty,
// Club Name, Role / Position in the club, Board Position (e.g. Head of PR), Member Committee.
// Each row is added to that club's roster, or updates the roster entry with the same email. Nothing is deleted.
const crypto = require('node:crypto');

const clean = (value, max) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max);
const normalizeName = value => clean(value, 200).toLocaleLowerCase('en-US');
const KNOWN_ALIASES = new Map([['miu theatre', 'theater'], ['tuners', 'tunners'], ['ieee miu sb', 'ieee'], ['miu-munal', 'mun']]);
const aliasKey = name => KNOWN_ALIASES.get(normalizeName(name)) || normalizeName(name);
const SENIOR = /\b(president|vice|head|board|leader|director|coordinator|manager|secretary|treasurer|founder|senior)\b/i;

function validateRow(row, rowNumber) {
  const member = {
    name: clean(row.name, 120), phone: clean(row.phone, 40), universityId: clean(row.universityId, 40),
    email: clean(row.email, 254).toLowerCase(), major: clean(row.faculty, 120), clubName: clean(row.clubName, 120),
    role: clean(row.role, 100), boardPosition: clean(row.boardPosition, 100), committee: clean(row.committee, 100)
  };
  const problems = [];
  if (!member.name) problems.push('Full Name is empty');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) problems.push('MIU Email Address is not a valid email');
  if (!member.clubName) problems.push('Club Name is empty');
  return { rowNumber, member, problems };
}

function toRosterEntry(member, existing) {
  // Board position wins as the visible position; otherwise the role (e.g. "Member").
  const position = member.boardPosition || member.role || existing?.position || 'Member';
  return {
    id: existing?.id || crypto.randomBytes(16).toString('hex'),
    name: member.name, email: member.email,
    universityId: member.universityId || existing?.universityId || '',
    major: member.major || existing?.major || '',
    phone: member.phone || existing?.phone || '',
    age: existing?.age || '', motivation: existing?.motivation || '',
    interviewAnswers: existing?.interviewAnswers || [], interviewNotes: existing?.interviewNotes || '', interviewRating: existing?.interviewRating || 0,
    committee: member.committee || existing?.committee || 'General',
    position,
    memberType: SENIOR.test(`${member.role} ${member.boardPosition}`) ? 'senior' : (existing?.memberType || 'new')
  };
}

function registerAdminMemberImport(app, { Club, requireLiveDatabase, isSameOriginRequest }) {
  app.post('/api/admin/members/import', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
    if (!requireLiveDatabase(res)) return;
    const rows = req.body?.rows;
    const dryRun = req.body?.dryRun === true;
    if (!Array.isArray(rows) || !rows.length || rows.length > 3000) return res.status(400).json({ message: 'Send between 1 and 3,000 member rows.' });
    try {
      const checked = rows.map((row, index) => validateRow(row || {}, Number.isSafeInteger(row?.rowNumber) ? row.rowNumber : index + 2));
      const clubs = await Club.find({ archivedAt: null }).select('id name memberRoster members').read('primary').lean();
      const byName = new Map();
      for (const club of clubs) { byName.set(normalizeName(club.name), club); byName.set(aliasKey(club.name), club); }
      const seen = new Set();
      const plan = new Map(); // clubId -> { club, entries: Map(email -> entry) }
      const report = [];
      for (const { rowNumber, member, problems } of checked) {
        const club = byName.get(normalizeName(member.clubName)) || byName.get(aliasKey(member.clubName));
        if (!problems.length && !club) problems.push(`No club named "${member.clubName}"`);
        const key = club ? `${club.id}:${member.email}` : '';
        if (!problems.length && seen.has(key)) problems.push('Same email listed twice for this club in the sheet');
        if (problems.length) { report.push({ rowNumber, name: member.name, email: member.email, club: member.clubName, status: 'error', message: problems.join('; ') }); continue; }
        seen.add(key);
        if (!plan.has(club.id)) plan.set(club.id, { club, entries: new Map((club.memberRoster || []).map(entry => [String(entry.email || '').toLowerCase(), entry])) });
        const target = plan.get(club.id);
        const existing = target.entries.get(member.email);
        target.entries.set(member.email, { ...toRosterEntry(member, existing), _changed: true });
        report.push({ rowNumber, name: member.name, email: member.email, club: club.name, status: existing ? 'updated' : 'added', message: existing ? 'Existing member updated' : 'New member added' });
      }
      let saved = 0;
      if (!dryRun) {
        // Same write path as editing a member in the club dashboard: load the club, change its roster, save.
        for (const { club, entries } of plan.values()) {
          const doc = await Club.findOne({ id: club.id, archivedAt: null }).select('memberRoster members').read('primary');
          if (!doc) throw Object.assign(new Error(`${club.name} was archived or removed during the import.`), { status: 409 });
          let added = 0;
          for (const { _changed, ...entry } of entries.values()) {
            if (!_changed) continue;
            const current = doc.memberRoster.find(item => String(item.email || '').toLowerCase() === entry.email);
            if (current) Object.assign(current, entry, { id: current.id });
            else { doc.memberRoster.push(entry); added += 1; }
          }
          // The member count also includes accepted applications, so new roster members are added to it (like adding one member by hand).
          doc.members = (Number(doc.members) || 0) + added;
          await doc.save();
          saved += 1;
        }
      }
      const count = status => report.filter(item => item.status === status).length;
      res.json({ dryRun, savedClubs: saved, added: count('added'), updated: count('updated'), errors: count('error'), rows: report });
    } catch (error) {
      console.error('Member import failed:', error.name, error.message);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'Members could not be imported right now. Nothing was changed for clubs not yet saved.' });
    }
  });
}

module.exports = { registerAdminMemberImport, validateRow, toRosterEntry };
