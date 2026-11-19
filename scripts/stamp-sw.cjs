// Runs on every Vercel build: gives the service worker a new cache name per deployment,
// so installed apps pick up the new version on their own (no reinstall needed).
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'sw.js');
const id = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || Date.now().toString(36)).slice(0, 12);
const source = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, source.replace(/const CACHE_NAME = 'miu-clubs-static-(v\d+)[^']*';/, (_, version) => `const CACHE_NAME = 'miu-clubs-static-${version}-${id}';`));
console.log('Service worker cache:', id);
