const express = require('express');
const mongoose = require('mongoose');
const { EventReport, eventsFor, date } = require('./event-reports');
const { assignedIds } = require('./supervisor-dashboard');

// Post-event reports: after an approved event ends, the president reports on it, the report passes
// Supervisor -> PR -> English -> Dean, and students evaluate the event.
const STAGES = ['supervisor', 'pr', 'english', 'dean'];
const STAGE_LABELS = { supervisor: 'Club Supervisor', pr: 'PR', english: 'English', dean: 'Dean' };
const STATUS_LABELS = {
  missing: 'Report Required', draft: 'Draft', pending_supervisor: 'Pending Supervisor', pending_pr: 'Pending PR',
  pending_english: 'Pending English', pending_dean: 'Pending Dean', changes_requested: 'Changes Requested',
  approved: 'Fully Approved', submitted: 'Earlier report', reviewed: 'Earlier report'
};
const EDITABLE = ['missing', 'draft', 'changes_requested', 'submitted', 'reviewed'];
// Only events ending on or after this day need an approved report before new event requests.
const REPORTS_REQUIRED_FROM = /^\d{4}-\d{2}-\d{2}$/.test(process.env.POST_EVENT_REPORTS_FROM || '')
  ? process.env.POST_EVENT_REPORTS_FROM : '2026-11-19';
const EVALUATION_WINDOW_DAYS = 30;
const MAX_PHOTOS = 12;
const MAX_COUNT = 1000000;
const BLOCKED_MESSAGE = 'New event requests are unavailable until all previous completed event reports have received final approval.';
const SURVEY = [
  { id: 'satisfaction', text: 'How satisfied were you with the event?', kind: 'scale' },
  { id: 'organization', text: 'How well was the event organized?', kind: 'scale' },
  { id: 'usefulness', text: 'Did you find the event useful?', kind: 'scale' },
  { id: 'attendAgain', text: 'Would you attend similar events again?', kind: 'choice', options: ['Yes', 'Maybe', 'No'] },
  { id: 'improvements', text: 'What improvements would you suggest?', kind: 'text', maxLength: 1000 }
];

const evaluationSchema = new mongoose.Schema({
  clubId: { type: Number, required: true },
  eventKey: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  comment: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });
// One active evaluation per student per event; submitting again edits it.
evaluationSchema.index({ clubId: 1, eventKey: 1, email: 1 }, { unique: true });
const EventEvaluation = require('../database').bindModel(mongoose.models.EventEvaluation || mongoose.model('EventEvaluation', evaluationSchema));

function cairoMinuteKey(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// The event's scheduled end in Cairo time; events without an end time end at the close of their day.
function eventEndKey(event) {
  const end = String(event.scheduledEnd || '');
  if (/^\d{2}:\d{2}$/.test(end)) return `${event.date} ${end}`;
  const parsed = /T/.test(end) ? new Date(end) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return cairoMinuteKey(parsed);
  return `${event.date} 23:59`;
}

function isEventCompleted(event, closedRequestIds, now = new Date()) {
  if (!date(event.date)) return false;
  if (event.attendanceId > 0 && closedRequestIds.has(event.attendanceId)) return true;
  return eventEndKey(event) < cairoMinuteKey(now);
}

function addDays(day, days) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function evaluationClosesOn(event) { return addDays(eventEndKey(event).slice(0, 10), EVALUATION_WINDOW_DAYS); }
function reportStatus(report) { return report ? report.status : 'missing'; }
function isReportRequired(event) { return event.completed && event.date >= REPORTS_REQUIRED_FROM; }
function blockingEvents(events) { return events.filter((event) => isReportRequired(event) && reportStatus(event.report) !== 'approved'); }
function reportLink(clubId, eventKey) { return `/pages/post-event-reports.html?club=${clubId}&event=${encodeURIComponent(eventKey)}`; }

function wholeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 && number <= MAX_COUNT ? number : undefined;
}

function validateEvaluation(body) {
  const rating = body?.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Choose an overall rating from 1 to 5 stars.' };
  const answers = {};
  for (const question of SURVEY) {
    const value = body?.answers?.[question.id];
    if (question.kind === 'scale') {
      if (!Number.isInteger(value) || value < 1 || value > 5) return { error: `Answer: ${question.text}` };
      answers[question.id] = value;
    } else if (question.kind === 'choice') {
      if (!question.options.includes(value)) return { error: `Answer: ${question.text}` };
      answers[question.id] = value;
    } else {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.length > question.maxLength) return { error: `Keep your suggestions within ${question.maxLength} characters.` };
      answers[question.id] = text;
    }
  }
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
  if (comment.length > 1000) return { error: 'Keep your feedback within 1,000 characters.' };
  return { rating, answers, comment };
}

const round = (value) => Math.round(value * 100) / 100;
// Aggregates without student identities; only counts, averages and anonymous text are returned.
function summarizeEvaluations(rows) {
  const count = rows.length;
  const stars = [5, 4, 3, 2, 1];
  return {
    count,
    average: count ? round(rows.reduce((sum, row) => sum + row.rating, 0) / count) : null,
    distribution: stars.map((star) => ({ star, count: rows.filter((row) => row.rating === star).length })),
    questions: SURVEY.map((question) => {
      const answers = rows.map((row) => row.answers?.[question.id]).filter((value) => value !== undefined && value !== null && value !== '');
      if (question.kind === 'scale') {
        return { ...question, responses: answers.length, average: answers.length ? round(answers.reduce((sum, value) => sum + value, 0) / answers.length) : null,
          distribution: stars.map((star) => ({ star, count: answers.filter((value) => value === star).length })) };
      }
      if (question.kind === 'choice') return { ...question, responses: answers.length, counts: question.options.map((option) => ({ option, count: answers.filter((value) => value === option).length })) };
      return { ...question, responses: answers.length, answers: answers.slice(0, 200) };
    }),
    comments: rows.map((row) => row.comment).filter(Boolean).slice(0, 200)
  };
}

function canViewReport(account, clubId, report) {
  if (!account) return false;
  if (account.role === 'admin' || account.role === 'pr' || account.role === 'dean') return true;
  if (account.role === 'president') return Number(account.clubId) === clubId;
  if (account.role === 'supervisor') return assignedIds(account).includes(clubId);
  // English sees reports that reached its stage.
  if (account.role === 'english') return Boolean(report) && (['pending_english', 'pending_dean', 'approved'].includes(report.status)
    || (report.approvals || []).some((approval) => approval.role === 'english'));
  return false;
}

function currentStage(report) {
  const stage = String(report?.status || '').replace(/^pending_/, '');
  return STAGES.includes(stage) && report.status.startsWith('pending_') ? stage : null;
}

function canDecide(account, report) {
  const stage = currentStage(report);
  if (!stage || account?.role !== stage) return false;
  return stage !== 'supervisor' || assignedIds(account).includes(report.clubId);
}

function nextStatusAfterApproval(report) {
  const index = STAGES.indexOf(currentStage(report));
  return index >= 0 && index < STAGES.length - 1 ? `pending_${STAGES[index + 1]}` : 'approved';
}

function shapeReport(report) {
  if (!report) return null;
  const { _id, __v, summary, objectives, activities, outcomes, lessonsLearned, ...rest } = report;
  return { ...rest, statusLabel: STATUS_LABELS[report.status] || report.status };
}

function shapeEvent(event, clubId) {
  return {
    key: event.key, index: event.index, eventRequestId: event.attendanceId > 0 ? event.attendanceId : null,
    title: event.title, date: event.date, location: event.location, image: event.image,
    completed: event.completed, required: isReportRequired(event),
    status: reportStatus(event.report), statusLabel: STATUS_LABELS[reportStatus(event.report)],
    report: shapeReport(event.report), link: reportLink(clubId, event.key)
  };
}

function createPostEventReports(deps) {
  const { Club, AttendanceActivityClosure, getAccount, isAdminSessionValid, getStudentAccount, requireStudentAuth,
    sameOrigin, databaseReady, verifyPhoto, now = () => new Date() } = deps;
  const Report = deps.Report || EventReport;
  const Evaluation = deps.Evaluation || EventEvaluation;

  async function clubEvents(club) {
    const events = eventsFor(club);
    const requestIds = events.filter((event) => event.attendanceId > 0).map((event) => event.attendanceId);
    const [reports, closures] = await Promise.all([
      Report.find({ clubId: club.id }).lean(),
      requestIds.length && AttendanceActivityClosure
        ? AttendanceActivityClosure.find({ clubId: club.id, itemType: 'event', eventRequestId: { $in: requestIds } }).select('eventRequestId').lean()
        : []
    ]);
    const closed = new Set(closures.map((closure) => Number(closure.eventRequestId)));
    const current = now();
    return events.map((event) => ({ ...event, completed: isEventCompleted(event, closed, current), report: reports.find((report) => report.eventKey === event.key) || null }));
  }

  async function loadClub(clubId) {
    const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id name image events').lean();
    return club ? { club, events: await clubEvents(club) } : null;
  }

  // Club-level rule shared by the event request routes and the dashboards.
  async function blockStatus(clubId) {
    const context = await loadClub(clubId);
    const pending = context ? blockingEvents(context.events) : [];
    return {
      blocked: pending.length > 0,
      message: pending.length ? BLOCKED_MESSAGE : '',
      pendingReports: pending.map((event) => ({ eventKey: event.key, title: event.title, date: event.date,
        status: reportStatus(event.report), statusLabel: STATUS_LABELS[reportStatus(event.report)], link: reportLink(clubId, event.key) }))
    };
  }

  async function identify(req, res) {
    if (await isAdminSessionValid(req, res)) return { role: 'admin', email: 'admin' };
    const account = await getAccount(req, res);
    if (!account) return null;
    return account.role === 'software_development' ? { ...account, role: 'admin' } : account;
  }

  async function evaluationSummary(clubId, eventKey) {
    const rows = await Evaluation.find({ clubId, eventKey }).select('rating answers comment').lean();
    return summarizeEvaluations(rows);
  }

  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'Event reports are temporarily unavailable. Please retry.' });
      const account = await identify(req, res);
      if (!account) return res.status(401).json({ message: 'Sign in to access post-event reports.' });
      if (!['admin', 'president', 'head', 'supervisor', 'pr', 'english', 'dean'].includes(account.role)) return res.status(403).json({ message: 'This account cannot access post-event reports.' });
      if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the page before saving.' });
      req.reportAccount = account;
      next();
    } catch { res.status(503).json({ message: 'Could not verify report access.' }); }
  });

  router.get('/block-status', async (req, res) => {
    const account = req.reportAccount;
    if (!['president', 'head'].includes(account.role)) return res.status(403).json({ message: 'Only club accounts create event requests.' });
    try { res.json(await blockStatus(Number(account.clubId))); }
    catch { res.status(503).json({ message: 'Could not check post-event reports.' }); }
  });

  router.get('/overview', async (req, res) => {
    const account = req.reportAccount;
    try {
      if (account.role === 'head') return res.status(403).json({ message: 'Post-event reports are managed by the club president.' });
      if (account.role === 'president') {
        const context = await loadClub(Number(account.clubId));
        if (!context) return res.status(404).json({ message: 'Club not found.' });
        const completed = context.events.filter((event) => event.completed).sort((a, b) => b.date.localeCompare(a.date));
        const pending = blockingEvents(context.events);
        return res.json({ role: account.role, club: { id: context.club.id, name: context.club.name },
          block: { blocked: pending.length > 0, message: pending.length ? BLOCKED_MESSAGE : '' },
          requiredFrom: REPORTS_REQUIRED_FROM, events: completed.map((event) => shapeEvent(event, context.club.id)) });
      }
      const clubFilter = account.role === 'supervisor' ? { id: { $in: assignedIds(account) } } : {};
      const clubs = await Club.find({ archivedAt: null, ...clubFilter }).select('id name image events').lean();
      const rows = [];
      const blockedClubs = [];
      for (const club of clubs) {
        const events = await clubEvents(club);
        const pending = blockingEvents(events);
        if (pending.length) blockedClubs.push({ id: club.id, name: club.name, pending: pending.length });
        for (const event of events.filter((item) => item.completed && (item.report || isReportRequired(item)))) {
          if (!canViewReport(account, club.id, event.report)) continue;
          // Reviewers see submitted work; only the admin monitors missing reports and drafts.
          if (account.role !== 'admin' && ['missing', 'draft'].includes(reportStatus(event.report))) continue;
          rows.push({ club: { id: club.id, name: club.name }, ...shapeEvent(event, club.id), awaitingYou: Boolean(event.report && canDecide(account, event.report)) });
        }
      }
      rows.sort((a, b) => Number(b.awaitingYou) - Number(a.awaitingYou) || b.date.localeCompare(a.date));
      const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, rows.filter((row) => row.status === status).length]));
      res.json({ role: account.role, reports: rows, counts, ...(account.role === 'admin' || account.role === 'supervisor' ? { blockedClubs } : {}), requiredFrom: REPORTS_REQUIRED_FROM });
    } catch (error) {
      console.error('Post-event report overview failed:', error.name);
      res.status(503).json({ message: 'Could not load post-event reports.' });
    }
  });

  async function resolve(req, res) {
    const clubId = Number(req.params.clubId);
    if (!Number.isSafeInteger(clubId) || clubId < 1) { res.status(400).json({ message: 'Choose a valid club.' }); return null; }
    const context = await loadClub(clubId);
    const event = context?.events.find((item) => item.key === req.params.eventKey);
    if (!event) { res.status(404).json({ message: 'This approved event was not found.' }); return null; }
    if (!canViewReport(req.reportAccount, clubId, event.report)) { res.status(403).json({ message: 'You cannot view this event report.' }); return null; }
    return { clubId, club: context.club, event };
  }

  router.get('/reports/:clubId/:eventKey', async (req, res) => {
    try {
      const found = await resolve(req, res);
      if (!found) return;
      const { clubId, club, event } = found;
      res.json({
        club: { id: club.id, name: club.name },
        event: { ...shapeEvent(event, clubId), clubName: club.name, evaluationClosesOn: evaluationClosesOn(event) },
        evaluation: await evaluationSummary(clubId, event.key),
        canEdit: req.reportAccount.role === 'president' && event.completed && EDITABLE.includes(reportStatus(event.report)),
        canDecide: Boolean(event.report && canDecide(req.reportAccount, event.report)),
        stages: STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage] }))
      });
    } catch (error) {
      console.error('Post-event report lookup failed:', error.name);
      res.status(503).json({ message: 'Could not load this report.' });
    }
  });

  router.put('/reports/:clubId/:eventKey', async (req, res) => {
    const account = req.reportAccount, body = req.body || {};
    if (account.role !== 'president') return res.status(403).json({ message: 'Only the club president writes post-event reports.' });
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) return res.status(400).json({ message: 'Reload the report before saving.' });
    const submit = body.submit === true;
    const totalParticipants = wholeNumber(body.totalParticipants);
    const externalBeneficiaries = wholeNumber(body.externalBeneficiaries);
    if (totalParticipants === undefined || externalBeneficiaries === undefined) return res.status(400).json({ message: `Participant and beneficiary totals must be whole numbers from 0 to ${MAX_COUNT.toLocaleString('en-US')}.` });
    if (submit && (totalParticipants === null || externalBeneficiaries === null)) return res.status(400).json({ message: 'Enter the total participants inside MIU and the total external beneficiaries before submitting.' });
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) return res.status(400).json({ message: `Add up to ${MAX_PHOTOS} event photos.` });
    if (submit && !body.photos.length) return res.status(400).json({ message: 'Add at least one event photo before submitting.' });
    try {
      const found = await resolve(req, res);
      if (!found) return;
      const { clubId, event } = found;
      if (clubId !== Number(account.clubId)) return res.status(403).json({ message: 'You can only report on your own club’s events.' });
      if (!event.completed) return res.status(409).json({ message: 'You can submit the report after the event has finished.' });
      const current = event.report;
      if (!EDITABLE.includes(reportStatus(current))) return res.status(409).json({ message: 'This report is under review or already approved and cannot be edited.' });
      // Keep photos already stored on this report; new ones must be verified uploads.
      const kept = new Map((current?.photos || []).map((photo) => [photo.url, photo]));
      const photos = [];
      for (const photo of body.photos) {
        const existing = kept.get(photo?.url);
        const verified = existing || await verifyPhoto(photo);
        if (!verified) return res.status(400).json({ message: 'One of the photos could not be verified. Upload it again.' });
        if (!photos.some((item) => item.url === verified.url)) photos.push({ url: verified.url, publicId: verified.publicId || '' });
      }
      const at = now();
      const status = submit ? 'pending_supervisor' : 'draft';
      const values = {
        eventRequestId: event.attendanceId > 0 ? event.attendanceId : null,
        eventTitle: event.title, eventDate: event.date, eventLocation: event.location,
        totalParticipants, externalBeneficiaries, photos, status, updatedBy: account.email,
        // A new submission is reviewed again from the first stage.
        ...(submit ? { submittedAt: at, approvals: [] } : {})
      };
      const history = { action: submit ? (current?.status === 'changes_requested' ? 'resubmitted' : 'submitted') : 'draft_saved', actor: account.email, role: 'president', at, note: '' };
      let saved;
      if (!current) {
        if (body.revision !== 0) return res.status(409).json({ message: 'This report changed. Reload before saving.' });
        saved = await Report.create({ clubId, eventKey: event.key, revision: 1, history: [history], approvals: [], ...values });
      } else {
        saved = await Report.findOneAndUpdate({ clubId, eventKey: event.key, revision: body.revision, status: { $in: EDITABLE } },
          { $set: values, $inc: { revision: 1 }, $push: { history } }, { new: true, runValidators: true });
        if (!saved) return res.status(409).json({ message: 'This report changed or is under review. Reload before saving.' });
      }
      const report = typeof saved.toObject === 'function' ? saved.toObject() : saved;
      res.json({ report: shapeReport(report), message: submit ? 'Report submitted to the Club Supervisor.' : 'Draft saved.' });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'A report for this event already exists. Reload before saving.' });
      console.error('Post-event report save failed:', error.name);
      res.status(503).json({ message: 'The report could not be saved. Reload to check its status before retrying.' });
    }
  });

  router.post('/reports/:clubId/:eventKey/decision', async (req, res) => {
    const account = req.reportAccount, body = req.body || {};
    if (!['approve', 'request_changes'].includes(body.action)) return res.status(400).json({ message: 'Choose Approve or Request changes.' });
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (comment.length > 2000) return res.status(400).json({ message: 'Keep the comment within 2,000 characters.' });
    if (body.action === 'request_changes' && !comment) return res.status(400).json({ message: 'Add a comment explaining the changes you need.' });
    if (!Number.isSafeInteger(body.revision)) return res.status(400).json({ message: 'Reload the report before deciding.' });
    try {
      const found = await resolve(req, res);
      if (!found) return;
      const { clubId, event } = found;
      const report = event.report;
      if (!report || !currentStage(report)) return res.status(409).json({ message: 'This report is not waiting for a review decision.' });
      if (!canDecide(account, report)) {
        return res.status(STAGES.includes(account.role) ? 409 : 403).json({ message: `This report is waiting for ${STAGE_LABELS[currentStage(report)]}. Reviews happen in order: Club Supervisor, PR, English, then Dean.` });
      }
      const at = now();
      const stage = currentStage(report);
      const status = body.action === 'approve' ? nextStatusAfterApproval(report) : 'changes_requested';
      const update = { $set: { status, ...(status === 'approved' ? { fullyApprovedAt: at } : {}) }, $inc: { revision: 1 },
        $push: { history: { action: body.action === 'approve' ? 'approved' : 'changes_requested', actor: account.email, role: stage, at, note: comment } } };
      if (body.action === 'approve') update.$push.approvals = { role: stage, email: account.email, at, comment };
      const saved = await Report.findOneAndUpdate({ clubId, eventKey: event.key, revision: body.revision, status: report.status }, update, { new: true, runValidators: true });
      if (!saved) return res.status(409).json({ message: 'This report changed. Reload before deciding.' });
      const result = typeof saved.toObject === 'function' ? saved.toObject() : saved;
      res.json({ report: shapeReport(result), message: status === 'approved' ? 'Report fully approved.'
        : status === 'changes_requested' ? 'Changes requested. The report was returned to the club president.'
          : `Approved and sent to ${STAGE_LABELS[currentStage(result)]}.` });
    } catch (error) {
      console.error('Post-event report decision failed:', error.name);
      res.status(503).json({ message: 'The decision could not be saved. Reload and try again.' });
    }
  });

  // Public completed-event view: photos after final approval, and the student's own evaluation.
  async function publicEvent(req, res) {
    const clubId = Number(req.params.clubId), index = Number(req.params.eventIndex);
    if (!Number.isSafeInteger(clubId) || clubId < 1 || !Number.isSafeInteger(index) || index < 0) { res.status(400).json({ message: 'Choose a valid event.' }); return null; }
    const context = await loadClub(clubId);
    const event = context?.events.find((item) => item.index === index);
    if (!event) { res.status(404).json({ message: 'This event was not found.' }); return null; }
    return { clubId, event };
  }

  function registerPublicRoutes(app) {
    app.get('/api/event-feedback/:clubId/:eventIndex', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (!databaseReady()) return res.status(503).json({ message: 'Event feedback is temporarily unavailable.' });
        const found = await publicEvent(req, res);
        if (!found) return;
        const { clubId, event } = found;
        const closesOn = evaluationClosesOn(event);
        const open = event.completed && cairoMinuteKey(now()).slice(0, 10) <= closesOn;
        const student = event.completed ? await getStudentAccount(req, res).catch(() => null) : null;
        const mine = student ? await Evaluation.findOne({ clubId, eventKey: event.key, email: student.email.toLowerCase() }).select('rating answers comment updatedAt').lean() : null;
        const approved = event.completed && event.report?.status === 'approved';
        // Public report summary: only after the Dean's approval, and only totals (no student identities).
        const summary = approved ? summarizeEvaluations(await Evaluation.find({ clubId, eventKey: event.key }).select('rating answers comment').lean()) : null;
        res.json({
          completed: event.completed,
          reportStatus: event.completed ? (approved ? 'approved' : event.report ? 'in_review' : 'missing') : 'not_completed',
          report: approved ? {
            totalParticipants: event.report.totalParticipants ?? null,
            externalBeneficiaries: event.report.externalBeneficiaries ?? null,
            approvedAt: event.report.fullyApprovedAt || null,
            rating: { average: summary.average, count: summary.count }
          } : null,
          photos: approved ? (event.report.photos || []).map((photo) => ({ url: photo.url })) : [],
          evaluation: { open, closesOn, survey: SURVEY, signedIn: Boolean(student),
            mine: mine ? { rating: mine.rating, answers: mine.answers || {}, comment: mine.comment || '', updatedAt: mine.updatedAt } : null }
        });
      } catch (error) {
        console.error('Event feedback lookup failed:', error.name);
        res.status(503).json({ message: 'Event feedback is temporarily unavailable.' });
      }
    });

    app.put('/api/event-feedback/:clubId/:eventIndex', requireStudentAuth, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload the page before submitting.' });
      const parsed = validateEvaluation(req.body);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      try {
        if (!databaseReady()) return res.status(503).json({ message: 'Event feedback is temporarily unavailable.' });
        const found = await publicEvent(req, res);
        if (!found) return;
        const { clubId, event } = found;
        if (!event.completed) return res.status(409).json({ message: 'You can evaluate this event after it ends.' });
        if (cairoMinuteKey(now()).slice(0, 10) > evaluationClosesOn(event)) return res.status(409).json({ message: 'The evaluation for this event has closed.' });
        const key = { clubId, eventKey: event.key, email: req.studentAccount.email.toLowerCase() };
        const values = { rating: parsed.rating, answers: parsed.answers, comment: parsed.comment };
        try {
          await Evaluation.updateOne(key, { $set: values }, { upsert: true, runValidators: true });
        } catch (error) {
          // A concurrent first submission created the row; update it instead of adding a second one.
          if (error.code !== 11000) throw error;
          await Evaluation.updateOne(key, { $set: values }, { runValidators: true });
        }
        res.json({ message: 'Thank you. Your evaluation was saved; you can edit it until the survey closes.' });
      } catch (error) {
        console.error('Event evaluation save failed:', error.name);
        res.status(503).json({ message: 'Your evaluation could not be saved. Please try again.' });
      }
    });
  }

  return { router, registerPublicRoutes, blockStatus };
}

function registerPostEventReports(app, deps) {
  const service = createPostEventReports(deps);
  app.use('/api/post-event-reports', service.router);
  service.registerPublicRoutes(app);
  return service;
}

module.exports = {
  registerPostEventReports, createPostEventReports, EventEvaluation, SURVEY, STAGES, STATUS_LABELS, BLOCKED_MESSAGE,
  REPORTS_REQUIRED_FROM, eventEndKey, isEventCompleted, blockingEvents, summarizeEvaluations, validateEvaluation,
  canViewReport, canDecide, nextStatusAfterApproval, cairoMinuteKey
};
