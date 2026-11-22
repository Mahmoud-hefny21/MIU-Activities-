// Tests and scripts that write real rows must never reach the shared stage/production data.
// Rows written to the normal local database can also reach the live site through
// `npm run db:sync -- --apply`, so writes are allowed only on a local SQL Server
// database whose name ends in "_test" and that is named again in SQL_TEST_DATABASE.
const os = require('node:os');

function assertIsolatedTestDatabase(env = process.env) {
  const { provider, sqlPrefix } = require('../../database/config');
  if (env.NODE_ENV === 'production' || env.VERCEL || env.VERCEL_ENV) throw new Error('Writing tests never run in a production or Vercel environment.');
  if (provider(env) !== 'sqlserver') throw new Error('Writing tests run only against a local SQL Server, never Azure SQL or MongoDB.');
  const prefix = sqlPrefix(env), database = String(env[`${prefix}_DATABASE`] || ''), host = String(env[`${prefix}_HOST`] || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', '.', '(local)', os.hostname().toLowerCase()].includes(host)) throw new Error(`${prefix}_HOST must be this machine for writing tests.`);
  if (!/_test$/i.test(database)) throw new Error(`${prefix}_DATABASE must be a separate database whose name ends in "_test".`);
  if (env.SQL_TEST_DATABASE !== database) throw new Error(`Set SQL_TEST_DATABASE=${database || '<name>_test'} to confirm the isolated test database.`);
  return database;
}

module.exports = { assertIsolatedTestDatabase };
