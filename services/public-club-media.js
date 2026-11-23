// Replace embedded media in public listing responses inside MongoDB, before
// large base64 values cross the database connection. Stored data is unchanged.
const collections = new Set(['events', 'posts', 'sponsors', 'booths']);
const fields = new Set(['image', 'sponsorLogo']);
const publicFields = 'id sortOrder name committee category tagline image imagePublicId imageFit status applicationCycleStartedAt pinned seats members committeeAvailability description requirements applicationIntro applicationFields events posts sponsors booths memberRoster.email profile';
const publicContentFields = 'requestId contentType title date time location description image createdAt publishedAt registrationEnabled attendanceEnabled attendanceAudience author text type category kind sponsorName sponsorCompany sponsorDescription sponsorLogo boothName boothDescription boothLocation boothOpenDate boothCloseDate interaction question options'.split(' ');
function sanitizePublicClub(record) {
  const { memberRoster, archivedAt, interviewForms, questionHistory, officers, profile, ...result } = record;
  // Clubs have no application seat limit; older records still hold seed seat numbers, which
  // contradicted "Unlimited" on the club page and the club's status. null = unlimited.
  result.seats = null;
  // Only the club's public social links leave the internal profile (from the clubs Excel import).
  result.socialLinks = (Array.isArray(profile?.socialLinks) ? profile.socialLinks : [])
    .filter(link => typeof link === 'string' && /^https:\/\/[^\s<>"']{3,300}$/i.test(link)).slice(0, 6);
  for (const collection of collections) if (Array.isArray(result[collection])) result[collection] = result[collection].map(item => {
    if (!item || typeof item !== 'object') return item;
    const publicItem = Object.fromEntries(publicContentFields.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
    // Whether the server accepts registrations right now (closed once the event has started or passed).
    if (collection === 'events') publicItem.registrationOpen = item.registrationEnabled !== false && !require('./student-event-registration').eventRules(item);
    // When the event ends (HH:MM, empty when not set), so lists can drop it once it is over.
    if (collection === 'events') publicItem.endTime = (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item?.attendanceSettings?.endTime || '')) ? item.attendanceSettings.endTime : '');
    return publicItem;
  });
  return result;
}

function publicClubProjection() {
  const projection = Object.fromEntries(publicFields.split(' ').map((field) => [field, 1]));
  for (const collection of collections) {
    const replacements = {};
    for (const field of fields) {
      const value = `$$item.${field}`;
      replacements[field] = { $cond: [
        { $regexMatch: { input: { $convert: { input: value, to: 'string', onError: '', onNull: '' } }, regex: '^data:[\\w.+/-]+;base64,' } },
        { $concat: ['/api/public-club-media/', { $toString: '$id' }, `/${collection}/`,
          { $toString: '$$mediaIndex' }, `/${field}?v=`,
          { $toString: { $ifNull: [{ $toLong: '$updatedAt' }, 0] } }] },
        value
      ] };
    }
    projection[collection] = { $cond: [{ $isArray: `$${collection}` }, { $map: {
      input: { $range: [0, { $size: { $ifNull: [`$${collection}`, []] } }] }, as: 'mediaIndex',
      in: { $let: { vars: { item: { $arrayElemAt: [`$${collection}`, '$$mediaIndex'] } },
        in: { $cond: [{ $eq: [{ $type: '$$item' }, 'object'] },
          // attendanceSettings is read only to work out endTime; sanitizePublicClub never sends it.
          { ...Object.fromEntries(publicContentFields.map(key => [key, `$$item.${key}`])), attendanceSettings: '$$item.attendanceSettings', ...replacements }, '$$item'] } } }
    } }, `$${collection}`] };
  }
  return projection;
}

function registerPublicClubMedia(app, { Club, requireLiveDatabase, readMedia, ensureDatabaseReady }) {
  app.get('/api/public-club-media/:clubId/:collection/:index/:field', async (req, res) => {
    const { collection, field } = req.params;
    const clubId = Number(req.params.clubId);
    const index = Number(req.params.index);
    const version = Number(req.query.v);
    if (!collections.has(collection) || !fields.has(field)
      || !Number.isSafeInteger(clubId) || clubId < 1 || !Number.isSafeInteger(index) || index < 0
      || !/^\d+$/.test(String(req.query.v)) || !Number.isSafeInteger(version) || version < 0
      || !Number.isFinite(new Date(version).getTime())) return res.status(400).end();
    try {
      if (ensureDatabaseReady) await ensureDatabaseReady();
      if (!requireLiveDatabase(res)) return;
      const record = readMedia ? { value: await readMedia({ clubId, collection, index, field, version }) } : (await Club.aggregate([
        { $match: { id: clubId, archivedAt: null,
          ...(version ? { updatedAt: new Date(version) } : { updatedAt: null }) } },
        { $project: { _id: 0, value: { $let: {
          vars: { item: { $arrayElemAt: [`$${collection}`, index] } }, in: `$$item.${field}`
        } } } }
      ]).read('primary').readConcern('majority'))[0];
      const match = typeof record?.value === 'string'
        && /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(record.value);
      if (!match) return res.status(404).end();
      const bytes = Buffer.from(match[2], 'base64');
      const image = /^image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml)$/i.test(match[1]);
      const extensions = {
        'application/pdf': 'pdf', 'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
      };
      const extension = extensions[match[1].toLowerCase()];
      res.setHeader('Content-Type', image || extension ? match[1] : 'application/octet-stream');
      res.setHeader('Content-Disposition', image ? 'inline' : `attachment; filename="attachment.${extension || 'bin'}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.removeHeader('Pragma');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(bytes);
    } catch (error) {
      console.error('Public club media read failed:', error.name);
      return res.status(503).end();
    }
  });
}

module.exports = { publicClubProjection, registerPublicClubMedia, publicFields, sanitizePublicClub };
