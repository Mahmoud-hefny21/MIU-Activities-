require('dotenv').config();
const fs = require('node:fs'), path = require('node:path');
const db = require('../database');
const { EventReport } = require('../services/event-reports');
const { EventEvaluation } = require('../services/post-event-reports');
const { describe, createTable, foreignKeys, identifier, literal } = require('../database/schema');
const file = path.join(__dirname, '../database/migrations/011-post-event-reports.sql');
const NEW_REPORT_COLUMNS = ['eventRequestId', 'eventTitle', 'eventDate', 'eventLocation', 'totalParticipants', 'externalBeneficiaries', 'fullyApprovedAt'];

// Post-event reports: new EventReport columns and statuses, and the EventEvaluation table. Existing rows are kept.
function migration() {
  const report = describe(EventReport), evaluation = describe(EventEvaluation);
  const columns = NEW_REPORT_COLUMNS.map(name => report.columns.find(column => column.name === name));
  const status = report.columns.find(column => column.name === 'status');
  const addColumns = columns.map(c => `IF COL_LENGTH(N'dbo.EventReport',N'${c.name}') IS NULL
  ALTER TABLE dbo.EventReport ADD ${identifier(c.name)} ${c.type}${c.string ? ' COLLATE Latin1_General_100_BIN2' : ''} NULL;`).join('\n');
  const minimums = ['totalParticipants', 'externalBeneficiaries'].map(name => `IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_EventReport_${name}_Min')
  EXEC(N'ALTER TABLE dbo.EventReport ADD CONSTRAINT [CK_EventReport_${name}_Min] CHECK ([${name}] IS NULL OR [${name}] >= 0)');`).join('\n');
  const statusValues = status.path.enumValues.map(literal).join(', ').replace(/'/g, "''");
  return `SET XACT_ABORT ON;
BEGIN TRANSACTION;
${addColumns}
${minimums}
DECLARE @oldStatusCheck SYSNAME = (
  SELECT TOP 1 cc.name FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
  WHERE cc.parent_object_id = OBJECT_ID(N'dbo.EventReport') AND c.name = N'status' AND cc.definition NOT LIKE N'%pending_supervisor%');
IF @oldStatusCheck IS NOT NULL EXEC(N'ALTER TABLE dbo.EventReport DROP CONSTRAINT [' + @oldStatusCheck + N']');
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_EventReport_Status')
  EXEC(N'ALTER TABLE dbo.EventReport ADD CONSTRAINT [CK_EventReport_Status] CHECK ([status] IS NULL OR [status] IN (${statusValues}))');
IF OBJECT_ID(N'dbo.EventEvaluation',N'U') IS NULL BEGIN
${createTable(evaluation)}
${foreignKeys([evaluation]).join('\n')}
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.EventEvaluation TO miu_runtime_v1;
COMMIT TRANSACTION;
`;
}

async function main() {
  if (process.argv.includes('--generate')) { fs.writeFileSync(file, migration()); console.log('Post-event report migration generated; no database changed.'); return; }
  if (!process.argv.includes('--apply')) throw new Error('Choose --generate or --apply.');
  if (!db.isSqlProvider) {
    await db.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    try { await EventEvaluation.createIndexes(); console.log('MongoDB evaluation indexes ensured.'); } finally { await db.disconnect(); }
    return;
  }
  require('./sqlserver-migrate.cjs').targetGate();
  const sql = require('mssql'), { sqlConfig, sqlPrefix } = require('../database/config');
  const config = sqlConfig(), prefix = sqlPrefix();
  if (process.env[prefix + '_OPERATIONS_USER'] || process.env[prefix + '_OPERATIONS_PASSWORD']) {
    if (!process.env[prefix + '_OPERATIONS_USER'] || !process.env[prefix + '_OPERATIONS_PASSWORD']) throw new Error('Both operations credentials are required.');
    config.user = process.env[prefix + '_OPERATIONS_USER']; config.password = process.env[prefix + '_OPERATIONS_PASSWORD'];
  }
  const pool = await new sql.ConnectionPool(config).connect();
  try { await pool.request().batch(fs.readFileSync(file, 'utf8')); console.log('Post-event report schema applied without changing existing records.'); }
  finally { await pool.close(); }
}
if (require.main === module) main().catch(error => { console.error('Post-event report migration failed:', error.code || error.name, error.message); process.exitCode = 1; });
module.exports = { migration };
