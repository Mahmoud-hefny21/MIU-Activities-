// Student event attendance: how many events each student actually attended.
// Only recorded check-ins count (QR scan / verified self check-in); registrations never count,
// and check-ins a reviewer rejected are excluded. Students are identified by their MIU account:
// "mahmoud2406700@miuegypt.edu.eg" -> enrollment year 2024, university ID 06700.
const ExcelJS = require('exceljs');
const { formatSheet } = require('../public/assets/js/spreadsheet-export');
const { eventRoleLabel } = require('./attendance-participation');

function parseMiuAccount(email) {
  const local = String(email || '').trim().toLowerCase().split('@')[0];
  const match = local.match(/(\d{2})(\d{5})$/);
  if (!match) return { account: local, enrollmentYear: '', universityId: '' };
  return { account: local, enrollmentYear: String(2000 + Number(match[1])), universityId: match[2] };
}

const STATUS = { approved: 'Approved', pending_supervisor: 'Waiting for supervisor', pending_pr: 'Waiting for PR', pending_sso: 'Waiting for SSO', pending_dean: 'Waiting for Dean' };

// records: AttendanceRecord rows; clubNames: Map(clubId -> name); profiles: Map(email -> StudentAccount)
function buildStudentAttendance(records, clubNames = new Map(), profiles = new Map()) {
  const students = new Map(), events = new Set();
  let checkIns = 0;
  for (const r of records) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || r.approvalStatus === 'rejected') continue;
    const type = r.itemType || 'event';
    const eventKey = `${r.clubId}:${type}:${r.eventRequestId > 0 ? r.eventRequestId : `${r.eventTitle}|${r.eventDate}`}`;
    let s = students.get(email);
    if (!s) {
      const profile = profiles.get(email) || {}, parsed = parseMiuAccount(email);
      s = { name: profile.name || r.name || parsed.account, email, account: parsed.account,
        universityId: r.universityId || profile.universityId || parsed.universityId, enrollmentYear: parsed.enrollmentYear,
        major: r.major || profile.major || '', attended: 0, approved: 0, waiting: 0, clubs: new Set(), lastDate: '', events: [], keys: new Set() };
      students.set(email, s);
    }
    if (s.keys.has(eventKey)) continue; // one count per event, even if recorded twice
    s.keys.add(eventKey); events.add(eventKey); checkIns++;
    const club = r.clubId === 0 ? 'MIU events' : clubNames.get(r.clubId) || `Club ${r.clubId}`;
    s.attended++; if (r.approvalStatus === 'approved') s.approved++; else s.waiting++;
    s.clubs.add(club);
    if (String(r.eventDate || '') > s.lastDate) s.lastDate = String(r.eventDate || '');
    s.events.push({ title: r.eventTitle || 'Event', club, date: r.eventDate || '', type: type === 'booth' ? 'Booth' : 'Event',
      role: eventRoleLabel(r), status: STATUS[r.approvalStatus] || 'Recorded', checkedInAt: r.attendedAt ? new Date(r.attendedAt).toISOString() : '' });
  }
  const list = [...students.values()].map(({ keys, clubs, ...s }) => ({ ...s, clubs: [...clubs].sort(), events: s.events.sort((a, b) => String(b.date).localeCompare(String(a.date))) }))
    .sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
  const byYear = {};
  for (const s of list) { const y = s.enrollmentYear || 'Unknown'; byYear[y] ||= { students: 0, attended: 0 }; byYear[y].students++; byYear[y].attended += s.attended; }
  const levels = { '1': 0, '2-4': 0, '5-9': 0, '10+': 0 };
  for (const s of list) levels[s.attended >= 10 ? '10+' : s.attended >= 5 ? '5-9' : s.attended >= 2 ? '2-4' : '1']++;
  return { totals: { students: list.length, checkIns, events: events.size, average: list.length ? Math.round(checkIns / list.length * 10) / 10 : 0 }, byYear, levels, students: list };
}

const cairo = value => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '';

async function studentAttendanceWorkbook(report, period = {}) {
  const book = new ExcelJS.Workbook(); book.creator = 'MIU Activities';
  const { totals, byYear, levels, students } = report;
  const summary = [['Metric', 'Value', 'Details'],
    ['Students who attended', totals.students, 'Students with at least one recorded check-in.'],
    ['Attended events (total)', totals.checkIns, 'One per student per event. Registrations are not counted; rejected check-ins are excluded.'],
    ['Different events', totals.events, 'Events and booths with at least one check-in.'],
    ['Average events per student', totals.average, ''],
    ['Period', period.start ? `${period.start} to ${period.end}` : 'All dates', 'Event-date filter.'],
    ['Generated at (Cairo)', cairo(new Date()), ''],
    ['', '', ''],
    ['Students by number of events', 'Students', '']];
  for (const [range, count] of Object.entries(levels)) summary.push([`${range} event${range === '1' ? '' : 's'}`, count, '']);
  summary.push(['', '', ''], ['Enrollment year', 'Students', 'Attended events']);
  for (const year of Object.keys(byYear).sort()) summary.push([year, byYear[year].students, byYear[year].attended]);
  formatSheet(book, summary, 'Summary');

  const rows = [['Rank', 'Full name', 'MIU account', 'MIU email', 'Enrollment year', 'University ID', 'Major', 'Events attended', 'Approved', 'Waiting for review', 'Clubs', 'Last event date']];
  students.forEach((s, i) => rows.push([i + 1, s.name, s.account, s.email, s.enrollmentYear, s.universityId, s.major, s.attended, s.approved, s.waiting, s.clubs.join('; '), s.lastDate]));
  const sheet = formatSheet(book, rows, 'Students');
  // Shade the "Events attended" cell: darker green = more events.
  const shades = ['FFE8F5E9', 'FFC8E6C9', 'FFA5D6A7', 'FF81C784'];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const count = Number(row.getCell(8).value) || 0, cell = row.getCell(8);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shades[count >= 10 ? 3 : count >= 5 ? 2 : count >= 2 ? 1 : 0] } };
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1B5E20' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (n <= 4) row.getCell(1).value = ['', '', '🥇 1', '🥈 2', '🥉 3'][n];
  });

  const details = [['Full name', 'MIU email', 'University ID', 'Event', 'Club', 'Type', 'Event date', 'Role', 'Checked in at (Cairo)', 'Review status']];
  for (const s of students) for (const e of s.events) details.push([s.name, s.email, s.universityId, e.title, e.club, e.type, e.date, e.role, cairo(e.checkedInAt), e.status]);
  formatSheet(book, details, 'Attendance details');
  book.views = [{ activeTab: 1 }];
  return book.xlsx.writeBuffer();
}

module.exports = { parseMiuAccount, buildStudentAttendance, studentAttendanceWorkbook };
