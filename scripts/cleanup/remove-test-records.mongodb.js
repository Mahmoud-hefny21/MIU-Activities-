// MongoDB version of remove-test-records.sql, for a deployment whose data lives in MongoDB.
// REVIEW BEFORE RUNNING. Dry run by default:   mongosh "<MONGO_URI>" scripts/cleanup/remove-test-records.mongodb.js
// To delete for real:                          mongosh "<MONGO_URI>" --eval "var APPLY=true, CONFIRM_DB='<db>'" scripts/cleanup/remove-test-records.mongodb.js
// Every match uses the exact id AND title/description, so a real record that reuses an id is untouched.
const apply = typeof APPLY !== 'undefined' && APPLY === true;
// Explicit target confirmation for a real run: --eval "var APPLY=true, CONFIRM_DB='<database name>'"
if (apply && (typeof CONFIRM_DB === 'undefined' || CONFIRM_DB !== db.getName())) throw new Error(`Set CONFIRM_DB='${db.getName()}' to confirm the target database. Nothing was changed.`);
const suffix = 'eb3a3dbced965dbd';
const targets = db.universitycontents.find({ $or: [
  { id: 534314197, title: 'QR concurrency test', description: 'Synthetic SQL attendance ' + suffix },
  { id: 2, title: 'Test', description: 'Tsst' },
  { id: 1, title: 'intel course', description: 'intel course in OOA' }
] }, { id: 1, _id: 1, title: 1 }).toArray();
const ids = targets.map(t => t.id), keys = targets.map(t => String(t._id));
const synthetic = db.clubs.findOne({ name: 'SQL QR test ' + suffix }, { id: 1 });
const plan = [
  ['eventregistrations', { clubId: 0, eventRequestId: { $in: ids } }],
  ['attendancerecords', { clubId: 0, eventRequestId: { $in: ids } }],
  ['attendancesessions', { clubId: 0, eventRequestId: { $in: ids } }],
  ['studentfeedbacks', { targetKey: { $in: keys } }],
  ['universitycontents', { _id: { $in: targets.map(t => t._id) } }],
  ...(synthetic ? ['studentinterests', 'attendancerecords', 'eventregistrations', 'attendancesessions'].map(name => [name, { clubId: synthetic.id }]) : []),
  ...(synthetic ? [['clubs', { id: synthetic.id, name: 'SQL QR test ' + suffix }]] : []),
  ['attendancedevicebindings', { deviceHash: { $in: ['sql-browser-' + suffix, 'sql-browser-' + suffix + '-miu'] } }],
  ['studentaccounts', { email: { $in: ['qr-a-' + suffix + '@example.test', 'qr-b-' + suffix + '@example.test'] } }]
];
print(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', universityContent: targets }));
for (const [name, filter] of plan) {
  const count = db.getCollection(name).countDocuments(filter);
  print(`${apply ? 'deleting' : 'would delete'} ${count} from ${name}`);
  if (apply && count) db.getCollection(name).deleteMany(filter);
}
