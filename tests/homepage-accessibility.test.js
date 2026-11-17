'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const markup = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const homeScript = fs.readFileSync(require.resolve('../public/assets/js/app-home.js'), 'utf8');
const foundationCss = fs.readFileSync(require.resolve('../frontend/styles/foundation.css'), 'utf8');
const contentFormCss = fs.readFileSync(require.resolve('../public/assets/css/pages/content-form.css'), 'utf8');

test('club application fields have programmatically associated labels', () => {
  const fieldIds = [
    'applicationFirstName', 'applicationLastName', 'applicationUniversityId',
    'applicationMajor', 'applicationEmail', 'applicationPhone',
    'applicationCommitteeInput', 'applicationSlot', 'applicationAge',
    'applicationMotivation', 'applicationNotes'
  ];

  for (const id of fieldIds) {
    assert.match(markup, new RegExp(`<label\\s+for="${id}"`), `${id} label must reference its field`);
    assert.match(markup, new RegExp(`<\\w+[^>]*\\bid="${id}"`), `${id} field must exist`);
  }
});

test('club category controls expose group name and selected state', () => {
  assert.match(markup, /id="categoryChips"[^>]*role="group"[^>]*aria-label="Filter clubs by category"/);
  assert.match(homeScript, /class="category-chip[^`]*aria-pressed="\$\{state\.activeCategory === cat\}"/);
});

test('interactive controls receive a visible keyboard focus ring in both themes', () => {
  assert.match(foundationCss, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--border-focus\)/s);
  assert.match(foundationCss, /:root\[data-theme="dark"\]\s+:focus-visible\s*\{[^}]*outline-color:\s*#fbbf24/s);
});

test('unauthenticated content studios keep their hidden management forms hidden', () => {
  assert.match(contentFormCss, /\.content-layout\[hidden\]\s*\{\s*display:\s*none\s*!important\s*;/);
  for (const path of [
    '../public/pages/event-form.html', '../public/pages/feed-form.html',
    '../public/pages/sponsor-form.html', '../public/pages/booth-form.html',
    '../public/pages/entry-permit-form.html', '../public/pages/club-content.html'
  ]) {
    const markup = fs.readFileSync(require.resolve(path), 'utf8');
    assert.match(markup, /id="contentLayout"\s+hidden/, `${path} must hide content until a valid club session is confirmed`);
  }
});
