const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const loginScript = read('public/assets/js/pages/applicant-login.js');
const layoutScript = read('public/assets/js/layout.js');

// Runs the page's real studentReturnTarget() against a given ?redirect= value.
function returnTargetFor(search) {
  const start = loginScript.indexOf('const studentReturnTarget = () => {');
  const end = loginScript.indexOf('\n      };', start) + '\n      };'.length;
  assert.ok(start > -1 && end > start, 'studentReturnTarget is defined');
  const origin = 'https://miu-activities.vercel.app';
  const context = { URL, URLSearchParams, window: { location: { search, origin } } };
  return vm.runInNewContext(`${loginScript.slice(start, end)}; studentReturnTarget();`, context);
}

test('after sign-in the default destination is the home page, not the profile', () => {
  assert.equal(returnTargetFor(''), '/');
  assert.doesNotMatch(loginScript, /\|\| '\/\?myForms=1'/);
});

test('a same-site redirect is kept', () => {
  assert.equal(returnTargetFor('?redirect=' + encodeURIComponent('/pages/events.html?id=4#top')), '/pages/events.html?id=4#top');
});

test('security: redirect never leaves the site (open redirect)', () => {
  for (const evil of [
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    ' https://evil.example',
  ]) {
    const target = returnTargetFor('?redirect=' + encodeURIComponent(evil));
    assert.ok(target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\'), `${evil} -> ${target}`);
    assert.doesNotMatch(target, /evil\.example|javascript:|data:/i, `${evil} -> ${target}`);
  }
});

test('every sign-in path uses the safe return target', () => {
  assert.doesNotMatch(loginScript, /result\.redirect/, 'server-supplied redirect is not followed');
  assert.equal((loginScript.match(/window\.location\.replace\(studentReturnTarget\(\)\)/g) || []).length, 4);
});

test('header says Sign In the first time and Login after a previous sign-in', () => {
  assert.match(layoutScript, /let label = 'Sign In';/);
  assert.match(layoutScript, /getItem\('miu:signed-in-before'\) === '1'\) label = 'Login'/);
  assert.match(layoutScript, /setItem\('miu:signed-in-before', '1'\)/);
  assert.match(read('public/components/site-header.html'), /<span>Sign In<\/span>/);
});

test('login page uses the same Sign In / Login wording', () => {
  assert.match(loginScript, /getItem\('miu:signed-in-before'\) === '1'/);
  assert.match(loginScript, /getElementById\('loginTitle'\)\.textContent = 'Login'/);
  assert.match(loginScript, /getElementById\('loginSubmitBtn'\)\.textContent = 'Login'/);
});

test('security: labels are set as plain text, never as HTML', () => {
  assert.doesNotMatch(loginScript, /loginTitle'\)\.innerHTML|loginSubmitBtn'\)\.innerHTML/);
  assert.doesNotMatch(layoutScript, /span\.innerHTML = label/);
});

test('security: the remembered flag holds no personal data', () => {
  const writes = layoutScript.match(/setItem\('miu:signed-in-before', [^)]*\)/g) || [];
  assert.deepEqual(writes, ["setItem('miu:signed-in-before', '1')"]);
});

test('the header button label is tall enough that letters like "g" are not cut off', () => {
  assert.match(read('public/assets/css/responsive.css'), /\.nav-right \.nav-signin-btn span \{[^}]*line-height: 1\.35/);
});
