const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { registerClubMembersExport, allClubMembersHandler, sheetName } = require('../services/club-members-workbook');

const CLUBS = [
  { id: 1, name: 'Robotics Club', memberRoster: [
    { id: 'r1', name: 'Omar Adel', email: 'omar@miuegypt.edu.eg', universityId: '00123', major: 'CS', phone: '+201000000001', age: '20', committee: 'Media', position: 'Designer', memberType: 'senior', createdAt: '2026-09-01T10:00:00.000Z' }
  ] },
  { id: 2, name: 'Model United Nations', memberRoster: [] },
  { id: 3, name: 'Drama Club', memberRoster: [{ id: 'd1', name: 'Not Mine', committee: 'Stage', position: 'Actor', memberType: 'new' }] },
  { id: 4, name: 'Old Archived Club', archivedAt: '2025-01-01T00:00:00.000Z', memberRoster: [{ id: 'z1', name: 'Archived Member', committee: 'X', position: 'Y', memberType: 'new' }] }
];
const APPLICATIONS = [
  { id: 7, clubId: 1, studentName: 'Sara Ali', email: 'sara@miuegypt.edu.eg', universityId: '2024001', major: 'Business', phone: '01000000002', age: '19', committee: 'HR', memberPosition: 'Member', memberType: 'new', updatedAt: '2026-10-05T08:00:00.000Z', status: 'accepted' },
  { id: 8, clubId: 2, studentName: 'Laila Samir', email: 'laila@miuegypt.edu.eg', committee: 'Delegates', memberType: 'new', updatedAt: '2026-10-06T08:00:00.000Z', status: 'accepted' },
  { id: 9, clubId: 3, studentName: 'Hidden Person', email: 'hidden@miuegypt.edu.eg', committee: 'Stage', status: 'accepted' }
];

const chain = (value) => ({ select() { return this; }, read() { return this; }, readConcern() { return this; }, sort() { return this; }, lean: async () => value });

const sorted = list => [...list].sort((a, b) => a.name.localeCompare(b.name));
const matchesClub = (club, filter) => ('id' in filter ? club.id === filter.id : true) && ('archivedAt' in filter ? !club.archivedAt : true);
function deps(seen) {
  return {
    requireClubAuth(req, res, next) { return req.clubAccount ? next() : res.status(401).json({}); },
    requireClubPresident(req, res, next) { return req.clubAccount.role === 'president' ? next() : res.status(403).json({}); },
    requireLiveDatabase: () => true,
    buildClubMemberListing: (club, accepted) => ({ members: [...club.memberRoster, ...accepted.map(a => ({
      name: a.studentName, email: a.email, universityId: a.universityId, major: a.major, phone: a.phone, age: a.age,
      committee: a.committee, position: a.memberPosition || 'Member', memberType: a.memberType || 'new', source: 'accepted-application', createdAt: a.updatedAt
    }))] }),
    Club: { find(filter) { seen.clubFilter = filter; return chain(sorted(CLUBS.filter(c => matchesClub(c, filter)))); } },
    Application: { find(filter) { seen.appClubIds = filter.clubId.$in; return chain(APPLICATIONS.filter(a => filter.clubId.$in.includes(a.clubId) && a.status === filter.status)); } }
  };
}
const fakeRes = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });

function harness() {
  let handlers; const seen = {};
  registerClubMembersExport({ get(path, ...callbacks) { assert.equal(path, '/api/club/members.xlsx'); handlers = callbacks; } }, deps(seen));
  return { seen, async download(clubAccount) {
    const req = { clubAccount };
    const res = fakeRes();
    let index = 0;
    await (async function next() { if (handlers[index]) await handlers[index++](req, res, next); })();
    return res;
  } };
}

async function readBook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const rows = name => { const out = []; workbook.getWorksheet(name).eachRow(row => out.push(row.values.slice(1))); return out; };
  return { names: workbook.worksheets.map(ws => ws.name), rows };
}

test('a president gets only the club whose dashboard is open, even if they lead other clubs', async () => {
  const h = harness();
  const res = await h.download({ role: 'president', clubId: 1, roleAssignments: [{ role: 'president', clubId: 1 }, { role: 'president', clubId: 2 }] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(h.seen.clubFilter, { id: 1 });
  assert.deepEqual(h.seen.appClubIds, [1]);
  const book = await readBook(res.body);
  assert.deepEqual(book.names, ['Summary', 'Robotics Club']);
  const text = JSON.stringify(book.rows('Robotics Club'));
  for (const other of ['Laila Samir', 'Not Mine', 'Hidden Person']) assert.ok(!text.includes(other), other + ' must not be exported');
});

test('admin and PR download every active club, one sheet each, without archived clubs', async () => {
  const seen = {};
  const res = fakeRes();
  await allClubMembersHandler(deps(seen))({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen.clubFilter, { archivedAt: null });
  assert.deepEqual(seen.appClubIds, [3, 2, 1]);
  assert.match(res.headers['Content-Disposition'], /^attachment; filename="all-clubs-members-\d{4}-\d{2}-\d{2}\.xlsx"$/);
  const book = await readBook(res.body);
  assert.deepEqual(book.names, ['Summary', 'All members', 'Drama Club', 'Model United Nations', 'Robotics Club']);
  assert.deepEqual(book.rows('Summary').slice(1).map(row => row.slice(0, 2)), [['Drama Club', 2], ['Model United Nations', 1], ['Robotics Club', 2]]);
  assert.equal(book.rows('All members').length, 6);
  assert.ok(!JSON.stringify(book.rows('All members')).includes('Archived Member'));
});

test('one club: members sheet keeps IDs as text and labels type, source and join date', async () => {
  const res = await harness().download({ role: 'president', clubId: 1 });
  const book = await readBook(res.body);
  assert.deepEqual(book.names, ['Summary', 'Robotics Club']);
  assert.match(res.headers['Content-Disposition'], /filename="robotics-club-members-/);
  const [header, first, second] = book.rows('Robotics Club');
  assert.deepEqual(header, ['Full name', 'MIU email', 'MIU ID', 'Major', 'Phone', 'Age', 'Committee', 'Position', 'Member type', 'Joined through', 'Joined on']);
  assert.deepEqual(first, ['Sara Ali', 'sara@miuegypt.edu.eg', '2024001', 'Business', '01000000002', '19', 'HR', 'Member', 'New', 'Application', '5 Oct 2026']);
  assert.deepEqual(second, ['Omar Adel', 'omar@miuegypt.edu.eg', '00123', 'CS', '+201000000001', '20', 'Media', 'Designer', 'Senior', 'Added by club', '1 Sept 2026']);
});

test('only presidents can download', async () => {
  for (const role of ['head', 'vice_president']) assert.equal((await harness().download({ role, clubId: 1 })).statusCode, 403);
  assert.equal((await harness().download(null)).statusCode, 401);
});

test('sheet names are valid and unique in Excel', () => {
  const used = new Set(['summary', 'all members']);
  const long = sheetName('Robotics: AI/ML [2026] Society of Very Long Names', used);
  assert.ok(long.length <= 31 && !/[[\]:*?/\\]/.test(long));
  assert.equal(sheetName('Summary', used), 'Summary 2');
  assert.notEqual(sheetName('Chess Club', used), sheetName('Chess Club', used));
});
