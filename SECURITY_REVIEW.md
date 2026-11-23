# MIU Activities — Security Review

Date: 23 Nov 2026 · Scope: this repository (server.js, services/, database/, public/assets/js/) · Method: static code review plus automated tests that run the real route code locally with in-memory data. **No requests were sent to production.**

**Update (fixes applied, approved by the owner):** F1, F2, F3, F4 and F7 are fixed and tested (`tests/security-review.test.js`, 22 tests). F5 is accepted as a known risk (reason below). F6 is done (the 12 test events were removed with a backup). F5: the app's own inline styles are removed. Full suite: 624 tests, 621 passed, 3 skipped, 0 failed.

## How this review was run

- **Route map.** All 259 routes in `server.js` and `services/*.js` were extracted with a script and each was classified by its auth check: route middleware, a check inside the handler, a guarded router (`router.use`), or the global `app.use('/api/admin', requireAdmin)` at `server.js:6897`. Every admin router (`staff-account-admin`, `supervisor-admin`, `admin-member-import`, `drive-logo`, `report-downloads`, `event-reports`, …) is registered **after** line 6897, so the global guard covers it. The routes left without auth are public by design: club lists, MIU Hub, sign-in, logout, the speaker-invite token, the attendance QR token, interview slots, public media and the view counters.
- **XSS.** All 154 `innerHTML` / `insertAdjacentHTML` sinks in `public/assets/js` were scanned for values inserted without escaping. Every candidate was traced, and all of them either go through escaping helpers or are fixed strings, numbers, server-validated identifiers, or URLs built by the server.
- **Local run (Step 3, done).** `tests/local-security-e2e.cjs` starts a throwaway in-memory MongoDB replica set (`mongodb-memory-server`) and seeds test data only: 2 clubs, 2 presidents, 2 committee heads, 2 students, 1 admin, 5 applications, one content draft and one attendance task. It then starts the real `server.js` on `localhost:4321` from a temporary folder, so the project `.env` is never read, and blanks every production key (database, Cloudinary, OneSignal, Google, SMTP). It signs in with each test account and runs the high-risk cases over real HTTP. **Result: 24/24 pass** (table below). No request goes to production.

## 1. Summary

| Test ID | Result | Severity | Location |
|---|---|---|---|
| AUTH-01 Google `aud`/`iss`/`exp`/`hd` checked on the server | Pass | — | `services/google-auth.js:14` (signature, aud, exp, iss via `verifyIdToken`), `:24-30` (nonce, email_verified, `hd=miuegypt.edu.eg`, azp, iat) |
| AUTH-02 Login rate limiting | Pass | — | `server.js:6105-6130` (lock per account and per source address) |
| AUTH-03 Forgot-password rate limiting | Pass | — | `server.js:6742` (`limitPasswordResetRequests`) |
| AUTH-04 Same message for existing and unknown email | Pass (timing difference **fixed**, F7) | Info | `server.js:6759`, `:6805` |
| AUTH-05 Reset token single-use and expiry | Pass | — | `server.js:6761-6763` (hashed, 20 min), `:6848` (deleted inside a transaction) |
| AUTH-06 Cookie flags HttpOnly / Secure / SameSite | Pass | — | `server.js:1063-1066` (`HttpOnly; SameSite=Strict`, `Secure` in production) |
| AUTH-07 Logout ends the session on the server | **Fixed** (F1, was Fail) | Medium | `server.js:2988`, `:6595` (student logout passes, `:6397`) |
| AUTH-08 Google redirect CSRF | Pass | — | `services/google-auth.js:49-54` (`g_csrf_token`), nonce `server.js:2065` |
| AUTH-09 Switch dashboard can't move to another club | Pass | — | `server.js:2958` (only roles assigned on the server) |
| IDOR-01..02 Application review is limited to own club and committee | Pass | — | `server.js:2358-2361` |
| IDOR-03 `/api/club/:id/applications` | Pass | — | `server.js:7984` |
| IDOR-04..07 Club content and speaker-request ids | Pass | — | `server.js:1888`, `:5406`, `:5558`, `:5676` |
| IDOR-08 Attendance task acceptance ownership | Pass | — | `server.js` `/api/member/attendance-assignments/:id/accept` |
| IDOR-09 My Forms code bound to application and account | Pass (fixed 23 Nov, commit `c25c7ee`) | — | `server.js` `findMyFormByToken` |
| IDOR-10 Application status and delete write by id only | **Fixed** (F2) | Low | `server.js:8472`, `:8498` |
| PRIV-01..04 Role checks | Pass | — | `server.js:1083-1093` (`requireClubAuth`), `:2358`, `:2958` |
| XSS-01..05 innerHTML sinks, `javascript:` links, spreadsheet formulas | Pass | — | escaping helpers: `admin-dashboard-features.js:12-14`, `admin-dashboard-v2.js:197`, `supervisor-dashboard.js:21`, `shared.js` `escapeHtml`; links: `public-club-media.js` (https only); exports: `report-downloads.js:9` |
| VAL MIU ID, age, email, duplicates, Full or Closed clubs | Pass | — | `server.js` `POST /api/applications` (normalized ID and age, duplicate check, 409 when the club isn't open) |
| UPLOAD-01 Signature fixes the parameters and requires sign-in by purpose | Pass | — | `server.js:171-187`, `:243-282` |
| UPLOAD-02 File size and type not limited by the signature | **Fixed** (F3: type signed; size checked when used) | Low | `server.js:171-187` |
| ATT-01..05 QR expiry and replay, identity from session, duplicates, members-only, task ownership | Pass | — | `services/reverse-attendance.js` (15 s sealed token, device binding, duplicate check, self-scan forbidden, `eligible()`) |
| BL-01 Race for the last interview seat | Pass (fixed 23 Nov, `dc96201`) | — | `services/interview-slots.js` `bookWithLock` |
| BL-02 Post-event report block enforced on the server | Pass | — | `server.js:5475` |
| GEN-01 CSRF on state-changing routes | Pass | — | `services/http-security.js:62-67`, `server.js:119` |
| GEN-02 CORS | Pass | — | `services/http-security.js:68-70`, `server.js:118` (own origin only) |
| GEN-03 Stack traces in error replies | Pass | — | handlers log `error.name` and return generic messages |
| GEN-04 Personal data in public endpoints and the stream | Pass | — | `services/public-data-stream.js:46` (sends only `{ keys }`), `public-club-media.js` (member list and profile removed) |
| GEN-05 Service worker caching private API replies | Pass | — | `public/sw.js:135` (`/api/` never cached) |
| HDR-01 HSTS without `includeSubDomains` | **Fixed** (F4) | Low | `services/http-security.js:44` |
| HDR-02 CSP `style-src 'unsafe-inline'` | **Partly fixed** (F5: the app has no inline styles; the policy stays for third-party scripts) | Low | `services/http-security.js:25` |
| DATA-01 `[TEST]` events visible publicly | **Fixed** (F6: removed, backup in database-backup/) | Info | live data (12 test events created 23 Nov for attendance testing) |

### End-to-end results (local server, seeded test database)

| ID | What was tried | Result |
|---|---|---|
| IDOR-01 | President A changes a Club B application | 403 ✅ |
| IDOR-02 | IT head changes a Media committee application | 403 ✅ |
| IDOR-03 | President A lists Club B applications | 403 ✅ |
| IDOR-04 | President A edits Club B content | 404 ✅ |
| IDOR-05 | President A deletes a Club B application | 403 ✅ |
| IDOR-06 | Student B uses Student A's My Forms code; no code while signed out | 403 / 404 ✅ |
| IDOR-07 | Student B accepts Student A's attendance task | 409 ✅ |
| IDOR-08 | President A lists heads, sees only Club A | 200, 2 heads ✅ |
| PRIV-01 | Student opens club applications | 401 ✅ |
| PRIV-02 | Committee head adds a head (president only) | 403 ✅ |
| PRIV-03 | President calls an admin API; admin calls it | 401 / 200 ✅ |
| PRIV-04 | President A switches to Club B president | 403 ✅ |
| XSS-01 | Home page CSP: no `unsafe-inline` for scripts, `nosniff` set | ✅ |
| XSS-02 | `javascript:` club link removed from public data | ✅ |
| XSS-03 | Question identifier containing markup | 400 ✅ |
| XSS-04 | `<script>` in the URL isn't reflected | 404 JSON ✅ |
| XSS-05 | Attendance CSV with a student name starting `=HYPERLINK(` | written as `'=HYPERLINK(` ✅ |
| ATT-01 | Scanning a QR older than 15 s | 410 EXPIRED_QR ✅ |
| ATT-02 | Scan body with a forged name | recorded with the account's own name ✅ |
| ATT-03 | Second scan of the same student | duplicate, nothing saved ✅ |
| ATT-04 | Non-member QR for a members-only event | 403 NOT_ELIGIBLE ✅ |
| ATT-05 | Accepting someone else's attendance task | 409 ✅ |
| BL-01 | Two parallel bookings of a 1-seat interview time | 200 + 409, 1 booking in the database ✅ |
| AUTH-07 | Another session of the same account after logout | 200 before, 401 after ✅ |

## 2. Findings

### F1 — AUTH-07: club and admin logout don't end the session on the server (Medium) — FIXED

**What happens:** logout only tells the browser to delete the cookie.

```js
// server.js:2988
app.post('/api/club-auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [ `miu_student=; Max-Age=0; …`, `miu_club=; Max-Age=0; …`, `miu_admin=; Max-Age=0; …` ]);
  res.status(204).end();
});
```

Student logout does it correctly (`server.js:6397`): it increases `sessionVersion`, so the old cookie stops working.

**Impact:** a club, staff or admin session cookie that was copied (from a shared computer, a browser extension, or malware) keeps working for up to 30 days after the owner logs out.

**Fix:**

```diff
-app.post('/api/club-auth/logout', (req, res) => {
+app.post('/api/club-auth/logout', async (req, res) => {
+  try {
+    const account = await getClubAccountFromRequest(req);
+    if (account) await ClubAccount.updateOne({ email: account.email, sessionVersion: account.sessionVersion ?? 0 }, { $inc: { sessionVersion: 1 } });
+  } catch (error) { console.error('Club logout revocation failed:', error.name); }
   res.setHeader('Set-Cookie', [ … ]);
   res.status(204).end();
 });
```

Do the same for `/api/admin/logout` (`server.js:6595`): increase `AdminAuthState.sessionVersion` and check it when validating the admin session.

**Applied:** `revokeSessionsOnLogout()` in `server.js`, called by `/api/club-auth/logout` and `/api/admin/logout`. It increases the club, student and admin `sessionVersion` on the server, so every copy of the old cookies stops working. The admin version is increased only when the `miu_admin` cookie itself is valid, so a developer (staff) session logging out never ends the admin's sessions. Both logouts clear the cookies with `Secure` in production. Logging out ends that account's sessions on all devices. Tests: F1 (2 tests).

### F2 — IDOR-10: application status and delete trust an in-memory copy (Low) — FIXED

**What happens:** permission is checked against the server's in-memory list of applications, and the database write then filters by application id alone.

```js
// server.js:8424 …
const app = applications.find(item => item.id === appId);
if (!accountCanReviewApplication(req.clubAccount, app)) return res.status(403)…
// server.js:8472
await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true })
// server.js:8498
await Application.deleteOne({ id: appId })
```

**Impact:** on Vercel, each server copy keeps its own list, and it can be out of date. If an application moves to another committee, a head could still change or delete it until the list refreshes, and recently submitted applications can wrongly return 404. The club can't change, so this never crosses clubs.

**Fix:** check permission and write in one database call:

```diff
-const updated = await Application.findOneAndUpdate({ id: appId }, { $set: updates }, { new: true }).lean();
+const scope = { id: appId, clubId: req.clubAccount.clubId, ...(req.clubAccount.role === 'head' ? { committee: req.clubAccount.committee } : {}) };
+const updated = await Application.findOneAndUpdate(scope, { $set: updates }, { new: true }).lean();
+if (!updated) return res.status(404).json({ message: 'Application not found' });
```

Use the same `scope` for `Application.deleteOne`, and load the application from the database rather than the in-memory list.

**Applied:** `reviewableApplicationFilter(account, id)` in `server.js` (club id, plus committee for heads) is used for the status read, the status write and the delete, so the database re-checks the permission. Admin routes still reach every club, as intended. Test: F2.

### F3 — UPLOAD-02: file size and type aren't part of the signed upload (Low) — FIXED

**What happens:** the server signs `folder`, `public_id`, `timestamp` and `overwrite` (`server.js:171-187`). The `maxBytes` value it returns is only advice to the browser, so a script can upload a much larger file. Applicant photos can be signed without signing in (limited to 10 per IP address per 10 minutes). Photos are re-checked when an application uses them (`readCloudinaryAsset`), but uploaded files stay in storage.

**Impact:** storage and bandwidth abuse of the Cloudinary account.

**Fix:** add `allowed_formats` to the signed parameters and use a signed upload preset with a maximum file size:

```diff
 const params = { folder, timestamp, public_id: publicId, overwrite: false,
+  allowed_formats: 'jpg,jpeg,png,webp',   // feed video: 'mp4,webm'
+  upload_preset: process.env.CLOUDINARY_SIGNED_PRESET  // preset sets max_file_size
 };
```

Also run a scheduled clean-up for unused files in the `applicant` folder.

**Applied:** `allowed_formats` is now a signed parameter (`jpg,png,webp` for images, `mp4,webm` for feed videos). The browser uploader sends it (`cloudinary-upload.js`, version tag updated on all 7 pages), so Cloudinary itself refuses other file types. Size can't be part of a signed upload. It is already enforced when an upload is used: `services/cloudinary-image-validation.js:60-89` stops reading past the limit and checks the real file type from its contents. **Left over:** unused uploads can still collect in storage. Recommended: a signed upload preset with `max_file_size` and a scheduled clean-up. Test: F3.

### F4 — HDR-01: HSTS without `includeSubDomains` (Low) — FIXED

`services/http-security.js:44` sends `max-age=31536000` only. Fix: `max-age=31536000; includeSubDomains` (add `preload` only once every subdomain is HTTPS). Apply the same header in `vercel.json` for static pages.

**Applied:** `services/http-security.js` and the static-page header block in `vercel.json` both send `max-age=31536000; includeSubDomains`. Test: F4.

### F5 — HDR-02: CSP allows inline styles (Low) — APP CLEANED UP, POLICY KEPT FOR THIRD PARTIES

`services/http-security.js:25` allows `style-src 'unsafe-inline'`. Scripts are strict (no inline scripts, confirmed by `tests/verify-structure.js`), so the risk is limited to CSS injection, for example hiding or overlaying page content. Fix over time: move inline `style=` attributes into CSS classes, then drop `'unsafe-inline'`, or use `'unsafe-hashes'` with hashes.

**Decision:** not changed. The app's own inline styles are few: 9 `style=` attributes in HTML, 5 in JS templates and one `<style>` block in `offline.html`. Styles set from JS through `element.style` are allowed without `'unsafe-inline'`. But Google Sign-In and OneSignal insert inline styles of their own, so removing `'unsafe-inline'` would break the sign-in button and the push-notification prompts. This can't be checked without a browser test. Scripts stay strict, so the remaining risk is CSS-only. Revisit if those providers support a style nonce.

**Applied:** the app no longer uses any inline styles. The 9 HTML `style=` attributes became CSS classes (`u-*`, `ra-dot-*` in `base.css`), and the 2 in `content-studio.js` likewise. The progress bars in `quiz.js` and `student-attendance.js` now use `data-pct` plus `element.style.width`, which is allowed under a strict policy. The `offline.html` `<style>` block moved to `/assets/css/offline.css`, which the service worker now pre-caches (cache `v46`). A test keeps every page and script free of inline styles. `'unsafe-inline'` stays in the policy only for Google Sign-In and OneSignal. Once those can be verified in a browser test, it can be removed.

### F6 — DATA-01: `[TEST]` events on the live site (Info) — WAITING FOR TESTING TO FINISH

Twelve `[TEST] #n … attendance test` events were created on 23 Nov for attendance testing. Remove them after testing:

```
DATABASE_PROVIDER=mongodb node scripts/test-events.cjs remove --apply
```

This removes the events and their test registrations and attendance records, and saves a backup first.

### F7 — AUTH-04: response-time difference in password recovery (Info) — FIXED

The reply message is the same, but for existing accounts the server also sends an email before answering (`server.js:6787`), so those replies are slower and someone could tell which emails exist. Fix: reply immediately and send the email in the background.

**Applied:** sending in the background isn't reliable on Vercel, because work after the reply can be cut off. Instead, every successful recovery reply now takes at least 1.5 s plus a random 0–0.5 s (`padPasswordRecoveryResponse` in `server.js`), whether or not the account exists. Test: F7.

## 3. Tests

**New:** `tests/security-review.test.js`, 24 tests (16 review tests, 6 for the fixes, 1 for attendance without registration, 1 for no inline styles). All pass.

| Test | Covers |
|---|---|
| IDOR-01 | President can't review another club's application |
| IDOR-02 / PRIV-01 | Head limited to own committee and club |
| PRIV-02 | Supervisor, PR, SSO, Dean, MIU Events and students can't review applications |
| IDOR-03 | `GET /api/club/:id/applications` returns 403 for another club (runs the real route) |
| IDOR-04..07 | Content and speaker-request routes use the session's club id |
| IDOR-08 | Attendance task acceptance is bound to the session's student |
| PRIV-03 | `requireClubAuth`: 401 when signed out; 403 for supervisor, MIU Events, developer and custom roles |
| PRIV-04 / AUTH-09 | Switch dashboard allows only roles assigned on the server |
| XSS-01 | Shared `escapeHtml` neutralises `<img onerror>` and quotes |
| XSS-02 | Admin render helpers escape titles and details |
| XSS-03 | The server rejects question identifiers like `"><script>` |
| XSS-04 | Club social links: `javascript:` and `http:` removed, `https:` kept |
| XSS-05 | Report exports neutralise formula cells |
| GEN-01 | Cross-site or Origin-less writes rejected (CSRF) |
| UPLOAD-01 | Signature parameters fixed on the server; client can't set folder or public_id |
| ATT / BL-01 | Points to the existing attendance and seat suites, and checks they cover expiry, replay, self-scan, duplicates and parallel booking |

**Existing tests that cover the rest:** `reverse-attendance.test.js` (QR expiry, replay, device binding, duplicates, self-scan, members-only, open-entry), `interview-slots.test.js` (parallel booking), `my-forms-token-binding.test.js` (application code bound to application and account), `application-club-status.test.js` (Full and Closed clubs), `quiz-analytics.test.js`, `view-dedupe.test.js`, `staff-google-auth.test.js`, `account-password-lifecycle.test.js`, `security-hardening.test.js`, `content-security-policy.test.js`.

**End-to-end:** `tests/local-security-e2e.cjs`, 24 cases on the real server with a seeded in-memory database (results above).

**Run:**

```
node --test tests/security-review.test.js     # this review only (no database needed)
npm run test:security-local                   # end-to-end on localhost with an in-memory MongoDB (24 cases)
node --test tests/*.test.js                   # full suite: 626 tests, 623 passed, 3 skipped, 0 failed
```

The unit tests need no database, network or credentials. The end-to-end run downloads a MongoDB binary on first use and uses only local test data.
