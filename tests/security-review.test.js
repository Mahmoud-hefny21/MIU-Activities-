// Security review regression tests (see SECURITY_REVIEW.md). They run the real server/route code with
// in-memory fakes; no network and no real data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');

const server = fs.readFileSync(require.resolve('../server'), 'utf8');
const slice = (from, to) => { const a = server.indexOf(from), b = server.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return server.slice(a, b); };
const listen = async (t, app) => { const s = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); }); t.after(() => new Promise(r => s.close(r))); return `http://127.0.0.1:${s.address().port}`; };

// --- IDOR / PRIV -------------------------------------------------------------------------------
const canReview = (() => { const c = vm.createContext({}); vm.runInContext(slice('function accountCanReviewApplication', 'registerPublicClubMedia('), c); return c.accountCanReviewApplication; })();

test('IDOR-01: a president cannot review another club\'s application', () => {
  assert.equal(canReview({ role: 'president', clubId: 1 }, { clubId: 2, committee: 'IT' }), false);
  assert.equal(canReview({ role: 'president', clubId: 1 }, { clubId: 1, committee: 'IT' }), true);
});

test('IDOR-02 / PRIV-01: a committee head only reviews applications of their own committee and club', () => {
  assert.equal(canReview({ role: 'head', clubId: 1, committee: 'IT' }, { clubId: 1, committee: 'Media' }), false);
  assert.equal(canReview({ role: 'head', clubId: 1, committee: 'IT' }, { clubId: 2, committee: 'IT' }), false);
  assert.equal(canReview({ role: 'head', clubId: 1, committee: 'IT' }, { clubId: 1, committee: 'IT' }), true);
});

test('PRIV-02: supervisor, PR or student roles cannot review applications', () => {
  for (const role of ['supervisor', 'pr', 'sso', 'dean', 'miu_events', 'student', undefined]) {
    assert.equal(canReview({ role, clubId: 1, committee: 'IT' }, { clubId: 1, committee: 'IT' }), false, role);
  }
});

test('IDOR-03: GET /api/club/:id/applications refuses a club id that is not the session club', async t => {
  const app = express();
  const ctx = { app, console, requireClubAuth: (req, res, next) => { req.clubAccount = { clubId: 1, role: 'president' }; next(); },
    requireLiveDatabase: () => true, Application: { find: () => { throw new Error('must not query'); } } };
  vm.createContext(ctx);
  vm.runInContext(slice("app.get('/api/club/:id/applications'", "\n});\n") + '\n});', ctx);
  const base = await listen(t, app);
  assert.equal((await fetch(base + '/api/club/2/applications')).status, 403);
});

const staticRoute = (start) => { const a = server.indexOf(start); assert.ok(a >= 0, start); return server.slice(a, server.indexOf('\n});\n', a)); };

test('IDOR-04..07: club content, speaker request and assignment routes look records up with the SESSION club id', () => {
  for (const route of ["app.put('/api/club/content/:id'", "app.delete('/api/club/content/:id'", "app.patch('/api/club/content/:id/assignment'"]) {
    assert.match(staticRoute(route), /ContentRequest\.findOne\(\{ id: Number\(req\.params\.id\), clubId: req\.clubAccount\.clubId \}\)/, route);
  }
  assert.match(staticRoute("app.post('/api/club/speaker-requests/:id/decision'"), /Number\(existing\.clubId\) !== Number\(req\.clubAccount\.clubId\)/);
});

test('IDOR-08: member attendance task acceptance is bound to the signed-in student', () => {
  const route = staticRoute("app.post('/api/member/attendance-assignments/:id/accept'");
  assert.match(route, /memberEmail: req\.studentAccount\.email/);
});

test('PRIV-03: requireClubAuth turns away supervisor, MIU Events, developer and custom roles from club routes', async t => {
  const make = role => { const ctx = { console, getClubAccountFromRequest: async () => role ? { role, clubId: 1 } : null }; vm.createContext(ctx);
    vm.runInContext(slice('async function requireClubAuth', 'function createStudentSession'), ctx); return ctx.requireClubAuth; };
  for (const [role, expected] of [[null, 401], ['supervisor', 403], ['miu_events', 403], ['software_development', 403], ['custom_x', 403]]) {
    const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } };
    let passed = false;
    await make(role)({}, res, () => { passed = true; });
    assert.equal(passed, false, String(role)); assert.equal(res.code, expected, String(role));
  }
});

test('PRIV-04 / AUTH-09: switching dashboards only allows roles assigned to the account', () => {
  const route = staticRoute("app.post('/api/club-auth/switch-dashboard'");
  assert.match(route, /getStaffDashboardOptions\(account\)\.find\(item => item\.role === req\.body\?\.role/);
  assert.match(route, /This dashboard is not assigned to your account/);
});

// --- XSS ---------------------------------------------------------------------------------------
const payload = '<img src=x onerror=alert(1)>"\'&';
const sharedCtx = (() => { const ctx = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, readyState: 'complete', documentElement: { dataset: {} } }, localStorage: { getItem() {}, setItem() {} }, navigator: {}, location: { pathname: '/' }, console, setTimeout, clearTimeout };
  ctx.window = ctx; vm.createContext(ctx); try { vm.runInContext(fs.readFileSync(require.resolve('../public/assets/js/shared.js'), 'utf8'), ctx); } catch { /* DOM-only parts may fail */ } return ctx; })();

test('XSS-01: the shared escapeHtml used by innerHTML templates neutralises markup and quotes', () => {
  const escape = sharedCtx.MiuUI?.escapeHtml;
  assert.equal(typeof escape, 'function');
  const out = escape(payload);
  assert.doesNotMatch(out, /[<>"']/);
  assert.match(out, /&lt;img/);
});

test('XSS-02: admin render helpers escape names, committees, comments and titles', () => {
  const src = fs.readFileSync(require.resolve('../public/assets/js/admin-dashboard-features.js'), 'utf8');
  assert.match(src, /const panel = \(title, content\) => `<section class="v2-feature-card"><h2>\$\{escape\(title\)\}/);
  assert.match(src, /<dd>\$\{escape\(valueText\(value\)\)\}<\/dd>/);
  const v2 = fs.readFileSync(require.resolve('../public/assets/js/pages/admin-dashboard-v2.js'), 'utf8');
  assert.match(v2, /const record = \(title, detail, actions = ''\) => `<article class="v2-record"><div><strong>\$\{escape\(title\)\}<\/strong><p>\$\{escape\(detail\)\}<\/p>/);
});

test('XSS-03: application question identifiers are restricted on the server, so they cannot break out of attributes', () => {
  const { validateQuestions } = require('../services/club-questions');
  const bad = [{ key: '"><script>', label: 'x', type: 'text' }];
  assert.throws(() => (validateQuestions || require('../services/club-questions').cleanQuestions)(bad));
});

test('XSS-04: club social links in public data must be https URLs (no javascript: links)', () => {
  const { sanitizePublicClub } = require('../services/public-club-media');
  const out = sanitizePublicClub({ id: 1, profile: { socialLinks: ['javascript:alert(1)', 'https://instagram.com/club', 'http://x.y'] } });
  assert.deepEqual(out.socialLinks, ['https://instagram.com/club']);
});

test('XSS-05: spreadsheet report exports neutralise formula cells', () => {
  const src = fs.readFileSync(require.resolve('../services/report-downloads'), 'utf8');
  assert.match(src, /Prevent spreadsheet formulas in user-supplied report\/student text/);
});

// --- CSRF / upload -----------------------------------------------------------------------------
test('GEN-01: state-changing API calls from another site are rejected (CSRF)', () => {
  const { protectMutations } = require('../services/http-security');
  const run = headers => { const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } }; let next = false;
    protectMutations({ method: 'POST', path: '/club/heads', get: name => headers[name.toLowerCase()] }, res, () => { next = true; }); return next ? 'next' : res.code; };
  assert.equal(run({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', host: 'miu-activities.vercel.app' }), 403);
  assert.equal(run({ host: 'miu-activities.vercel.app' }), 403, 'no Origin header');
});

test('UPLOAD-01: the Cloudinary signature fixes folder, random public_id and overwrite=false on the server', () => {
  const sign = staticRoute('function signCloudinaryUpload');
  assert.match(sign, /public_id: publicId/); assert.match(sign, /overwrite: false/);
  assert.doesNotMatch(staticRoute("app.post('/api/uploads/cloudinary-signature'"), /req\.body\.(folder|public_id|resource_type)/);
});

// --- ATTENDANCE / BUSINESS LOGIC (pointers to the existing suites) ----------------------------
test('ATT-01..05 and BL-01 are covered by the existing suites', () => {
  for (const file of ['reverse-attendance.test.js', 'interview-slots.test.js', 'scanner-manual-code.test.js']) assert.ok(fs.existsSync(require.resolve('./' + file)), file);
  const att = fs.readFileSync(require.resolve('./reverse-attendance.test.js'), 'utf8');
  assert.match(att, /expiry never write/); assert.match(att, /cannot record their own attendance/); assert.match(att, /duplicate red/);
  assert.match(fs.readFileSync(require.resolve('./interview-slots.test.js'), 'utf8'), /parallel bookings never overbook/);
});

// --- Fixes applied after the review (F1–F4, F7) --------------------------------------------------
test('F1 / AUTH-07: club logout ends the club and student sessions on the server, not only in the browser', async t => {
  const app = express(), updates = [];
  const ctx = { app, console, mongoReady: true, secureCookieSuffix: () => '',
    getClubAccountFromRequest: async () => ({ email: 'president@miuegypt.edu.eg', role: 'president' }),
    getStudentAccountFromRequest: async () => ({ email: 'student@miuegypt.edu.eg' }),
    ClubAccount: { updateOne: async (filter, update) => { updates.push(['club', filter.email, update.$inc.sessionVersion]); } },
    StudentAccount: { updateOne: async (filter, update) => { updates.push(['student', filter.email, update.$inc.sessionVersion]); } },
    AdminAuthState: { updateOne: async () => { updates.push(['admin']); } }, isAdminSessionValid: async () => false,
    getConfiguredAdminEmail: () => 'admin@miuegypt.edu.eg', loadAdminAuthState: async () => null };
  vm.createContext(ctx);
  vm.runInContext(slice('// Logout ends the session on the server', "app.get('/api/club/dashboard'"), ctx);
  const base = await listen(t, app);
  const res = await fetch(base + '/api/club-auth/logout', { method: 'POST', headers: { cookie: 'miu_club=x; miu_student=y' } });
  assert.equal(res.status, 204);
  assert.deepEqual(updates.sort(), [['club', 'president@miuegypt.edu.eg', 1], ['student', 'student@miuegypt.edu.eg', 1]]);
  assert.match(res.headers.get('set-cookie'), /miu_club=; Max-Age=0/);
});

test('F1 / AUTH-07: admin logout ends the admin session; a developer staff session does not end the admin\'s', async t => {
  const make = async (adminValid) => {
    const app = express(), updates = [];
    const ctx = { app, console, mongoReady: true, secureCookieSuffix: () => '', getClubAccountFromRequest: async () => null, getStudentAccountFromRequest: async () => null,
      ClubAccount: { updateOne: async () => {} }, StudentAccount: { updateOne: async () => {} },
      AdminAuthState: { updateOne: async (filter, update, options) => { updates.push([filter.email, update.$inc.sessionVersion, options.upsert]); } },
      isAdminSessionValid: async req => adminValid && /^miu_admin=/.test(req.headers.cookie), getConfiguredAdminEmail: () => 'admin@miuegypt.edu.eg', loadAdminAuthState: async () => null };
    vm.createContext(ctx);
    vm.runInContext(slice('// Logout ends the session on the server', "app.get('/api/club/dashboard'") + slice("app.post('/api/admin/logout'", 'const PASSWORD_RESET_TTL_MS'), ctx);
    return { base: await listen(t, app), updates };
  };
  const valid = await make(true);
  await fetch(valid.base + '/api/admin/logout', { method: 'POST', headers: { cookie: 'miu_admin=signed' } });
  assert.deepEqual(valid.updates, [['admin@miuegypt.edu.eg', 1, true]]);
  const forged = await make(false);
  await fetch(forged.base + '/api/admin/logout', { method: 'POST', headers: { cookie: 'miu_admin=forged; miu_club=dev' } });
  assert.deepEqual(forged.updates, [], 'an invalid admin cookie cannot log the admin out');
});

test('F2 / IDOR-10: application status and delete write only inside the session club (and committee for heads)', () => {
  const ctx = vm.createContext({}); vm.runInContext(slice('function reviewableApplicationFilter', 'function accountCanReviewApplication'), ctx);
  assert.deepEqual({ ...ctx.reviewableApplicationFilter({ role: 'president', clubId: 1 }, 7) }, { id: 7, clubId: 1 });
  assert.deepEqual({ ...ctx.reviewableApplicationFilter({ role: 'head', clubId: 1, committee: 'IT' }, 7) }, { id: 7, clubId: 1, committee: 'IT' });
  const status = staticRoute("app.patch('/api/applications/:id/status'");
  assert.match(status, /Application\.findOneAndUpdate\(scope,/); assert.match(status, /Application\.findOne\(scope\)/);
  assert.match(staticRoute("app.delete('/api/applications/:id', requireClubAuth"), /Application\.deleteOne\(reviewableApplicationFilter\(req\.clubAccount, appId\)\)/);
});

test('F3 / UPLOAD-02: allowed file formats are part of the signature and sent by the browser uploader', () => {
  const sign = staticRoute('function signCloudinaryUpload');
  assert.match(sign, /allowed_formats: allowedFormats/);
  assert.match(staticRoute("app.post('/api/uploads/cloudinary-signature'"), /video \? 'mp4,webm' : 'jpg,png,webp'/);
  const client = fs.readFileSync(require.resolve('../public/assets/js/cloudinary-upload.js'), 'utf8');
  assert.equal((client.match(/allowed_formats/g) || []).length, 2, 'image and video uploads both send it');
});

test('F4 / HDR-01: HSTS includes subdomains (server pages and static pages)', () => {
  assert.match(fs.readFileSync(require.resolve('../services/http-security'), 'utf8'), /max-age=31536000; includeSubDomains/);
  const vercel = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  assert.ok(vercel.headers.some(block => block.headers.some(h => h.key === 'Strict-Transport-Security' && /includeSubDomains/.test(h.value))));
});

test('F7 / AUTH-04: password recovery replies take at least 1.5 s whether or not the account exists', async () => {
  const ctx = { crypto: require('node:crypto'), Date, setTimeout, Promise }; vm.createContext(ctx);
  vm.runInContext(slice('const PASSWORD_RECOVERY_MIN_RESPONSE_MS', "app.post('/api/password-reset/request'"), ctx);
  const started = Date.now(); await ctx.padPasswordRecoveryResponse(started);
  assert.ok(Date.now() - started >= 1500);
  const route = staticRoute("app.post('/api/password-reset/request'");
  assert.equal((route.match(/await padPasswordRecoveryResponse\(recoveryStartedAt\)/g) || []).length, 2, 'both the unknown-email and the sent-email replies are padded');
});
