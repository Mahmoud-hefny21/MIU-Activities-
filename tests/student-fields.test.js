const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMiuId, miuIdFromEmail, normalizeAge, displayMiuId, displayAge, MIU_ID_HINT, AGE_HINT } = require('../public/assets/js/student-fields');

test('MIU ID: common ways of typing it become the standard 2024/06700 form', () => {
  for (const typed of ['2024/06700', ' 2024 / 06700 ', '2024-06700', '2024\\06700', '2024.06700', '202406700', '24/06700', '24-06700', '2406700']) {
    assert.equal(normalizeMiuId(typed), '2024/06700', typed);
  }
  assert.equal(normalizeMiuId(''), '');
  assert.equal(normalizeMiuId('   '), '');
});

test('MIU ID: text, wrong digit counts and impossible years are rejected', () => {
  for (const bad of ['riiefjwle', 'tesa3tashar', '06700', '2024/670', '2024/067000', '2024/06A00', '1999/06700', '2099/06700', '99/06700', 'ID 2024/06700']) {
    assert.equal(normalizeMiuId(bad), null, bad);
  }
  assert.match(MIU_ID_HINT, /2024\/06700/);
});

test('MIU ID is read from MIU emails only', () => {
  assert.equal(miuIdFromEmail('Mahmoud2406700@miuegypt.edu.eg'), '2024/06700');
  assert.equal(miuIdFromEmail('sara2306123@MIUEGYPT.EDU.EG'), '2023/06123');
  assert.equal(miuIdFromEmail('sara2306123@gmail.com'), '');
  assert.equal(miuIdFromEmail('sara@miuegypt.edu.eg'), '');
});

test('age: whole numbers from 16 to 100', () => {
  for (const [typed, age] of [['20', '20'], [' 21 ', '21'], ['20 years', '20'], ['19 years old', '19'], ['20.0', '20'], ['16', '16'], ['100', '100']]) {
    assert.equal(normalizeAge(typed), age, typed);
  }
  for (const bad of ['tesa3tashar', '15', '101', '20.5', '-20', 'twenty', '2O']) assert.equal(normalizeAge(bad), null, bad);
  assert.equal(normalizeAge(''), '');
  assert.match(AGE_HINT, /like 20/);
});

test('shown values: standard form, else from the MIU email, else the stored text unchanged', () => {
  assert.equal(displayMiuId('2406700', 'x@gmail.com'), '2024/06700');
  assert.equal(displayMiuId('riiefjwle', 'mahmoud2406700@miuegypt.edu.eg'), '2024/06700');
  assert.equal(displayMiuId('', 'mahmoud2406700@miuegypt.edu.eg'), '2024/06700');
  assert.equal(displayMiuId('riiefjwle', 'x@gmail.com'), 'riiefjwle');
  assert.equal(displayAge(' 20 '), '20');
  assert.equal(displayAge('tesa3tashar'), 'tesa3tashar');
});

test('admin member import: bad MIU ID is reported, a missing one is filled from the MIU email', () => {
  const { validateRow } = require('../services/admin-member-import');
  const base = { name: 'Sara Ali', email: 'sara2406700@miuegypt.edu.eg', clubName: 'Robotics Club' };
  assert.deepEqual(validateRow({ ...base, universityId: 'riiefjwle' }, 2).problems, ['MIU ID must look like 2024/06700']);
  assert.equal(validateRow({ ...base, universityId: '2406700' }, 2).member.universityId, '2024/06700');
  assert.equal(validateRow({ ...base, universityId: '' }, 2).member.universityId, '2024/06700');
});
