// Local end-to-end security run: in-memory MongoDB replica set + the real server.js on localhost.
// No production access: the server runs from this folder (so the project .env is not loaded) and every
// production key is blanked. Test data only (*.test.local / @miuegypt.edu.eg test addresses).
// Run: npm run test:security-local   (needs the dev dependency mongodb-memory-server; downloads MongoDB on first run)
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const REPO = path.resolve(__dirname, '..');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PORT = 4321, BASE = `http://localhost:${PORT}`, PASS = 'Local-test-password-123';
const results = [];
const record = (id, pass, detail) => { results.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = pw => { const salt = crypto.randomBytes(16).toString('hex'); return { salt, passwordHash: crypto.scryptSync(pw, salt, 64).toString('hex') }; };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from(crypto.randomBytes(12), b => ALPHABET[b & 31]).join('');
const codeHash = c => crypto.createHash('sha256').update(c.toUpperCase()).digest('hex');
const cairo = (offsetMin = 0) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.now() + offsetMin * 60000)).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };

// Minimal per-account cookie jar.
function client() {
  const jar = new Map();
  return async (method, url, body, extra = {}) => {
    const headers = { Origin: BASE, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...extra };
    const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() || []) { const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  };
}

(async () => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = repl.getUri('miu_local_test');
  console.log('In-memory MongoDB ready');
  const { MongoClient, ObjectId } = require(path.join(REPO, 'node_modules/mongodb'));
  const mc = await MongoClient.connect(uri); const db = mc.db('miu_local_test');
  const today = cairo(0).date, start = cairo(10).time, tomorrow = cairo(24 * 60).date;
  const studentA = new ObjectId(), studentB = new ObjectId();
  const codes = { app1: code(), app21: code(), app22: code() };
  const clubBase = (id, name, extra) => ({ id, sortOrder: id, name, committee: 'General', category: 'Test', tagline: 'Test club', image: '/assets/img/pics/logo.svg.png', imagePublicId: '', imageFit: 'contain', status: 'open', seats: 0, members: 0, description: 'Local test club', requirements: 'None', archivedAt: null, memberRoster: [], committeeAvailability: [], applicationFields: [], events: [], posts: [], sponsors: [], booths: [], registrationRevision: 0, createdAt: new Date(), updatedAt: new Date(), ...extra });
  await db.collection('clubs').insertMany([
    clubBase(1, 'Club A', { profile: { socialLinks: ['javascript:alert(1)', 'https://ok.example/club-a'] },
      memberRoster: [{ name: 'Student A', email: 'student.a@miuegypt.edu.eg', committee: 'IT', memberType: 'new', createdAt: new Date(), updatedAt: new Date() }],
      events: [
        { requestId: 9001, contentType: 'event', title: 'Open event', date: today, time: start, description: 'x', image: '/x.png', registrationEnabled: true, attendanceEnabled: true, attendanceAudience: 'all_students', attendanceSettings: { timeZone: 'Africa/Cairo' }, capacity: null, createdAt: new Date() },
        { requestId: 9002, contentType: 'event', title: 'Members event', date: today, time: start, description: 'x', image: '/x.png', registrationEnabled: false, attendanceEnabled: true, attendanceAudience: 'members', attendanceSettings: { timeZone: 'Africa/Cairo' }, capacity: null, createdAt: new Date() }] }),
    clubBase(2, 'Club B', { interviewSlots: [
      { id: 'aaaaaaaaaaaaaaaa', date: tomorrow, start: '10:00', end: '10:15', capacity: 1, location: 'Room 1' },
      { id: 'bbbbbbbbbbbbbbbb', date: tomorrow, start: '11:00', end: '11:15', capacity: 5, location: 'Room 2' }] })
  ]);
  const staff = (email, role, clubId, committee = '') => ({ email, role, clubId, committee, assignedClubIds: [], roleAssignments: [{ role, clubId, assignedClubIds: [], committee }], sessionVersion: 0, ...hash(PASS), createdAt: new Date(), updatedAt: new Date() });
  await db.collection('clubaccounts').insertMany([staff('pres.a@test.local', 'president', 1), staff('pres.b@test.local', 'president', 2), staff('head.a@test.local', 'head', 1, 'IT'), staff('head.media@test.local', 'head', 1, 'Media')]);
  await db.collection('studentaccounts').insertMany([
    { _id: studentA, email: 'student.a@miuegypt.edu.eg', name: '=HYPERLINK("http://evil.example","x")', universityId: '2024/00001', major: 'CS', phone: '', age: '20', sessionVersion: 0, ...hash(PASS), createdAt: new Date(), updatedAt: new Date() },
    { _id: studentB, email: 'student.b@miuegypt.edu.eg', name: 'Student B', universityId: '2024/00002', major: 'CS', phone: '', age: '20', sessionVersion: 0, ...hash(PASS), createdAt: new Date(), updatedAt: new Date() }]);
  const app = (id, clubId, committee, extra) => ({ id, clubId, committee, studentName: 'Applicant ' + id, email: `applicant${id}@miuegypt.edu.eg`, universityId: '2024/0000' + (id % 10), major: 'CS', phone: '01000000000', age: '20', motivation: 'x', notes: '', rating: 0, interviewed: false, status: 'pending', photo: '/x.png', photoPublicId: '', answers: [], slot: '', interviewSlotId: '', createdAt: new Date(), updatedAt: new Date(), ...extra });
  await db.collection('applications').insertMany([
    app(1, 1, 'IT', { email: 'student.a@miuegypt.edu.eg', studentAccountId: studentA, managementTokenHash: codeHash(codes.app1) }),
    app(2, 1, 'Media'), app(3, 2, 'IT'),
    app(21, 2, 'IT', { managementTokenHash: codeHash(codes.app21), interviewSlotId: 'bbbbbbbbbbbbbbbb', slot: 'Room 2' }),
    app(22, 2, 'IT', { managementTokenHash: codeHash(codes.app22), interviewSlotId: 'bbbbbbbbbbbbbbbb', slot: 'Room 2' })]);
  await db.collection('contentrequests').insertOne({ id: 7001, clubId: 2, clubName: 'Club B', type: 'feed', title: 'Club B draft', status: 'draft', createdAt: new Date(), updatedAt: new Date() });
  const task = await db.collection('attendanceassignments').insertOne({ clubId: 1, clubName: 'Club A', itemType: 'event', eventRequestId: 9001, eventTitle: 'Open event', eventDate: today, eventTime: start, memberEmail: 'student.a@miuegypt.edu.eg', memberName: 'Student A', committee: 'IT', assignedBy: 'pres.a@test.local', activeMemberDayKey: crypto.randomBytes(16).toString('hex'), status: 'assigned', createdAt: new Date(), updatedAt: new Date() });
  await mc.close();
  console.log('Seeded: 2 clubs, 2 presidents, 2 heads, 2 students, 1 admin (env), 5 applications');

  // Start the real server with a clean environment (no production keys, no project .env).
  const blank = ['MONGO_URI', 'CLOUDINARY_URL', 'GOOGLE_CLIENT_ID', 'ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY', 'ONESIGNAL_SITE_URL', 'DATABASE_PROVIDER', 'SQLSERVER_HOST', 'SQLSERVER_PORT', 'SQLSERVER_DATABASE', 'SQLSERVER_AUTH_MODE', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD', 'SQLSERVER_ENCRYPT', 'SQLSERVER_TRUST_SERVER_CERTIFICATE', 'SQLSERVER_MIGRATION_TARGET_DATABASE', 'ADMIN_SESSION_SECRET', 'SQLSERVER_OPERATIONS_USER', 'SQLSERVER_OPERATIONS_PASSWORD', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'VERCEL'];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miu-security-')); const dataDir = path.join(workDir, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const env = { ...Object.fromEntries(blank.map(k => [k, ''])), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    MONGO_URI: uri, DATABASE_PROVIDER: 'mongodb', PORT: String(PORT), NODE_ENV: 'development', LOCAL_DATA_DIRECTORY: dataDir,
    ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: PASS, ADMIN_SESSION_SECRET: crypto.randomBytes(32).toString('hex') };
  const server = spawn(process.execPath, [path.join(REPO, 'server.js')], { cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 120 && !/Server running at/.test(log); i++) await sleep(500);
  if (!/Server running at/.test(log)) { console.error('Server did not start:\n' + log.slice(-3000)); server.kill(); await repl.stop(); process.exit(1); }
  console.log('Local server running at ' + BASE);

  const presA = client(), presB = client(), headA = client(), stuA = client(), stuB = client(), admin = client(), anon = client();
  for (const [c, email] of [[presA, 'pres.a@test.local'], [presB, 'pres.b@test.local'], [headA, 'head.a@test.local'], [stuA, 'student.a@miuegypt.edu.eg'], [stuB, 'student.b@miuegypt.edu.eg'], [admin, 'admin@test.local']]) {
    const r = await c('POST', '/api/auth/login', { email, password: PASS }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${r.text}`);
  }
  console.log('All 6 test accounts signed in\n');

  try {
    // IDOR
    let r = await presA('PATCH', '/api/applications/3/status', { status: 'accepted' }); record('IDOR-01', [403, 404].includes(r.status), `President A changes Club B application → ${r.status}`);
    r = await headA('PATCH', '/api/applications/2/status', { status: 'accepted' }); record('IDOR-02', [403, 404].includes(r.status), `IT head changes Media application → ${r.status}`);
    r = await presA('GET', '/api/club/2/applications'); record('IDOR-03', r.status === 403, `President A lists Club B applications → ${r.status}`);
    r = await presA('PUT', '/api/club/content/7001', { title: 'hijack' }); record('IDOR-04', [403, 404].includes(r.status), `President A edits Club B content → ${r.status}`);
    r = await presA('DELETE', '/api/applications/3'); record('IDOR-05', [403, 404].includes(r.status), `President A deletes Club B application → ${r.status}`);
    r = await stuB('GET', '/api/my-forms/1', undefined, { Authorization: `Bearer ${codes.app1}` }); const r2 = await anon('GET', '/api/my-forms/1');
    record('IDOR-06', r.status === 403 && r2.status === 404, `Student B with A's code → ${r.status}; no code, signed out → ${r2.status}`);
    r = await stuB('POST', `/api/member/attendance-assignments/${task.insertedId}/accept`); record('IDOR-07', [403, 404, 409].includes(r.status), `Student B accepts Student A's task → ${r.status}`);
    r = await presA('GET', '/api/club/heads'); record('IDOR-08', r.status === 200 && Array.isArray(r.json) && r.json.every(h => !/pres\.b|club b/i.test(JSON.stringify(h))) && r.json.length === 2, `President A sees only Club A heads → ${r.status}, ${r.json?.length} heads`);

    // PRIV
    r = await stuA('GET', '/api/club/applications'); record('PRIV-01', [401, 403].includes(r.status), `Student opens club applications → ${r.status}`);
    r = await headA('POST', '/api/club/heads', { email: 'new.head@miuegypt.edu.eg', committee: 'PR' }); record('PRIV-02', r.status === 403, `Committee head adds a head (president only) → ${r.status}`);
    r = await presA('GET', '/api/admin/club-heads'); const ra = await admin('GET', '/api/admin/club-heads'); record('PRIV-03', [401, 403].includes(r.status) && ra.status === 200, `President on admin API → ${r.status}; admin → ${ra.status}`);
    r = await presA('POST', '/api/club-auth/switch-dashboard', { role: 'president', clubId: 2 }); record('PRIV-04', r.status === 403, `President A switches to Club B president → ${r.status}`);

    // XSS
    r = await anon('GET', '/'); const csp = r.headers.get('content-security-policy') || '';
    const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
    record('XSS-01', !!csp && !/'unsafe-inline'/.test(scriptSrc) && r.headers.get('x-content-type-options') === 'nosniff', `Home page CSP script-src has no unsafe-inline, nosniff set`);
    r = await anon('GET', '/api/clubs'); const clubA = (r.json || []).find(c => c.id === 1);
    record('XSS-02', clubA && JSON.stringify(clubA.socialLinks) === JSON.stringify(['https://ok.example/club-a']), `Public club links: ${JSON.stringify(clubA?.socialLinks)}`);
    r = await presA('PUT', '/api/club/application-form', { applicationFields: [{ key: '"><script>alert(1)</script>', label: 'x', type: 'text' }] }); record('XSS-03', r.status === 400, `Question identifier with markup → ${r.status}`);
    r = await anon('GET', '/api/clubs/%3Cscript%3Ealert(1)%3C%2Fscript%3E/committees'); record('XSS-04', !/<script>/i.test(r.text) && /json/.test(r.headers.get('content-type') || ''), `Script in URL is not reflected (status ${r.status}, JSON)`);

    // ATTENDANCE
    r = await stuA('POST', '/api/events/1/0/registrations?eventRequestId=9001', {}); if (![200, 201].includes(r.status)) throw new Error('registration ' + r.status + ' ' + r.text);
    r = await stuA('GET', '/api/reverse-attendance/club/1/0/qr?eventRequestId=9001'); const qr = r.json;
    if (!qr?.token) throw new Error('qr ' + r.status + ' ' + r.text);
    const scan1 = await presA('POST', '/api/reverse-attendance/club/1/0/scan?eventRequestId=9001', { token: qr.token, name: 'Forged Name', email: 'forged@x' });
    record('ATT-02', scan1.json?.color === 'green' && scan1.json?.savedToDatabase === true && scan1.json?.name !== 'Forged Name' && scan1.json?.universityId?.includes('00001'), `Scan records the session student, ignores forged name → ${scan1.json?.result}, name from account`);
    const scan2 = await presA('POST', '/api/reverse-attendance/club/1/0/scan?eventRequestId=9001', { token: qr.token });
    record('ATT-03', scan2.json?.color === 'red' && scan2.json?.savedToDatabase === false, `Second scan of the same student → ${scan2.json?.result}`);
    r = await stuB('GET', '/api/reverse-attendance/club/1/1/qr?eventRequestId=9002'); record('ATT-04', r.status === 403 && r.json?.code === 'NOT_ELIGIBLE', `Non-member QR for members-only event → ${r.status} ${r.json?.code}`);
    r = await stuB('POST', `/api/member/attendance-assignments/${task.insertedId}/accept`); record('ATT-05', [403, 404, 409].includes(r.status), `Student B accepts Student A's attendance task → ${r.status}`);
    // Member checks in to the members-only event (used by the export check below).
    const memberQr = await stuA('GET', '/api/reverse-attendance/club/1/1/qr?eventRequestId=9002');
    const memberScan = await presA('POST', '/api/reverse-attendance/club/1/1/scan?eventRequestId=9002', { token: memberQr.json?.token });
    if (memberScan.json?.savedToDatabase !== true) throw new Error('member scan ' + memberScan.status + ' ' + memberScan.text);
    await stuB('POST', '/api/events/1/0/registrations?eventRequestId=9001', {});
    const old = await stuB('GET', '/api/reverse-attendance/club/1/0/qr?eventRequestId=9001');
    if (!old.json?.token) throw new Error('expiry qr ' + old.status + ' ' + old.text);
    console.log('   (waiting 16 s for the QR to expire…)'); await sleep(16000);
    r = await presA('POST', '/api/reverse-attendance/club/1/0/scan?eventRequestId=9001', { token: old.json?.token });
    record('ATT-01', r.status === 410 && r.json?.code === 'EXPIRED_QR', `Scanning a QR older than 15 s → ${r.status} ${r.json?.code}`);

    // XSS-05: spreadsheet export of the attendance just recorded (student name starts with "=").
    r = await presA('GET', `/api/report-downloads/attendance.csv?year=${today.slice(0, 4)}&clubId=1`);
    record('XSS-05', r.status === 200 && r.text.includes("'=HYPERLINK") && !/(^|,)"?=HYPERLINK/m.test(r.text), `Attendance CSV neutralises a formula name (status ${r.status})`);

    // BL-01: two students race for the last seat of an interview time.
    const [a, b] = await Promise.all([client()('PATCH', '/api/my-forms/21', { interviewSlotId: 'aaaaaaaaaaaaaaaa' }, { Authorization: `Bearer ${codes.app21}` }),
      client()('PATCH', '/api/my-forms/22', { interviewSlotId: 'aaaaaaaaaaaaaaaa' }, { Authorization: `Bearer ${codes.app22}` })]);
    const statuses = [a.status, b.status].sort();
    const mc2 = await MongoClient.connect(uri); const booked = await mc2.db('miu_local_test').collection('applications').countDocuments({ clubId: 2, interviewSlotId: 'aaaaaaaaaaaaaaaa' }); await mc2.close();
    record('BL-01', statuses[0] === 200 && statuses[1] === 409 && booked === 1, `Parallel bookings of a 1-seat time → ${statuses.join(' / ')}, booked in DB: ${booked}`);

    // AUTH-07 end to end: logout ends the session on the server (a copied cookie stops working).
    const copy = client(); await copy('POST', '/api/auth/login', { email: 'pres.b@test.local', password: PASS });
    const before = await copy('GET', '/api/club/heads');
    await presB('POST', '/api/club-auth/logout', {});
    const after = await copy('GET', '/api/club/heads');
    record('AUTH-07', before.status === 200 && after.status === 401, `Other session of the same account after logout → ${before.status} then ${after.status}`);
  } catch (error) {
    record('HARNESS', false, error.message);
  } finally {
    server.kill(); await repl.stop();
    fs.writeFileSync(path.join(workDir, 'results.json'), JSON.stringify(results, null, 2)); console.log('Results: ' + path.join(workDir, 'results.json'));
    const failed = results.filter(x => !x.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) { console.log('--- server log tail ---\n' + log.slice(-2500)); process.exitCode = 1; }
  }
})().catch(error => { console.error(error); process.exit(1); });
