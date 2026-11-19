const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRow, toRosterEntry } = require('../services/admin-member-import');

test('member sheet rows map to roster fields and require name, email and club', () => {
  const ok = validateRow({ name: ' Sara  Ali ', phone: '0100', universityId: '2023/00001', email: 'Sara@MIUEGYPT.edu.eg', faculty: 'Pharmacy', clubName: 'Utopia', role: 'Board', boardPosition: 'Head of PR', committee: 'PR' }, 2);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.member.name, 'Sara Ali');
  assert.equal(ok.member.email, 'sara@miuegypt.edu.eg');
  const entry = toRosterEntry(ok.member);
  assert.equal(entry.major, 'Pharmacy');
  assert.equal(entry.position, 'Head of PR');
  assert.equal(entry.committee, 'PR');
  assert.equal(entry.memberType, 'senior');
  const bad = validateRow({ name: '', email: 'nope', clubName: '' }, 3);
  assert.equal(bad.problems.length, 3);
});

test('plain members default to the General committee, Member position and new type; updates keep the roster id', () => {
  const { member } = validateRow({ name: 'Omar', email: 'omar@miuegypt.edu.eg', clubName: 'Utopia', role: 'Member' }, 2);
  const entry = toRosterEntry(member);
  assert.equal(entry.committee, 'General');
  assert.equal(entry.position, 'Member');
  assert.equal(entry.memberType, 'new');
  const updated = toRosterEntry({ ...member, phone: '0111' }, { ...entry, id: 'keep-me', age: '20' });
  assert.equal(updated.id, 'keep-me');
  assert.equal(updated.age, '20');
  assert.equal(updated.phone, '0111');
});
