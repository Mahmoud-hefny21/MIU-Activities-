const ExcelJS = require('exceljs');
const { formatSheet } = require('../public/assets/js/spreadsheet-export');
// "2026-10-10T03:09:05.616Z" -> "10 Oct 2026, 5:09 AM" (Cairo time); anything else is kept as it is.
function readableTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(value)) && !(value instanceof Date) || Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}
const STATUS = { approved: 'Approved', rejected: 'Rejected', pending_supervisor: 'Waiting for supervisor', pending_pr: 'Waiting for PR', pending_sso: 'Waiting for SSO', pending_dean: 'Waiting for Dean', pending: 'Waiting for review' };
function readableStatus(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  return STATUS[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, ' ');
}
const FLAG = 'FFFFE0B2', GOOD = 'FFC8E6C9', WAIT = 'FFFFF3C4', BAD = 'FFFFCDD2';
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
// Orange row when the phone check needs a look; coloured status cell (green / yellow / red).
function colourAttendance(sheet, headings) {
  const phone = headings.indexOf('Phone check') + 1, status = headings.indexOf('Approval status') + 1;
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const check = phone ? String(row.getCell(phone).value || '') : '';
    if (check && check !== 'OK') row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(FLAG); });
    if (phone && check) row.getCell(phone).font = { name: 'Calibri', size: 11, bold: check !== 'OK', color: { argb: check === 'OK' ? 'FF2E7D32' : 'FFB45309' } };
    if (status) {
      const text = String(row.getCell(status).value || '');
      const colour = text === 'Approved' ? GOOD : text === 'Rejected' ? BAD : /^Waiting/.test(text) ? WAIT : '';
      if (colour) row.getCell(status).fill = fill(colour);
    }
  });
}
async function attendanceWorkbook(rows, details = {}) {
  const removed = new Set(['From time', 'To time', 'Type']);
  const keep = (rows[0] || []).map((heading, index) => removed.has(heading) ? -1 : index).filter(index => index >= 0);
  rows = rows.map(row => keep.map(index => row[index]));
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'MIU Activities';
  const headings = rows[0] || [], records = rows.slice(1);
  const index = name => headings.indexOf(name);
  const value = (row, name) => index(name) < 0 ? '' : row[index(name)];
  const registered = details.sheet === 'registered';
  const openAudience = (details.attendanceAudience || details.event?.attendanceAudience) === 'all_students';
  const knownEmails = new Set(records.map(row => String(value(row, 'MIU email') || '').trim().toLowerCase()).filter(Boolean));
  const summary = [ ['Metric', 'Value', 'Details'],
    ['Export type', registered ? 'Registered attendees' : openAudience ? 'Open event verified check-ins' : 'Verified check-ins', registered ? 'Registration does not prove attendance.' : 'Recorded check-ins; administrative approval is tracked separately.'],
    ['Exported records', records.length, 'Number of participant rows in the Attendance sheet.'],
    ['Unique recorded emails', knownEmails.size, 'Unique people identified by their recorded email within this export.'],
    ['Missing MIU ID', records.filter(row => !value(row, 'MIU ID')).length, 'IDs are read from the current student profile; missing IDs are not guessed.'],
    ['Missing major', records.filter(row => !value(row, 'Major')).length, 'Major is read from the current student profile.'],
    ['Generated at (UTC)', new Date().toISOString(), 'Export generation time.'],
    ['Period start', details.period?.start || 'All dates', 'Activity-date filter; both boundaries are inclusive.'],
    ['Period end', details.period?.end || 'All dates', 'Activity-date filter; both boundaries are inclusive.'] ];
  if (index('Membership') >= 0) {
    summary.push(['Member check-ins', records.filter(row => value(row, 'Membership') === 'Member').length, 'Membership was recorded from existing club roster and accepted applications at check-in time.']);
    summary.push(['Non-member check-ins', records.filter(row => value(row, 'Membership') === 'Non-member').length, 'No active club membership was found at check-in time.']);
  }
  const statuses = new Map();
  if (index('Event role') >= 0 && !registered) {
    for (const role of ['Organizer', 'Usher', 'President', 'Head']) summary.push([role + ' check-ins', records.filter(row => value(row, 'Event role') === role).length, 'Included in the attendance total; event role is separate from club membership.']);
  }
  for (const row of records) { const status = value(row, 'Approval status'); if (status) statuses.set(status, (statuses.get(status) || 0) + 1); }
  for (const [status, count] of statuses) summary.push(['Approval: ' + status.replace(/_/g, ' '), count, 'Administrative review status, not a separate attendance count.']);
  const phoneFlagged = index('Phone check') < 0 ? [] : records.filter(row => value(row, 'Phone check') && value(row, 'Phone check') !== 'OK');
  if (index('Phone check') >= 0 && !registered) {
    summary.push(['Phone check: needs a look', phoneFlagged.length, 'Orange rows in the Attendance sheet: the same phone was used by more than one account, or one account used more than one phone. Check these people in person.']);
    summary.push(['Colours in the Attendance sheet', 'Guide', 'Orange row = phone check needs a look. Status cell: green = Approved, yellow = Waiting, red = Rejected. Use the filter arrows in the top row to show one group.']);
  }
  formatSheet(workbook, summary, 'Summary');
  const activities = new Map();
  for (const row of records) {
    const key = JSON.stringify(['Club', 'Event', 'Event date', 'Type'].map(name => value(row, name)));
    if (!activities.has(key)) activities.set(key, { row, count: 0 });
    activities.get(key).count++;
  }
  const events = [['Club', 'Event', 'Event date', 'Location', 'Description', 'Exported participants', 'Data source']];
  for (const { row, count } of activities.values()) events.push([
    ...['Club', 'Event', 'Event date'].map(name => value(row, name)),
    details.event?.location || 'Not recorded', details.event?.description || 'Not recorded', count,
    details.event?.source === 'attendance' ? 'Existing attendance activity' : details.event ? 'Existing published event' : 'Existing attendance records']);
  formatSheet(workbook, events, 'Event details');
  // Readable for people: Cairo time instead of computer time, and plain-English approval statuses.
  const shownRows = rows.map((row, rowIndex) => rowIndex === 0 ? row : row.map((cell, column) => {
    const heading = headings[column];
    if (heading === 'Checked in at') return readableTime(cell);
    if (heading === 'Approval status') return readableStatus(cell);
    return cell;
  }));
  const attendanceSheet = formatSheet(workbook, shownRows, 'Attendance');
  colourAttendance(attendanceSheet, headings);
  if (phoneFlagged.length) {
    const columns = ['Full name', 'MIU ID', 'MIU email', 'Event', 'Event date', 'Checked in at', 'Phone check'].filter(name => index(name) >= 0);
    const alerts = formatSheet(workbook, [columns, ...phoneFlagged.map(row => columns.map(name => name === 'Checked in at' ? readableTime(value(row, name)) : value(row, name)))], 'Phone alerts');
    alerts.eachRow((row, n) => { if (n > 1) row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(FLAG); }); });
  }
  const history = [['Participant', 'MIU email', 'Reviewer role', 'Action', 'Review time (Cairo)', 'Review note']];
  for (const person of details.people || []) for (const review of person.approvalHistory || []) history.push([
    person.name || '', person.email || '', review.role || '', readableStatus(review.action || ''), review.createdAt ? readableTime(review.createdAt) : '', review.note || '']);
  formatSheet(workbook, history, 'Review history');
  workbook.views = [{ activeTab: 2 }];
  return workbook.xlsx.writeBuffer();
}
module.exports = { attendanceWorkbook };
