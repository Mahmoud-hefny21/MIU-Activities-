'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/assets/js/app-home.js'), 'utf8');
const start = source.indexOf('function getClubCardImageUrl(');
const end = source.indexOf('\nasync function loadApplications()', start);
const sandbox = {
  window: { location: { origin: 'https://miu.example' } },
  URL,
  localClubCardImages: new Set(['utopia.jpg', 'mun.jpg', 'cdc.jpg', 'dimas.jpg', 'ieee.jpg', 'msp.jpg', 'theater.jpg', 'tuners.jpg', 'gamerslegacy.jpg', 'ihepc.jpg', 'acpc.jpg', 'tedx.jpg'])
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

test('resizes Cloudinary club-card images with automatic format and quality', () => {
  const result = sandbox.getClubCardImageUrl('https://res.cloudinary.com/demo/image/upload/v123/clubs/example.jpg');
  assert.equal(result, 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_480,c_limit/v123/clubs/example.jpg');
});

test('leaves local, non-Cloudinary and non-versioned images unchanged', () => {
  for (const value of ['/assets/clubs/example.jpg', '/assets/img/pics/logo.svg.png', '/assets/img/pics/unknown.jpg', 'https://images.example/clubs/example.jpg', 'https://res.cloudinary.com/demo/image/upload/clubs/example.jpg']) {
    assert.equal(sandbox.getClubCardImageUrl(value), value);
  }
});

test('uses a preserved local derivative for known club-card photos only', () => {
  assert.equal(
    sandbox.getClubCardImageUrl('/assets/img/pics/tedx.jpg'),
    'https://miu.example/assets/img/pics/club-thumbnails/tedx-480.jpg'
  );
});

test('leaves invalid values unchanged', () => {
  assert.equal(sandbox.getClubCardImageUrl(''), '');
  assert.equal(sandbox.getClubCardImageUrl('not a url'), 'not a url');
  assert.equal(sandbox.getClubCardImageUrl(null), null);
});

test('loads public homepage copy from the public read endpoint', async () => {
  const calls = [];
  const title = { textContent: '' };
  const subtitle = { textContent: '' };
  const loadStart = source.indexOf('async function loadHomepageSettings(');
  const loadEnd = source.indexOf('\nfunction getClubCardImageUrl(', loadStart);
  const loader = {
    homepageSettingsLoadPromise: null,
    homepageSettingsLoadedAt: 0,
    homePageTitle: title,
    homePageSubtitle: subtitle,
    Date,
    fetch: async url => {
      calls.push(url);
      return { ok: true, json: async () => ({ title: 'Clubs', subtitle: 'Explore student clubs.' }) };
    }
  };
  vm.createContext(loader);
  vm.runInContext(source.slice(loadStart, loadEnd), loader);

  await loader.loadHomepageSettings();

  assert.deepEqual(calls, ['/api/site/homepage']);
  assert.equal(title.textContent, 'Clubs');
  assert.equal(subtitle.textContent, 'Explore student clubs.');
});
