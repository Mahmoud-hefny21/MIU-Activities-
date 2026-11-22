// End-to-end workflow test against a LOCAL server (default http://localhost:1112) and its SQL database.
//   node scripts/e2e-workflows.cjs setup    -> creates a test club + test students (local SQL only)
//   node scripts/e2e-workflows.cjs run      -> runs every workflow through the real website routes
//   node scripts/e2e-workflows.cjs cleanup  -> removes every test record by exact id / email
// Writes results to D:/MIU-backups/e2e/ (Excel report + the Excel files the website produced).
require('dotenv').config();
process.env.DATABASE_PROVIDER = 'sqlserver';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.E2E_BASE || 'http://localhost:1112';
const OUT = process.env.E2E_OUT || 'D:/MIU-backups/e2e';
const CLUB_ID = 9901, CLUB_NAME = 'QA E2E Test Club';
const STUDENTS = ['qa.e2e.student1@miuegypt.edu.eg', 'qa.e2e.student2@miuegypt.edu.eg', 'qa.e2e.usher@miuegypt.edu.eg'];
const STAFF = { president: 'qa.e2e.president@miuegypt.edu.eg', head: 'qa.e2e.head@miuegypt.edu.eg', supervisor: 'qa.e2e.supervisor@miuegypt.edu.eg', pr: 'qa.e2e.pr@miuegypt.edu.eg', sso: 'qa.e2e.sso@miuegypt.edu.eg', english: 'qa.e2e.english@miuegypt.edu.eg', dean: 'qa.e2e.dean@miuegypt.edu.eg' };
const PASSWORD = 'QaE2e!2026-pass';
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

async function db() {
  // Test records must never reach shared data (the local main database is synced to the live site).
  require('../tests/helpers/isolated-test-database.cjs').assertIsolatedTestDatabase();
  await require('../database').connect();
  return require('../models');
}

async function setup() {
  const { Club, StudentAccount } = await db();
  if (!await Club.findOne({ id: CLUB_ID }).lean()) {
    await Club.create({ id: CLUB_ID, sortOrder: 9999, name: CLUB_NAME, committee: 'QA Testing', category: 'Testing', tagline: 'Temporary club for automated tests',
      description: 'Temporary club created by the end-to-end test. Removed after the test.', requirements: 'None', image: '/assets/img/pics/logo.svg.png', imageFit: 'contain',
      status: 'open', members: 0, applicants: 0, memberRoster: [], committeeAvailability: [], events: [], booths: [] });
  }
  for (const [i, email] of STUDENTS.entries()) {
    if (!await StudentAccount.findOne({ email }).lean()) await StudentAccount.create({ email, name: `QA Student ${i + 1}`, universityId: `99000${i + 1}`, major: 'Computer Science', phone: '0100000000' + i, age: 20, sessionVersion: 0 });
  }
  console.log('Setup done: club', CLUB_ID, 'and', STUDENTS.length, 'students. Restart the test server with ONESIGNAL_APP_ID empty (no real pushes), then run.');
  process.exit(0);
}

async function cleanup() {
  const models = await db();
  const { Club, StudentAccount, ClubAccount, Application, AttendanceRecord, AttendanceSession, EventRegistration, ContentRequest } = models;
  const out = {};
  const del = async (name, Model, filter) => { if (!Model) return; const r = await Model.deleteMany(filter); out[name] = r.deletedCount ?? r.n ?? 0; };
  const emails = [...STUDENTS, ...Object.values(STAFF)];
  // Every table that belongs to a club: delete only rows of the test club (exact clubId).
  for (const spec of require('../database/catalog').catalog().reverse()) { // children before parents
    if (spec.model.modelName === 'Club' || !spec.model.schema.path('clubId')) continue;
    await del(spec.model.modelName, spec.model, { clubId: CLUB_ID });
  }
  for (const email of emails) { await del('staff:' + email, ClubAccount, { email }); await del('student:' + email, StudentAccount, { email }); }
  await del('club', Club, { id: CLUB_ID });
  console.log('Cleanup:', JSON.stringify(out));
  process.exit(0);
}

// ---------------- run ----------------
const results = [];
function cookieFor(email) {
  const payload = `${Buffer.from(email).toString('base64url')}.${Date.now() + 864e5}.0`;
  return `miu_student=${payload}.${crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('hex')}`;
}
function jar() {
  const cookies = new Map();
  return {
    set(raw) { for (const c of [].concat(raw || [])) { const [pair] = c.split(';'); const [k, ...v] = pair.split('='); if (v.join('=') === '') cookies.delete(k.trim()); else cookies.set(k.trim(), v.join('=')); } },
    add(pair) { const [k, ...v] = pair.split('='); cookies.set(k, v.join('=')); },
    header() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  };
}
async function call(who, method, url, body, { raw = false } = {}) {
  const res = await fetch(BASE + url, { method, headers: { Origin: BASE, 'Content-Type': 'application/json', Cookie: who.header() }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  who.set(res.headers.getSetCookie?.() || []);
  if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 200) }; }
  return { status: res.status, data };
}
async function step(area, name, fn) {
  const started = Date.now();
  try { const detail = await fn(); results.push({ area, name, result: 'PASS', detail: String(detail ?? ''), ms: Date.now() - started }); console.log('PASS', area, '-', name, detail ? '· ' + detail : ''); }
  catch (error) { results.push({ area, name, result: 'FAIL', detail: error.message, ms: Date.now() - started }); console.log('FAIL', area, '-', name, '·', error.message); }
}
const expect = (r, ok, label) => { if (!(Array.isArray(ok) ? ok : [ok]).includes(r.status)) throw new Error(`${label || 'request'} returned ${r.status}: ${r.data?.message || JSON.stringify(r.data).slice(0, 160)}`); return r.data; };
const save = (name, buffer) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), buffer); return name; };

async function run() {
  // Published test events must never reach real phones: the test server must run with ONESIGNAL_APP_ID empty.
  if (process.env.E2E_SERVER_PUSH_OFF !== '1') { console.error('Start the test server with ONESIGNAL_APP_ID empty, then run again with E2E_SERVER_PUSH_OFF=1.'); process.exit(1); }
  const admin = jar(), ctx = {};
  const staff = Object.fromEntries(Object.keys(STAFF).map(k => [k, jar()]));
  const students = STUDENTS.map(email => { const j = jar(); j.add(cookieFor(email)); return j; });
  const C = { admin, staff, students, ctx, call, step, expect, save, CLUB_ID, STAFF, STUDENTS, PASSWORD, BASE, OUT };

  await step('Admin', 'Admin signs in', async () => expect(await call(admin, 'POST', '/api/admin/login', ADMIN), 200).authenticated);
  await step('Admin', 'Create test staff accounts (president, head, supervisor, PR, SSO, English, Dean)', async () => {
    for (const [role, email] of Object.entries(STAFF)) {
      if (role === 'head') continue;
      const body = { email, name: 'QA ' + role, role, assignedClubIds: ['president', 'supervisor'].includes(role) ? [CLUB_ID] : [], password: PASSWORD, confirmPassword: PASSWORD };
      expect(await call(admin, 'PUT', '/api/admin/staff-accounts', body), 200, role);
    }
    return 'created 6 accounts';
  });
  await step('Admin', 'Add a committee head (creates the "Media" committee)', async () => expect(await call(admin, 'POST', '/api/admin/club-heads', { clubId: CLUB_ID, committee: 'Media', email: STAFF.head, password: PASSWORD }), [200, 201, 409]).message);
  for (const role of Object.keys(STAFF)) await step('Sign-in', `${role} signs in`, async () => expect(await call(staff[role], 'POST', '/api/auth/login', { email: STAFF[role], password: PASSWORD }), 200).role);

  const phases = require('./e2e-phases.cjs');
  for (const phase of phases) await phase(C);
  await report();
}

async function report() {
  const ExcelJS = require('exceljs');
  const { formatSheet } = require('../public/assets/js/spreadsheet-export');
  const book = new ExcelJS.Workbook();
  const pass = results.filter(r => r.result === 'PASS').length;
  formatSheet(book, [['Metric', 'Value'], ['Steps tested', results.length], ['Passed', pass], ['Failed', results.length - pass], ['Server', BASE], ['Run at', new Date().toISOString()]], 'Summary');
  const sheet = formatSheet(book, [['#', 'Area', 'Step', 'Result', 'Details', 'Time (ms)'], ...results.map((r, i) => [i + 1, r.area, r.name, r.result, r.detail, r.ms])], 'Every step');
  sheet.eachRow((row, n) => { if (n > 1) row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.getCell(4).value === 'PASS' ? 'FFC8E6C9' : 'FFFFCDD2' } }; });
  fs.mkdirSync(OUT, { recursive: true });
  await book.xlsx.writeFile(path.join(OUT, 'E2E test results.xlsx'));
  console.log(`\n${pass}/${results.length} passed. Report: ${OUT}/E2E test results.xlsx`);
}

const mode = process.argv[2];
if (mode === 'setup') setup().catch(e => { console.error(e); process.exit(1); });
else if (mode === 'cleanup') cleanup().catch(e => { console.error(e); process.exit(1); });
else if (mode === 'run') run().catch(e => { console.error(e); process.exit(1); });
module.exports = { results };
