const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseMiuAccount, buildStudentAttendance, studentAttendanceWorkbook } = require('../services/student-attendance');

test('MIU account gives enrollment year and university ID', () => {
  assert.deepEqual(parseMiuAccount('Mahmoud2406700@miuegypt.edu.eg'), { account: 'mahmoud2406700', enrollmentYear: '2024', universityId: '06700' });
  assert.deepEqual(parseMiuAccount('staff@miuegypt.edu.eg'), { account: 'staff', enrollmentYear: '', universityId: '' });
});

test('counts actual check-ins once per event; rejected check-ins never count', () => {
  const r = (email, id, status = 'approved', extra = {}) => ({ email, clubId: 1, itemType: 'event', eventRequestId: id, eventTitle: 'E' + id, eventDate: '2026-10-0' + id, approvalStatus: status, ...extra });
  const report = buildStudentAttendance([
    r('mahmoud2406700@miuegypt.edu.eg', 1), r('mahmoud2406700@miuegypt.edu.eg', 2, 'pending_supervisor'),
    r('MAHMOUD2406700@miuegypt.edu.eg', 2), // same event twice -> once
    r('mahmoud2406700@miuegypt.edu.eg', 3, 'rejected'),
    r('sara2500123@miuegypt.edu.eg', 1), r('sara2500123@miuegypt.edu.eg', 4, 'approved', { clubId: 0 })
  ], new Map([[1, 'Robotics']]));
  assert.equal(report.totals.students, 2);
  assert.equal(report.totals.checkIns, 4);
  const [first] = report.students;
  assert.equal(first.attended, 2); assert.equal(first.enrollmentYear, '2024'); assert.equal(first.universityId, '06700');
  assert.equal(first.approved, 1); assert.equal(first.waiting, 1);
  assert.deepEqual(report.students[1].clubs, ['MIU events', 'Robotics']);
  assert.equal(report.byYear['2025'].students, 1);
});

test('Excel has Summary, Students and Attendance details', async () => {
  const report = buildStudentAttendance([{ email: 'ali2300001@miuegypt.edu.eg', clubId: 1, eventRequestId: 1, eventTitle: 'Talk', eventDate: '2026-10-01', approvalStatus: 'approved' }]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await studentAttendanceWorkbook(report));
  assert.deepEqual(book.worksheets.map(s => s.name), ['Summary', 'Students', 'Attendance details']);
  assert.equal(book.getWorksheet('Students').getRow(2).getCell(8).value, 1);
});
