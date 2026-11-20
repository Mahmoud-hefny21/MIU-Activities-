// Two-way sync between MongoDB (used by the live site on Vercel) and SQL Server (the main database).
//   node scripts/sync-databases.cjs            -> preview only, changes nothing
//   node scripts/sync-databases.cjs --apply    -> copies the differences
// Rules: a record missing on one side is copied there; a record on both sides that differs is updated
// on the side with the older "updatedAt" (records without updatedAt are reported, never overwritten);
// nothing is ever deleted on either side.
require('dotenv').config();
process.env.DATABASE_PROVIDER = process.env.DATABASE_PROVIDER === 'azuresql' ? 'azuresql' : 'sqlserver';
// Large tables (clubs with images) need more time than a normal page request.
for (const prefix of ['SQLSERVER', 'AZURE_SQL']) process.env[`${prefix}_REQUEST_TIMEOUT_MS`] = '120000';
// Short-lived security records stay where they were created (sign-in attempts, one-time codes, live presence, admin login state).
const SKIP = new Set(['loginattempts', 'passwordrecoveryratelimits', 'passwordresettokens', 'studentemailcodes', 'sitevisitorpresences', 'adminauthstates']);
const { MongoClient } = require('mongoose').mongo;
const { catalog } = require('../database/catalog');
const { rows, write } = require('../database/models');
const runtime = require('../database/runtime');
const { canonical } = require('./sqlserver-migrate.cjs');

const apply = process.argv.includes('--apply');
let backupDir = '';
if (apply) {
  backupDir = require('node:path').join(process.env.SYNC_BACKUP_DIR || 'D:/MIU-backups', 'db-sync-' + new Date().toISOString().replace(/[:.]/g, '-'));
  require('node:fs').mkdirSync(backupDir, { recursive: true });
  console.log('Backup of both databases:', backupDir);
}
const only = (process.argv.find(arg => arg.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const stamp = doc => { const t = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : NaN; return Number.isFinite(t) ? t : null; };

// Unique keys from the schema (e.g. email). The same record can have a different _id on each side
// (it was created separately on each server), so records are matched by _id, then by a unique key,
// then (for logs without any unique key) by identical content. This prevents duplicates.
function uniqueKeys(spec) {
  const schema = spec.model.schema, keys = [];
  for (const [fields, options] of schema.indexes()) if (options?.unique && !options.partialFilterExpression) keys.push(Object.keys(fields));
  schema.eachPath((path, type) => { if (type.options?.unique && path !== '_id') keys.push([path]); });
  return keys;
}
const valueAt = (doc, path) => path.split('.').reduce((v, k) => v?.[k], doc);
function keysOf(doc, keys) {
  const out = [];
  for (const fields of keys) { const vals = fields.map(f => valueAt(doc, f)); if (vals.every(v => v !== undefined && v !== null && v !== '')) out.push(fields.join('+') + '=' + vals.map(v => String(v).toLowerCase()).join('|')); }
  if (!keys.length) { const { _id, __v, ...rest } = doc; out.push('content=' + canonical(rest)); }
  return out;
}

async function syncCollection(spec, db) {
  const name = spec.model.collection.collectionName;
  const mongo = db.collection(name);
  const plain = doc => spec.model.hydrate(doc).toObject({ depopulate: true, flattenMaps: true });
  const keys = uniqueKeys(spec);
  const mongoDocs = (await mongo.find({}).toArray());
  const sqlRows = (await rows(spec, {}));
  if (apply && backupDir) {
    // Full copy of both sides of this collection before anything changes.
    const { EJSON } = require('mongoose').mongo.BSON;
    require('node:fs').writeFileSync(require('node:path').join(backupDir, name + '.json'), EJSON.stringify({ mongo: mongoDocs, sql: sqlRows.map(r => r.data) }, { relaxed: false }));
  }
  const sqlById = new Map(sqlRows.map(row => [String(row.data._id), row])), sqlByKey = new Map();
  for (const row of sqlRows) for (const key of keysOf(plain(row.data), keys)) sqlByKey.set(key, row);
  const result = { collection: name, mongo: mongoDocs.length, sql: sqlRows.length, toSql: 0, toMongo: 0, sqlUpdated: 0, mongoUpdated: 0, conflicts: 0, errors: [] };
  const matched = new Set();
  for (const doc of mongoDocs) {
    const id = String(doc._id);
    try {
      const mine = plain(doc);
      const row = sqlById.get(id) || keysOf(mine, keys).map(key => sqlByKey.get(key)).find(Boolean);
      if (!row) { result.toSql++; if (apply) await write(spec, mine, 0, null, true); continue; }
      matched.add(String(row.data._id));
      const theirs = plain(row.data);
      const same = (a, b) => { const { _id: x, __v: y, ...ra } = a; const { _id: z, __v: w, ...rb } = b; return canonical(ra) === canonical(rb); };
      if (same(mine, theirs)) continue;
      const m = stamp(doc), q = stamp(row.data);
      if (m === null || q === null || m === q) { result.conflicts++; continue; }
      if (m > q) { result.sqlUpdated++; if (apply) await write(spec, { ...mine, _id: row.data._id }, row.version, null, false); }
      else { result.mongoUpdated++; if (apply) await mongo.replaceOne({ _id: doc._id }, { ...row.data, _id: doc._id }); }
    } catch (error) { result.errors.push(`${id}: ${error.message}`.slice(0, 160)); }
  }
  const mongoKeys = new Set(mongoDocs.flatMap(doc => [String(doc._id), ...keysOf(plain(doc), keys)]));
  for (const row of sqlRows) {
    const id = String(row.data._id);
    if (matched.has(id) || mongoKeys.has(id) || keysOf(plain(row.data), keys).some(key => mongoKeys.has(key))) continue;
    try { result.toMongo++; if (apply) await mongo.insertOne(row.data); }
    catch (error) { result.errors.push(`${id}: ${error.message}`.slice(0, 160)); }
  }
  return result;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set.');
  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  await runtime.connect({ readiness: false });
  const db = client.db();
  const report = [];
  try {
    for (const spec of catalog()) {
      if (only.length ? !only.includes(spec.model.collection.collectionName) : SKIP.has(spec.model.collection.collectionName)) continue;
      report.push(await syncCollection(spec, db));
    }
  } finally { await client.close().catch(() => {}); await runtime.disconnect().catch(() => {}); }
  const changed = report.filter(r => r.toSql || r.toMongo || r.sqlUpdated || r.mongoUpdated || r.conflicts || r.errors.length);
  console.log(apply ? 'APPLIED' : 'PREVIEW (nothing changed; add --apply to copy)');
  console.table(changed.map(({ errors, ...r }) => ({ ...r, errors: errors.length })));
  for (const r of changed) for (const e of r.errors.slice(0, 5)) console.log(`  ${r.collection} error ${e}`);
  console.log(`${report.length} collections checked, ${report.length - changed.length} already identical.`);
}

if (require.main === module) main().catch(error => { console.error('Sync failed:', error.message); process.exit(1); });
module.exports = { syncCollection };
