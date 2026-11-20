const test = require('node:test');
const assert = require('node:assert/strict');
const { deviceChecks } = require('../services/attendance-device-check');
const { attendanceWorkbook } = require('../services/attendance-workbook');
const ExcelJS = require('exceljs');

const history = [
  { email: 'a@miuegypt.edu.eg', deviceHash: 'p1' }, { email: 'b@miuegypt.edu.eg', deviceHash: 'p1' },
  { email: 'c@miuegypt.edu.eg', deviceHash: 'p3' }, { email: 'c@miuegypt.edu.eg', deviceHash: 'p4' },
  { email: 'd@miuegypt.edu.eg', deviceHash: 'p5' }, { email: 'x@miuegypt.edu.eg', deviceHash: 'p5' }
];
const Records = { find: () => ({ select() { return this; }, lean: async () => history }) };

test('phone check flags shared phones and switched phones, and names only accounts in the sheet', async () => {
  const sheet = [history[0], history[1], history[2], history[4], { email: 'e@miuegypt.edu.eg', deviceHash: 'p6' }];
  const checks = await deviceChecks(Records, sheet);
  assert.equal(checks.get(sheet[0]), 'Same phone as b@miuegypt.edu.eg');
  assert.equal(checks.get(sheet[2]), 'Used 2 different phones');
  assert.equal(checks.get(sheet[3]), 'Same phone as 1 other account', 'x is not in this sheet, so it is not named');
  assert.equal(checks.get(sheet[4]), 'OK');
});

test('attendance workbook colours flagged rows and adds a Phone alerts sheet', async () => {
  const rows = [['Full name', 'MIU email', 'Event', 'Checked in at', 'Approval status', 'Phone check'],
    ['Ali', 'a@miuegypt.edu.eg', 'Talk', '2026-11-20T10:00:00Z', 'approved', 'Same phone as b@miuegypt.edu.eg'],
    ['Eman', 'e@miuegypt.edu.eg', 'Talk', '2026-11-20T10:01:00Z', 'pending_supervisor', 'OK']];
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await attendanceWorkbook(rows));
  assert.deepEqual(book.worksheets.map(s => s.name), ['Summary', 'Event details', 'Attendance', 'Phone alerts', 'Review history']);
  const sheet = book.getWorksheet('Attendance');
  assert.equal(sheet.getRow(2).getCell(1).fill.fgColor.argb, 'FFFFE0B2');
  assert.notEqual(sheet.getRow(3).getCell(1).fill.fgColor.argb, 'FFFFE0B2');
  assert.equal(sheet.getRow(2).getCell(5).fill.fgColor.argb, 'FFC8E6C9');
  assert.equal(book.getWorksheet('Phone alerts').rowCount, 2);
});
