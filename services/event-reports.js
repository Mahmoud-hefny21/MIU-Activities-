const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { assignedIds } = require('./supervisor-dashboard');
const fields = ['summary', 'objectives', 'activities', 'outcomes', 'lessonsLearned'];
// 'submitted' and 'reviewed' belong to the earlier narrative reports. Post-event reports move
// draft -> pending_supervisor -> pending_pr -> pending_english -> pending_dean -> approved.
const REPORT_STATUSES = ['draft', 'submitted', 'changes_requested', 'reviewed',
  'pending_supervisor', 'pending_pr', 'pending_english', 'pending_dean', 'approved'];
const schema = new mongoose.Schema({
  clubId: { type: Number, required: true }, eventKey: { type: String, required: true },
  summary: String, objectives: String, activities: String, outcomes: String, lessonsLearned: String,
  status: { type: String, enum: REPORT_STATUSES, required: true },
  revision: { type: Number, required: true }, submittedAt: Date, updatedBy: String,
  history: [{ action: String, actor: String, role: String, at: Date, note: String }],
  // Post-event report: event details are copied from the approved event and stay read-only.
  eventRequestId: { type: Number, default: null },
  eventTitle: String, eventDate: String, eventLocation: String,
  totalParticipants: { type: Number, min: 0, default: null },
  externalBeneficiaries: { type: Number, min: 0, default: null },
  photos: { type: [mongoose.Schema.Types.Mixed], default: [] },
  approvals: { type: [mongoose.Schema.Types.Mixed], default: [] },
  fullyApprovedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ clubId: 1, eventKey: 1 }, { unique: true });
const EventReport = require('../database').bindModel(mongoose.models.EventReport || mongoose.model('EventReport', schema));
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function period(start, end) { return date(start) && date(end) && start <= end; }
function eventsFor(club) {
  return (club.events || []).map((event, index) => {
    const requestId = Number(event.requestId);
    const legacy = crypto.createHash('sha256').update(JSON.stringify([index, event.title, event.date])).digest('hex');
    return { key: Number.isSafeInteger(requestId) && requestId > 0 ? `request:${requestId}` : `legacy:${legacy}`,
      attendanceId: Number.isSafeInteger(requestId) && requestId > 0 ? requestId : -(index + 1),
      index, title: String(event.title || ''), date: String(event.date || ''),
      startTime: String(event.startTime || event.time || ''), endTime: String(event.endTime || ''),
      location: String(event.location || ''), description: String(event.description || ''),
      scheduledEnd: String(event.attendanceSettings?.endTime || ''), image: String(event.image || ''),
      registrationEnabled: event.registrationEnabled, attendanceEnabled: event.attendanceEnabled };
  });
}
function statistics(event, registrations, attendance) {
  // Do not attach old index registrations to a replacement event with a different title.
  const registered = registrations.filter(r => r.eventIndex === event.index && r.eventTitle === event.title);
  const checked = attendance.filter(r => r.eventRequestId === event.attendanceId && (r.itemType || 'event') === 'event'
    && (event.attendanceId > 0 || (r.eventTitle === event.title && r.eventDate === event.date)));
  return {
    registered: registered.length || event.registrationEnabled === true ? registered.length : null,
    verified: checked.length || event.attendanceEnabled === true ? checked.length : null,
    registrationSource: 'EventRegistration (matching index and title)', attendanceSource: 'AttendanceRecord (verified check-ins)'
  };
}
function registerEventReports(app, deps) {
  const { Club, EventRegistration, AttendanceRecord, getAccount, databaseReady, sameOrigin } = deps;
  const Report = deps.Report || EventReport;
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'Reporting database is unavailable. Please retry.' });
      const account = await getAccount(req, res);
      if (!account) return res.status(401).json({ message: 'Sign in to access event reports.' });
      if (!['president', 'supervisor'].includes(account.role)) return res.status(403).json({ message: 'Club president or assigned supervisor access required.' });
      req.reportAccount = account;
      if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the page before saving.' });
      next();
    } catch { res.status(503).json({ message: 'Could not verify reporting access.' }); }
  });
  router.get('/clubs', async (req, res) => {
    try {
      const a = req.reportAccount;
      const clubs = await Club.find({ id: { $in: a.role === 'president' ? [a.clubId] : assignedIds(a) }, archivedAt: null }).select('id name').lean();
      res.json({ clubs, role: a.role });
    } catch { res.status(503).json({ message: 'Could not load clubs.' }); }
  });
  router.use('/clubs/:clubId', (req, res, next) => {
    const a = req.reportAccount, id = Number(req.params.clubId);
    if (!/^\d+$/.test(req.params.clubId) || !(a.role === 'president' ? id === a.clubId : assignedIds(a).includes(id))) return res.status(403).json({ message: 'You do not have reporting access to this club.' });
    req.reportClubId = id; next();
  });
  router.get('/clubs/:clubId', async (req, res) => {
    const { start, end } = req.query;
    if (!period(start, end)) return res.status(400).json({ message: 'Supply valid start and end dates (YYYY-MM-DD), in order.' });
    try {
      const clubId = req.reportClubId;
      const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id name events').lean();
      if (!club) return res.status(404).json({ message: 'Club not found.' });
      const [reports, registrations, attendance] = await Promise.all([
        Report.find({ clubId }).lean(), EventRegistration.find({ clubId }).select('eventIndex eventTitle').lean(),
        AttendanceRecord.find({ clubId, itemType: 'event' }).select('eventRequestId itemType eventTitle eventDate').lean()
      ]);
      const all = eventsFor(club);
      const events = all.filter(e => date(e.date) && e.date >= start && e.date <= end).map(e => ({
        ...e, statistics: statistics(e, registrations, attendance), report: reports.find(r => r.eventKey === e.key) || null
      }));
      res.json({ club: { id: club.id, name: club.name }, start, end, events,
        undatedEvents: all.filter(e => !date(e.date)).length,
        overview: { events: events.length, reported: events.filter(e => e.report && e.report.status !== 'draft').length,
          registered: events.reduce((n, e) => n + (e.statistics.registered || 0), 0),
          verified: events.reduce((n, e) => n + (e.statistics.verified || 0), 0),
          missingRegistration: events.filter(e => e.statistics.registered === null).length,
          missingAttendance: events.filter(e => e.statistics.verified === null).length } });
    } catch { res.status(503).json({ message: 'Could not load reports and statistics. No totals are available.' }); }
  });
  // Narrative reports were replaced by post-event reports (/api/post-event-reports).
  router.put('/clubs/:clubId/events/:eventKey', (req, res) => {
    res.status(410).json({ message: 'Event reports are now written under Post-event reports in your dashboard.' });
  });
  app.use('/api/event-reports', router);
}
module.exports = { registerEventReports, EventReport, REPORT_STATUSES, date, period, eventsFor, statistics, fields };
