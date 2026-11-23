// UniversityContent is the existing organization source. Its registration scope
// is clubId=0; there is no separate organization table or student Club record.
const organization = Object.freeze({ id: 0, type: 'university', name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' });
const publicFields = 'id type title description interaction question options date time location image registrationEnabled attendanceEnabled attendanceAudience publisherType publisherKey createdAt updatedAt';
const { facultyByKey, MIU_LOGO } = require('./faculties');
// Records without a publisher (all content made before faculties existed) belong to MIU.
function publisherFor(record) {
  const faculty = record?.publisherType === 'faculty' ? facultyByKey(record.publisherKey) : null;
  return faculty ? { id: 0, type: 'faculty', key: faculty.key, name: faculty.name, image: faculty.image || MIU_LOGO } : organization;
}
function toPublicUniversityContent(record) {
  const result = Object.fromEntries(publicFields.split(' ').filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
  result.interaction = record.interaction || 'none'; result.question = record.question || ''; result.options = record.options || [];
  result.registrationEnabled = record.type === 'event' && record.registrationEnabled === true;
  // registrationEnabled is the event's setting; registrationOpen is whether the server accepts registrations now
  // (it closes once the event has started or its date has passed).
  result.registrationOpen = result.registrationEnabled && !require('./student-event-registration').eventRules(record);
  // Attendance can be taken without registration (any student in the audience checks in), so it is shown as stored.
  result.attendanceEnabled = result.registrationEnabled ? (typeof record.attendanceEnabled === 'boolean' ? record.attendanceEnabled : null) : record.type === 'event' && record.attendanceEnabled === true;
  // When the event ends (HH:MM, empty when not set), so lists can drop it once it is over.
  if (record.type === 'event') result.endTime = (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(record?.attendanceSettings?.endTime || '')) ? record.attendanceSettings.endTime : '');
  result.attendanceAudience = record.type === 'event' ? (record.attendanceAudience === 'members' ? 'members' : 'all_students') : undefined;
  result.organization = publisherFor(record);
  result.publisherType = result.organization.type === 'faculty' ? 'faculty' : 'miu';
  result.publisherKey = result.organization.key || '';
  return result;
}
function registerPublicUniversityContentDetail(app, { UniversityContent, ensureReady, requireLiveDatabase }) {
  app.get('/api/university-content/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid university event.' });
    try {
      await ensureReady();
      if (!requireLiveDatabase(res)) return;
      const record = await UniversityContent.findOne({ id, type: 'event' }).select(publicFields).read('primary').readConcern('majority').lean();
      res.setHeader('Cache-Control', 'no-store');
      if (!record) return res.status(404).json({ message: 'This university event is no longer available.' });
      res.json(toPublicUniversityContent(record));
    } catch (error) {
      console.error('University event detail read failed:', error.name);
      res.status(503).json({ message: 'University event details are temporarily unavailable.' });
    }
  });
}
module.exports = { organization, publisherFor, publicFields, toPublicUniversityContent, registerPublicUniversityContentDetail };
