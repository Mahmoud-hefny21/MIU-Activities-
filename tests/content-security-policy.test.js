const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { securityHeaders, CONTENT_SECURITY_POLICY } = require('../services/http-security');

const root = path.join(__dirname, '..');
function* files(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'vendor') yield* files(file); } else yield file;
  }
}

test('the full policy is enforced, not report-only', () => {
  const headers = {};
  securityHeaders({}, { setHeader: (key, value) => { headers[key] = value; } }, () => {});
  assert.equal(headers['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
  const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map(part => { const [name, ...values] = part.split(' '); return [name, values]; }));
  assert.ok(!directives['script-src'].includes("'unsafe-inline'") && !directives['script-src'].includes("'unsafe-eval'"));
  for (const [directive, source] of [['script-src', 'https://accounts.google.com/gsi/client'], ['frame-src', 'https://accounts.google.com/gsi/'],
    ['connect-src', 'https://accounts.google.com/gsi/'], ['style-src', 'https://accounts.google.com/gsi/style'], ['script-src', 'https://cdn.onesignal.com'],
    ['connect-src', 'https://api.cloudinary.com'], ['media-src', 'https://res.cloudinary.com'], ['style-src', 'https://fonts.googleapis.com'],
    ['font-src', 'https://fonts.gstatic.com'], ['frame-ancestors', "'none'"], ['object-src', "'none'"]]) {
    assert.ok(directives[directive]?.includes(source), `${directive} allows ${source}`);
  }
});

test('pages carry no inline scripts or inline event handlers', () => {
  const offenders = [];
  for (const file of [...files(path.join(root, 'public')), ...files(path.join(root, 'private'))]) {
    if (!/\.(html|js)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.html')) for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc=/.test(match[1]) && match[2].trim() && !/type=["']application\/(?:ld\+)?json/.test(match[1])) offenders.push(`${path.relative(root, file)}: inline <script>`);
    }
    for (const match of source.matchAll(/[\s"'`]on(?:click|load|error|change|submit|input|key\w+|mouse\w+|focus|blur|pointer\w+|touch\w+|dblclick)\s*=\s*["'\\]/g)) {
      offenders.push(`${path.relative(root, file)}: ${match[0].trim()}`);
    }
  }
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.doesNotMatch(serverSource, /<[a-z]+[^>]*\son(?:click|load)="/i, 'server-rendered HTML has no inline handlers');
  assert.deepEqual(offenders, []);
});

test('stage and preview deployments are not indexed; production stays indexable', async () => {
  const express = require('express');
  const { stageIndexing } = require('../services/http-security');
  async function probe(env) {
    const app = express(); app.use(stageIndexing(env)); app.get('*', (req, res) => res.send('page'));
    const server = app.listen(0); const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const robots = await fetch(origin + '/robots.txt'), page = await fetch(origin + '/');
      return { robotsStatus: robots.status, robots: await robots.text(), tag: page.headers.get('x-robots-tag') };
    } finally { server.close(); }
  }
  for (const VERCEL_ENV of ['preview', undefined]) {
    const result = await probe({ VERCEL_ENV });
    assert.match(result.robots, /^User-agent: \*\nDisallow: \/\n$/);
    assert.equal(result.tag, 'noindex, nofollow');
  }
  const production = await probe({ VERCEL_ENV: 'production' });
  assert.equal(production.robots, 'page', 'production does not serve the stage robots.txt');
  assert.equal(production.tag, null);
});
