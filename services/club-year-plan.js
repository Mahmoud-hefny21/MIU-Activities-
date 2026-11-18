const ExcelJS = require('exceljs');

// A club's yearly activity plan, uploaded by its president as one Excel sheet.
const MAX_PLAN_ROWS = 500;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// Every activity needs all three: event name, date and description.
const COLUMNS = [
  { key: 'title', label: 'Event Name', aliases: ['event name', 'event', 'name', 'title', 'activity'] },
  { key: 'date', label: 'Date', aliases: ['date', 'event date', 'day'] },
  { key: 'description', label: 'Description', aliases: ['description', 'details', 'event description'] }
];
const TEXT_LIMITS = { title: 120, description: 600 };

class YearPlanError extends Error {}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.result !== undefined) return cellText(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.text !== undefined) return String(value.text);
    return '';
  }
  return value;
}

function pad(number) { return String(number).padStart(2, '0'); }

function toIsoDate(value) {
  const raw = cellText(value);
  if (raw === '') return '';
  let date = null;
  if (raw instanceof Date) {
    date = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  } else if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial day number (days since 1899-12-30).
    date = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000);
  } else {
    const text = String(raw).trim();
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    match = !date && text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    // Egypt writes day first: 20/11/2026.
    if (match) date = new Date(Date.UTC(+match[3], +match[2] - 1, +match[1]));
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function cleanText(value, limit) {
  const raw = cellText(value);
  const text = raw instanceof Date ? toIsoDate(raw) : String(raw);
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function parseYearPlanWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new YearPlanError('Choose an Excel file to upload.');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new YearPlanError('The Excel file must be 5 MB or smaller.');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new YearPlanError('This file could not be read. Upload an .xlsx Excel file.');
  }
  const sheet = workbook.worksheets.find((item) => item.actualRowCount > 0);
  if (!sheet) throw new YearPlanError('The Excel file is empty.');

  const header = sheet.getRow(1);
  const columnIndex = {};
  header.eachCell((cell, index) => {
    const name = String(cellText(cell.value)).trim().toLowerCase();
    const column = COLUMNS.find((item) => item.aliases.includes(name));
    if (column && !columnIndex[column.key]) columnIndex[column.key] = index;
  });
  if (!columnIndex.title || !columnIndex.date || !columnIndex.description) {
    throw new YearPlanError('The first row must have the columns "Event Name", "Date" and "Description". Download the template to see the layout.');
  }

  const entries = [];
  const skipped = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const read = (key) => (columnIndex[key] ? row.getCell(columnIndex[key]).value : '');
    const title = cleanText(read('title'), TEXT_LIMITS.title);
    const dateValue = read('date');
    const description = cleanText(read('description'), TEXT_LIMITS.description);
    if (!title && cellText(dateValue) === '' && !description) continue;
    const date = toIsoDate(dateValue);
    if (!title) { skipped.push({ row: rowNumber, reason: 'Event name is empty.' }); continue; }
    if (!date) { skipped.push({ row: rowNumber, reason: 'Date is missing or not a valid date.' }); continue; }
    if (!description) { skipped.push({ row: rowNumber, reason: 'Description is empty.' }); continue; }
    entries.push({ date, title, description });
    if (entries.length > MAX_PLAN_ROWS) throw new YearPlanError(`A year plan can have at most ${MAX_PLAN_ROWS} activities.`);
  }
  if (!entries.length) throw new YearPlanError('No activities were found. Add one activity per row under the header row.');
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { entries: entries.map((entry, index) => ({ id: index + 1, ...entry })), skipped };
}

async function buildYearPlanTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MIU Activities';
  const sheet = workbook.addWorksheet('Year plan');
  sheet.columns = COLUMNS.map((column) => ({
    header: column.label, key: column.key,
    width: { title: 34, date: 14, description: 60 }[column.key]
  }));
  sheet.getRow(1).font = { bold: true };
  const year = new Date().getFullYear();
  sheet.addRow({ title: 'Orientation day', date: new Date(Date.UTC(year, 9, 15)), description: 'Meet the board and the committees.' });
  sheet.addRow({ title: 'Training workshop', date: new Date(Date.UTC(year, 10, 3)), description: 'Hands-on training for new members.' });
  sheet.getColumn('date').numFmt = 'yyyy-mm-dd';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook.xlsx.writeBuffer();
}

module.exports = { parseYearPlanWorkbook, buildYearPlanTemplate, YearPlanError, MAX_UPLOAD_BYTES };
