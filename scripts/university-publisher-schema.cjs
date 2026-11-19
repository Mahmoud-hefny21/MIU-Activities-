require('dotenv').config();
const fs = require('node:fs'), path = require('node:path');
const db = require('../database');
const file = path.join(__dirname, '../database/migrations/012-university-publisher.sql');

// Adds UniversityContent publisher columns (MIU or faculty). MongoDB needs no change.
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Run with --apply to add the UniversityContent publisher columns.');
  if (!db.isSqlProvider) { console.log('MongoDB stores the publisher fields without a schema change. Nothing to apply.'); return; }
  require('./sqlserver-migrate.cjs').targetGate();
  const sql = require('mssql'), { sqlConfig, sqlPrefix } = require('../database/config');
  const config = sqlConfig(), prefix = sqlPrefix();
  if (process.env[prefix + '_OPERATIONS_USER'] || process.env[prefix + '_OPERATIONS_PASSWORD']) {
    if (!process.env[prefix + '_OPERATIONS_USER'] || !process.env[prefix + '_OPERATIONS_PASSWORD']) throw new Error('Both operations credentials are required.');
    config.user = process.env[prefix + '_OPERATIONS_USER']; config.password = process.env[prefix + '_OPERATIONS_PASSWORD'];
  }
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    await pool.request().batch(fs.readFileSync(file, 'utf8'));
    console.log('UniversityContent now stores the publisher (MIU or faculty). No records were changed.');
  } finally { await pool.close(); }
}
if (require.main === module) main().catch((error) => { console.error('University publisher migration failed:', error.code || error.name, error.message); process.exitCode = 1; });
