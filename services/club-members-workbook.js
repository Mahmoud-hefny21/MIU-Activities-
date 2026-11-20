const ExcelJS = require('exceljs');
const { formatSheet } = require('../public/assets/js/spreadsheet-export');

const MEMBER_HEADERS = ['Full name', 'MIU email', 'MIU ID', 'Major', 'Phone', 'Age', 'Committee', 'Position', 'Member type', 'Joined through', 'Joined on'];

// "2026-10-10T03:09:05.616Z" -> "10 Oct 2026" (Cairo date).
function joinedOn(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function memberRow(member) {
  return [
    member.name || '', member.email || '', member.universityId || '', member.major || '', member.phone || '', member.age || '',
    member.committee || '', member.position || 'Member', member.memberType === 'senior' ? 'Senior' : 'New',
    member.source === 'accepted-application' ? 'Application' : 'Added by club', joinedOn(member.createdAt)
  ];
}

const byCommitteeThenName = (a, b) => String(a.committee || '').localeCompare(String(b.committee || ''))
  || String(a.name || '').localeCompare(String(b.name || ''));

// Excel sheet names: max 31 characters, no []:*?/\ and unique within the workbook.
function sheetName(name, used) {
  const base = String(name || 'Club').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Club';
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// clubs: [{ name, members: [...] }] — one sheet per club, plus a summary and (for several clubs) an all-members sheet.
async function clubMembersWorkbook(clubs) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MIU Activities';
  const used = new Set(['summary', 'all members']);
  const summary = [['Club', 'Members', 'New members', 'Senior members', 'Committees']];
  for (const club of clubs) {
    const committees = new Set(club.members.map(member => String(member.committee || '').trim()).filter(Boolean));
    summary.push([club.name, club.members.length, club.members.filter(m => m.memberType !== 'senior').length,
      club.members.filter(m => m.memberType === 'senior').length, committees.size]);
  }
  formatSheet(workbook, summary, 'Summary');
  if (clubs.length > 1) {
    const all = clubs.flatMap(club => [...club.members].sort(byCommitteeThenName).map(member => [club.name, ...memberRow(member)]));
    formatSheet(workbook, [['Club', ...MEMBER_HEADERS], ...all], 'All members');
  }
  for (const club of clubs) {
    formatSheet(workbook, [MEMBER_HEADERS, ...[...club.members].sort(byCommitteeThenName).map(memberRow)], sheetName(club.name, used));
  }
  workbook.views = [{ activeTab: 1 }];
  return workbook.xlsx.writeBuffer();
}

const APPLICATION_FIELDS = 'id clubId studentName email universityId major phone age committee memberPosition memberType updatedAt';

async function sendMembersWorkbook(res, { Club, Application, buildClubMemberListing }, clubFilter, label) {
  const clubDocs = await Club.find(clubFilter).select('id name memberRoster').read('primary').readConcern('majority').sort({ name: 1 }).lean();
  if (!clubDocs.length) return res.status(404).json({ message: 'No clubs found.' });
  const clubIds = clubDocs.map((club) => Number(club.id));
  const acceptedApplications = await Application.find({ clubId: { $in: clubIds }, status: 'accepted' })
    .select(APPLICATION_FIELDS).read('primary').readConcern('majority').sort({ updatedAt: -1 }).lean();
  const clubsForSheet = clubDocs.map((club) => ({
    name: club.name || `Club ${club.id}`,
    members: buildClubMemberListing(club, acceptedApplications.filter((application) => Number(application.clubId) === Number(club.id))).members
  }));
  const buffer = await clubMembersWorkbook(clubsForSheet);
  const name = label || clubsForSheet[0].name;
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'club';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-members-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  return res.send(Buffer.from(buffer));
}

const exportFailed = (res, error) => {
  console.error('Club members export failed:', error.name);
  return res.status(503).json({ message: 'Could not create the members Excel file right now.' });
};

// Presidents: GET /api/club/members.xlsx — only the club whose dashboard is open (from the server-side session).
function registerClubMembersExport(app, deps) {
  const { requireClubAuth, requireClubPresident, requireLiveDatabase } = deps;
  app.get('/api/club/members.xlsx', requireClubAuth, requireClubPresident, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!requireLiveDatabase(res)) return;
      return await sendMembersWorkbook(res, deps, { id: Number(req.clubAccount.clubId) });
    } catch (error) { return exportFailed(res, error); }
  });
}

// Admin and PR: every active (not archived) club in one workbook. The caller registers it behind its own access check.
function allClubMembersHandler(deps) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!deps.requireLiveDatabase(res)) return;
      return await sendMembersWorkbook(res, deps, { archivedAt: null }, 'all-clubs');
    } catch (error) { return exportFailed(res, error); }
  };
}

module.exports = { clubMembersWorkbook, sheetName, registerClubMembersExport, allClubMembersHandler };
