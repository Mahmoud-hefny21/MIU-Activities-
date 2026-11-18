const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseYearPlanWorkbook, buildYearPlanTemplate, YearPlanError } = require('../services/club-year-plan');
const policy = require('../services/workflow-policy');
const { publishApprovedContent } = require('../services/workflow-content-publisher');

async function workbook(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Plan');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('the downloadable template parses back into activities', async () => {
  const { entries, skipped } = await parseYearPlanWorkbook(Buffer.from(await buildYearPlanTemplate()));
  assert.equal(entries.length, 2);
  assert.deepEqual(skipped, []);
  assert.deepEqual(Object.keys(entries[0]).sort(), ['date', 'description', 'id', 'title']);
});

test('every event needs a name, a date and a description; columns are matched by name', async () => {
  const { entries, skipped } = await parseYearPlanWorkbook(await workbook([
    ['Description', 'Date', 'Event Name'],
    ['Opening session', '20/11/2026', 'Day-first'],
    ['No name', '2026-12-01', ''],
    ['Bad date', 'soon', 'Bad'],
    ['', '2026-12-05', 'No description'],
    ['Kick-off', new Date(Date.UTC(2026, 0, 10)), 'Real date']
  ]));
  assert.deepEqual(entries.map((entry) => [entry.date, entry.title, entry.description]), [
    ['2026-01-10', 'Real date', 'Kick-off'],
    ['2026-11-20', 'Day-first', 'Opening session']
  ]);
  assert.deepEqual(skipped.map((item) => [item.row, item.reason]), [
    [3, 'Event name is empty.'], [4, 'Date is missing or not a valid date.'], [5, 'Description is empty.']
  ]);
});

test('files missing any of the three columns or that are not Excel are refused', async () => {
  await assert.rejects(parseYearPlanWorkbook(await workbook([['Event Name', 'Date']])), /"Event Name", "Date" and "Description"/);
  await assert.rejects(parseYearPlanWorkbook(await workbook([['Name', 'When']])), YearPlanError);
  await assert.rejects(parseYearPlanWorkbook(Buffer.from('not excel')), /could not be read/);
});

test('year plans follow the full content approval chain', () => {
  const definition = policy.defaults('year_plan');
  assert.deepEqual(definition.stages.map((stage) => stage.id), ['supervisor', 'pr', 'english', 'dean']);
});

test('final approval replaces the club calendar with the approved plan', async () => {
  const club = { id: 7, yearPlan: [{ id: 1, date: '2025-01-01', title: 'Old' }], events: [], saved: 0, async save() { this.saved += 1; } };
  const Club = { findOne: () => ({ session: async () => club }) };
  const entries = [{ id: 1, date: '2026-10-15', title: 'Orientation day' }];
  await publishApprovedContent({ id: 9, clubId: 7, type: 'year_plan', yearPlanEntries: entries }, null, {
    Club, contentClubField: {}, buildPublishedItem: () => assert.fail('year plans are not club content items'),
    publishYearPlan: (target, record) => { target.yearPlan = record.yearPlanEntries; target.yearPlanUpdatedAt = new Date(); }
  });
  assert.deepEqual(club.yearPlan, entries);
  assert.equal(club.saved, 1);
  assert.deepEqual(club.events, []);
});
