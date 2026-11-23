const crypto = require('node:crypto');
const { organization, publisherFor } = require('./university-content');
const { facultyByKey } = require('./faculties');
const editableKeys = 'interaction question options type title description date time registrationEnabled attendanceEnabled attendanceAudience location image imagePublicId publisherType publisherKey'.split(' ');
const fail = (status, message) => Object.assign(new Error(message), { status });
const signature = item => JSON.stringify(editableKeys.map(key => item[key] ?? (key === 'options' ? [] : key.endsWith('Enabled') ? false : '')));
function createUniversityPublisher(deps) {
  const { UniversityContent, cleanText, parseInteraction, readCloudinaryAsset, cloudinaryFolders } = deps;
  const read = id => UniversityContent.findById(id).read('primary').readConcern('majority').lean();
  async function fields(body, previous) {
    const type = ['event', 'announcement'].includes(body.type) ? body.type : '';
    const title = cleanText(body.title, 140), description = cleanText(body.description, 2000);
    if (!type || !title || !description) throw fail(400, 'Enter a title and details.');
    if (type === 'event' && !['members', 'all_students'].includes(body.attendanceAudience)) throw fail(400, 'Choose who can register and check in for this MIU event.');
    const date = type === 'event' ? cleanText(body.date, 40) : '', time = type === 'event' ? cleanText(body.time, 40) : '';
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw fail(400, 'Choose a valid event date.');
    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail(400, 'Choose a valid event time.');
    let interaction;
    try { interaction = parseInteraction(body); } catch (error) { throw fail(400, error.message); }
    let image = previous?.image || organization.image, imagePublicId = previous?.imagePublicId || '';
    if (body.imageChoice === 'logo') { image = organization.image; imagePublicId = ''; }
    if (body.imageChoice === 'custom') {
      const uploaded = await readCloudinaryAsset(body.imageUrl, body.imagePublicId, cloudinaryFolders.university);
      if (!uploaded) throw fail(400, 'Choose a valid PNG, JPG, or WebP image up to 10 MB.');
      image = uploaded.url; imagePublicId = uploaded.publicId;
    }
    let publisherType = 'miu', publisherKey = '';
    if (previous) { publisherType = previous.publisherType === 'faculty' ? 'faculty' : 'miu'; publisherKey = publisherType === 'faculty' ? previous.publisherKey || '' : ''; }
    else if (body.publishedAs && body.publishedAs !== 'miu') {
      if (!facultyByKey(body.publishedAs)) throw fail(400, 'Choose MIU or a listed faculty in Published As.');
      publisherType = 'faculty'; publisherKey = body.publishedAs;
    }
    return { ...interaction, type, title, description, date, time, location: cleanText(body.location, 160), image, imagePublicId, publisherType, publisherKey,
      registrationEnabled: type === 'event' && body.registrationEnabled === true,
      // Attendance does not need registration: without it, any student in the audience can check in.
      attendanceEnabled: type === 'event' && body.attendanceEnabled === true,
      attendanceAudience: type === 'event' ? body.attendanceAudience : undefined };
  }
  async function notify(record) {
    // Publication has already been confirmed. A notification outage must not turn
    // a successful write into a retry that creates another event or removes media.
    try { await deps.dispatchPublishedContentNotifications({ source: 'university', contentId: record.id,
      revision: new Date(record.createdAt).getTime() || record.id, type: record.type, title: record.title }); }
    catch (error) { console.error('University publication notification failed:', error.name); }
  }
  async function create(body, actorEmail, requestKey) {
    if (requestKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw fail(400, 'Reload the publishing form and try again.');
    const value = await fields(body);
    const identity = requestKey ? crypto.createHash('sha256').update(`university:${actorEmail}:${requestKey}`).digest('hex').slice(0, 24) : undefined;
    async function replay() {
      const existing = identity ? await read(identity) : null;
      if (existing && signature(existing) !== signature(value)) throw fail(409, 'This publishing request was already used. Start a new update.');
      if (existing) { await notify(existing); return { record: existing, created: false }; }
      return null;
    }
    const existing = await replay(); if (existing) return existing;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Never recycle deleted sequential IDs: registrations, attendance and links
      // continue to refer to their original event.
      const record = new UniversityContent({ ...value, ...(identity ? { _id: identity } : {}),
        id: Date.now() * 1000 + crypto.randomInt(1000), publishedBy: actorEmail });
      try {
        await record.save({ w: 'majority' });
        const persisted = await read(record._id);
        if (!persisted) throw new Error('University publication was not confirmed.');
        await notify(persisted);
        return { record: persisted, created: true };
      } catch (error) {
        // Resolve a retry or ambiguous save using the same document identity.
        const saved = await read(record._id).catch(() => null);
        if (saved) {
          if (signature(saved) !== signature(value)) throw fail(409, 'This publishing request was already used. Start a new update.');
          await notify(saved); return { record: saved, created: false };
        }
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }
  }
  async function update(id, body) {
    const previous = await UniversityContent.findOne({ id }).read('primary').readConcern('majority').lean();
    if (!previous) throw fail(404, 'University post not found.');
    const stamp = value => value ? new Date(value).getTime() : null;
    if (!Object.hasOwn(body, 'updatedAt') || stamp(body.updatedAt) !== stamp(previous.updatedAt || previous.createdAt)) throw fail(409, 'This update has changed. Refresh the list before editing again.');
    if (body.type !== previous.type) throw fail(400, 'Keep the existing post type to preserve event registrations and links.');
    const value = await fields(body, previous);
    const saved = await UniversityContent.findOneAndUpdate({ id, updatedAt: previous.updatedAt || null }, { $set: value },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }).read('primary').lean();
    if (!saved) throw fail(409, 'This update has changed. Refresh the list before editing again.');
    return saved;
  }
  return { create, update };
}
// canWrite decides who may create, edit or delete. Only the MIU Events role publishes official content;
// other viewers (such as the general admin) can read the list but not change it.
function registerUniversityContentAdmin(app, deps, basePath, { canWrite = () => false } = {}) {
  const { UniversityContent, databaseReady, sameOrigin, toApiRecord } = deps;
  const publisher = deps.publisher || createUniversityPublisher(deps);
  // Keep the timestamps: the dashboard sends updatedAt back so edits can detect a newer change.
  const output = record => ({ ...toApiRecord(record), createdAt: record.createdAt, updatedAt: record.updatedAt, organization: publisherFor(record) });
  const denyWrite = (req, res) => { if (canWrite(req)) return false; res.status(403).json({ message: 'Only MIU Events accounts can publish, edit or remove official MIU content.' }); return true; };
  app.get(basePath, async (req, res) => {
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
      const records = await UniversityContent.find().read('primary').readConcern('majority').sort({ createdAt: -1, id: -1 }).lean();
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Can-Publish', canWrite(req) ? '1' : '0'); res.json(records.map(output));
    } catch (error) { console.error('University content list failed:', error.name); res.status(503).json({ message: 'Could not load MIU updates right now.' }); }
  });
  for (const method of ['post', 'put']) app[method](method === 'post' ? basePath : `${basePath}/:id`, async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (denyWrite(req, res)) return;
    if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
    const id = Number(req.params.id);
    if (method === 'put' && (!Number.isSafeInteger(id) || id < 1)) return res.status(400).json({ message: 'Choose a valid MIU post.' });
    try {
      const result = method === 'post' ? await publisher.create(req.body, deps.actorEmail?.(req) || req.clubAccount?.email || 'MIU Events', req.get('Idempotency-Key'))
        : { record: await publisher.update(id, req.body), created: false };
      res.setHeader('Cache-Control', 'no-store'); res.status(result.created ? 201 : 200).json(output(result.record));
    } catch (error) {
      console.error('University content write failed:', error.name);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'Could not confirm this update. Please retry the same request.' });
    }
  });
  app.delete(`${basePath}/:id`, async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (denyWrite(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid MIU post.' });
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
      const record = await UniversityContent.findOne({ id }).read('primary').readConcern('majority').lean();
      if (!record) return res.status(404).json({ message: 'University post not found.' });
      const deleted = await UniversityContent.deleteOne({ id, updatedAt: record.updatedAt }, { writeConcern: { w: 'majority' } });
      if (deleted.deletedCount !== 1 || await UniversityContent.exists({ id }).read('primary').readConcern('majority')) throw new Error('Deletion was not confirmed.');
      if (record.imagePublicId && deps.cloudinaryConfigured) deps.cloudinary.uploader.destroy(record.imagePublicId, { resource_type: 'image' }).catch(() => {});
      res.setHeader('Cache-Control', 'no-store'); res.status(204).end();
    } catch (error) { console.error('University content delete failed:', error.name); res.status(503).json({ message: 'Could not confirm removal of this MIU post.' }); }
  });
  return publisher;
}
module.exports = { createUniversityPublisher, registerUniversityContentAdmin };
