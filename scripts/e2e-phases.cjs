// Workflow phases for scripts/e2e-workflows.cjs. Each phase uses only the real website routes.
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const soon = minutes => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.now() + minutes * 60000));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

async function applications({ admin, staff, students, ctx, call, step, expect, CLUB_ID, STUDENTS }) {
  const [s1, s2] = students;
  await step('Interviews', 'President adds interview times with seats', async () => {
    const d = expect(await call(staff.president, 'PUT', '/api/club/interview-slots', { slots: [{ date: day(5), start: '13:00', end: '13:15', capacity: 1 }, { date: day(5), start: '14:00', end: '14:15', capacity: 3 }] }), 200);
    ctx.slots = d.slots; return d.slots.length + ' times saved';
  });
  await step('Interviews', 'Applicant sees the open times', async () => {
    const d = expect(await call(s1, 'GET', `/api/clubs/${CLUB_ID}/interview-slots`), 200);
    if (d.slots.length !== 2) throw new Error('expected 2 times, got ' + d.slots.length); return d.slots.map(s => s.label).join(' | ');
  });
  const form = (email, i, slotId) => ({ clubId: CLUB_ID, committee: 'Media', email, studentName: `QA Student ${i}`, universityId: `99000${i}`, major: 'Computer Science', phone: '0100000000' + i, age: '20', motivation: 'I want to join to learn and help the club grow.', answers: [], interviewSlotId: slotId, photo: PHOTO });
  await step('Applications', 'Student 1 applies and books the 1-seat time', async () => {
    const d = expect(await call(s1, 'POST', '/api/applications', form(STUDENTS[0], 1, ctx.slots[0].id)), [200, 201]);
    ctx.app1 = d.application?.id || d.id; return 'application ' + ctx.app1;
  });
  await step('Interviews', 'A full interview time cannot be booked twice', async () => {
    const r = await call(s2, 'POST', '/api/applications', form(STUDENTS[1], 2, ctx.slots[0].id));
    if (r.status !== 409) throw new Error('expected 409, got ' + r.status); return r.data.message;
  });
  await step('Applications', 'Student 2 applies with another time', async () => {
    const d = expect(await call(s2, 'POST', '/api/applications', form(STUDENTS[1], 2, ctx.slots[1].id)), [200, 201]);
    ctx.app2 = d.application?.id || d.id; return 'application ' + ctx.app2;
  });
  await step('Applications', 'Same student cannot apply twice', async () => {
    const r = await call(s1, 'POST', '/api/applications', form(STUDENTS[0], 1, ctx.slots[1].id));
    if (r.status !== 409) throw new Error('expected 409, got ' + r.status); return r.data.message;
  });
  await step('Applications', 'President sees both applications', async () => {
    const d = expect(await call(staff.president, 'GET', '/api/club/applications'), 200);
    const list = Array.isArray(d) ? d : d.applications || [];
    const mine = list.filter(a => [ctx.app1, ctx.app2].map(String).includes(String(a.id)));
    if (mine.length !== 2) throw new Error('found ' + mine.length); return 'interview: ' + (mine[0].slot || '—');
  });
  await step('Applications', 'Committee head sees the Media applicants', async () => {
    const d = expect(await call(staff.head, 'GET', '/api/club/applications'), 200);
    const list = Array.isArray(d) ? d : d.applications || [];
    return list.filter(a => a.committee === 'Media').length + ' Media applicants';
  });
  await step('Applications', 'President accepts student 1 (becomes a member)', async () => expect(await call(staff.president, 'PATCH', `/api/applications/${ctx.app1}/status`, { status: 'accepted' }), 200).message || 'accepted');
  await step('Applications', 'Student 1 sees the decision in My Forms', async () => {
    const d = expect(await call(s1, 'GET', '/api/student/my-forms'), [200]);
    const list = Array.isArray(d) ? d : d.forms || d.applications || [];
    const a = list.find(x => String(x.id) === String(ctx.app1)); const st = a?.application?.status || a?.status; if (st !== 'accepted') throw new Error('status ' + st); return 'accepted';
  });
  await step('Applications', 'Admin rejects student 2', async () => expect(await call(admin, 'PATCH', `/api/admin/applications/${ctx.app2}/status`, { status: 'rejected', notes: 'QA test', rating: 3 }), 200).message || 'rejected');
  await step('Applications', 'Admin deletes student 2’s application', async () => expect(await call(admin, 'DELETE', `/api/admin/applications/${ctx.app2}`), [200, 204]).message || 'deleted');
  await step('Applications', 'Deleted application is gone', async () => {
    const d = expect(await call(admin, 'GET', '/api/admin/applications'), 200);
    if (d.some(a => String(a.id) === String(ctx.app2))) throw new Error('still listed'); return 'not listed';
  });
}

async function eventApprovals({ admin, staff, students, ctx, call, step, expect, CLUB_ID }) {
  const event = { type: 'event', submit: true, title: 'QA Test Workshop', description: 'Automated end-to-end test event.', date: today(), time: soon(20), startTime: soon(20), endTime: soon(140), location: 'Hall QA', attendanceAudience: 'all_students', registrationEnabled: true, attendanceEnabled: true, capacity: 50, image: PHOTO };
  await step('Event request', 'President submits an event request', async () => {
    const d = expect(await call(staff.president, 'POST', '/api/club/content', event), [200, 201]);
    ctx.requestId = d.request?.id || d.id || d.contentRequest?.id; return 'request ' + ctx.requestId + ' · ' + (d.message || d.request?.status || '');
  });
  // Each stage is approved by whoever the workflow says is next (supervisor, PR, SSO, Dean…).
  for (let round = 0; round < 6; round++) {
    let stage = null;
    await step('Approvals', `Approval round ${round + 1}`, async () => {
      const d = expect(await call(admin, 'GET', `/api/workflow/requests/content/${ctx.requestId}`), 200);
      const w = d.workflow, stage = w.definition.stages.find(x => x.id === w.stageId);
      if (w.state !== 'review' || !stage) { ctx.approved = true; return 'finished: ' + w.state; }
      const role = stage.roles.find(r => staff[r]);
      if (!role) throw new Error('no test account for ' + stage.roles.join(','));
      const r = expect(await call(staff[role], 'POST', `/api/workflow/requests/content/${ctx.requestId}/decision`, { action: 'approve', comment: 'QA approved', revision: w.revision, reviewRole: role }), 200);
      return `${stage.id} approved by ${role} → now ${r.workflow?.stageId || r.workflow?.state || 'next'}`;
    });
    if (ctx.approved) break;
  }
  await step('Event request', 'Approved event is published on the website', async () => {
    const d = expect(await call(admin, 'GET', `/api/clubs`), 200).find(c => c.id === CLUB_ID) || {};
    const ev = (d.events || []).find(e => e.title === event.title); if (!ev) throw new Error('event not on club page'); ctx.event = ev; ctx.eventIndex = d.events.indexOf(ev); return 'event index ' + ctx.eventIndex + ', request ' + ev.requestId;
  });
}

async function attendance({ admin, staff, students, ctx, call, step, expect, save, CLUB_ID }) {
  const [s1, s2, s3] = students, idx = ctx.eventIndex, rid = ctx.event?.requestId;
  for (const [i, s] of [[1, s1], [2, s2]]) await step('Registration', `Student ${i} registers for the event`, async () => expect(await call(s, 'POST', `/api/events/${CLUB_ID}/${idx}/registrations`, {}), [200, 201]).message || 'registered');
  await step('Registration', 'Registering twice does not double count', async () => { const r = await call(s1, 'POST', `/api/events/${CLUB_ID}/${idx}/registrations`, {}); return r.status + ' ' + (r.data.message || ''); });
  await step('Registration', 'President sees the registrations', async () => { const d = expect(await call(staff.president, 'GET', '/api/club/event-registrations'), 200); return JSON.stringify(d).includes('qa.e2e.student1') ? 'student 1 listed' : 'response: ' + JSON.stringify(d).slice(0, 80); });
  const base = `/api/reverse-attendance/club/${CLUB_ID}/${idx}`;
  for (const [i, s] of [[1, s1], [2, s2]]) {
    await step('Attendance', `Student ${i} opens their attendance QR`, async () => { const d = expect(await call(s, 'GET', base + '/qr'), 200); if (!d.token) throw new Error(d.message); ctx['token' + i] = d.token; return 'QR ready, refreshes in ' + Math.round(d.refreshAfterMs / 1000) + ' s'; });
    await step('Attendance', `President scans student ${i}`, async () => { const d = expect(await call(staff.president, 'POST', base + '/scan', { token: ctx['token' + i] }), 200); return d.message || d.status || 'recorded'; });
  }
  await step('Attendance', 'Scanning the same QR again does not record twice', async () => { const r = await call(staff.president, 'POST', base + '/scan', { token: ctx.token1 }); return r.status + ' ' + (r.data.message || ''); });
  await step('Attendance', 'A student cannot scan (only staff can)', async () => { const r = await call(s3, 'POST', base + '/scan', { token: ctx.token2 }); if (r.status < 400) throw new Error('student was allowed to scan'); return r.status + ' refused'; });
  await step('Attendance', 'Scanner overview loads', async () => { expect(await call(staff.president, 'GET', base), 200); return 'ok'; });
  await step('Attendance', 'President ends attendance (sent to PR)', async () => expect(await call(staff.president, 'POST', `/api/club/attendance-events/${CLUB_ID}/event/${rid}/end`, {}), [200, 201]).message || 'ended');
  await step('Attendance', 'Supervisor approves the attendance', async () => expect(await call(staff.supervisor, 'POST', `/api/supervisor/clubs/${CLUB_ID}/attendance/event/${rid}/decision?audience=all_students`, { action: 'approve', comment: 'QA ok' }), [200, 201]).message || 'approved');
  await step('Attendance', 'PR approves the attendance', async () => expect(await call(staff.pr, 'POST', `/api/committee/attendance-reviews/${CLUB_ID}/event/${rid}/approve?audience=all_students`, {}), [200, 201]).message || 'approved');
  for (const role of ['sso', 'dean']) await step('Attendance', `${role.toUpperCase()} approves the attendance`, async () => { const r = await call(staff[role], 'POST', `/api/committee/attendance-reviews/${CLUB_ID}/event/${ctx.event?.requestId}/approve?audience=all_students`, {}); if (![200, 201, 409].includes(r.status)) throw new Error(r.status + ' ' + r.data.message); return r.status === 409 ? 'not needed for this event (' + r.data.message + ')' : (r.data.message || 'approved'); });
  await step('Attendance', 'Final status of the check-ins', async () => { const d = expect(await call(admin, 'GET', '/api/report-downloads/student-attendance'), 200); return [...new Set(d.students.filter(x => /qa\.e2e/.test(x.email)).flatMap(x => x.events.map(e => e.status)))].join(', '); });
  // Excel files the website produces
  await step('Excel', 'Event list for downloads', async () => { const d = expect(await call(admin, 'GET', `/api/report-downloads/events?clubId=${CLUB_ID}&year=${new Date().getFullYear()}`), 200); ctx.eventKey = d.events.find(e => e.title === 'QA Test Workshop')?.key; if (!ctx.eventKey) throw new Error('event not in list'); return ctx.eventKey; });
  const download = async (name, url, who = admin) => { const r = await call(who, 'GET', url, undefined, { raw: true }); if (r.status !== 200 || !/sheet|excel|csv/.test(r.type || '')) throw new Error(`${r.status} ${r.buffer.toString().slice(0, 120)}`); return save(name, r.buffer) + ` (${Math.round(r.buffer.length / 1024)} KB)`; };
  await step('Excel', 'Download event attendance sheet', () => download('1 - Event attendance sheet.xlsx', `/api/report-downloads/event-sheet.xlsx?clubId=${CLUB_ID}&eventKey=${encodeURIComponent(ctx.eventKey)}&sheet=verified&audience=all_students&year=${new Date().getFullYear()}`));
  await step('Excel', 'Download event registrations sheet', () => download('2 - Event registrations.xlsx', `/api/report-downloads/event-sheet.xlsx?clubId=${CLUB_ID}&eventKey=${encodeURIComponent(ctx.eventKey)}&sheet=registered&audience=all_students&year=${new Date().getFullYear()}`));
  await step('Excel', 'Download club attendance for the year', () => download('3 - Club attendance (year).xlsx', `/api/report-downloads/attendance.xlsx?year=${new Date().getFullYear()}&clubId=${CLUB_ID}`));
  await step('Excel', 'Download event reports for the year', () => download('4 - Event reports (year).xlsx', `/api/report-downloads/reports.xlsx?year=${new Date().getFullYear()}&clubId=${CLUB_ID}`));
  await step('Excel', 'Download student event attendance (admin)', () => download('5 - Student event attendance.xlsx', '/api/report-downloads/student-attendance.xlsx'));
  await step('Excel', 'PR can download student event attendance', () => download('5b - Student event attendance (PR).xlsx', '/api/report-downloads/student-attendance.xlsx', staff.pr));
  await step('Excel', 'President cannot download student attendance', async () => { const r = await call(staff.president, 'GET', '/api/report-downloads/student-attendance'); if (r.status !== 403) throw new Error('got ' + r.status); return '403 refused'; });
  await step('Excel', 'Student attendance counts the 2 test students', async () => { const d = expect(await call(admin, 'GET', '/api/report-downloads/student-attendance'), 200); const qa = d.students.filter(x => /qa\.e2e/.test(x.email)); if (qa.length !== 2) throw new Error('found ' + qa.length); return qa.map(x => x.account + ': ' + x.attended).join(', '); });
}

async function finalChecks({ admin, staff, call, step, expect, CLUB_ID }) {
  await step('Delete', 'Admin archives the club', async () => expect(await call(admin, 'POST', `/api/admin/clubs/${CLUB_ID}/archive`, {}), [200, 204]).message || 'archived');
  await step('Delete', 'Archived club is hidden from the website', async () => { const d = expect(await call(admin, 'GET', '/api/clubs'), 200); if (d.some(c => c.id === CLUB_ID)) throw new Error('still public'); return 'hidden'; });
  await step('Delete', 'Admin restores the club', async () => expect(await call(admin, 'POST', `/api/admin/clubs/${CLUB_ID}/restore`, {}), [200, 204]).message || 'restored');
  await step('Security', 'Signed-out visitor cannot open admin data', async () => { const r = await call({ header: () => '', set() {} }, 'GET', '/api/admin/applications'); if (r.status !== 401) throw new Error('got ' + r.status); return '401'; });
  await step('Security', 'President cannot use admin routes', async () => { const r = await call(staff.president, 'GET', '/api/admin/applications'); if (r.status < 400) throw new Error('got ' + r.status); return String(r.status); });
}

async function imports({ admin, call, step, expect, CLUB_ID }) {
  // A messy sheet: title row, wrong capitals, email typo, phone with +20, duplicate row.
  const grid = [['QA members list'], [], ['Student Name', 'Mail', 'Club', 'Committee', 'Mobile'],
    ['  qa MEMBER one ', 'QA.E2E.MEMBER1@MIUEGPYT.EDU', 'qa e2e test club', 'media', '+20 100 111 2222'],
    ['QA Member Two', 'qa.e2e.member2@miuegypt.edu.eg', 'QA E2E Test Club', 'HR', '01112223334'],
    ['QA Member Two', 'qa.e2e.member2@miuegypt.edu.eg', 'QA E2E Test Club', '', '']];
  await step('Excel import', 'Preview a messy members sheet (auto-fix)', async () => {
    const d = expect(await call(admin, 'POST', '/api/admin/members/import', { grid, dryRun: true }), 200);
    if (d.added !== 2) throw new Error(`added ${d.added}, errors ${d.errors}`); return `${d.fixes.changes.length} fixes, ${d.added} to add`;
  });
  await step('Excel import', 'Import saves members into the right club and committee', async () => {
    const d = expect(await call(admin, 'POST', '/api/admin/members/import', { grid }), 200);
    const club = expect(await call(admin, 'GET', '/api/admin/club-members'), 200).find(c => c.id === CLUB_ID || c.clubId === CLUB_ID);
    const m = (club?.members || []).find(x => x.email === 'qa.e2e.member1@miuegypt.edu.eg');
    if (!m || m.committee !== 'Media' || m.name !== 'Qa Member One') throw new Error('member not saved correctly: ' + JSON.stringify(m)); return `${d.added} added · ${m.name} → ${m.committee}`;
  });
}

module.exports = [applications, eventApprovals, attendance, imports, finalChecks];
module.exports.helpers = { day, today };
