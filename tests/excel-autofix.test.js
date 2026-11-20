const test = require('node:test');
const assert = require('node:assert/strict');
const { autofixMembers, fixEmail, fixPhone, nameCase } = require('../services/excel-autofix');

test('fixes formats without changing real data', () => {
  assert.equal(fixEmail(' Mailto:Ahmed2406700@MIUEGYPT.EDU '), 'ahmed2406700@miuegypt.edu.eg');
  assert.equal(fixEmail('sara2300001@miuegpyt.edu.eg'), 'sara2300001@miuegypt.edu.eg');
  assert.equal(fixEmail('someone@gmail.com'), 'someone@gmail.com');
  assert.equal(fixPhone('+20 101 234 5678'), '01012345678');
  assert.equal(fixPhone('1012345678'), '01012345678');
  assert.equal(nameCase('ahmed MOHAMED'), 'Ahmed Mohamed');
  assert.equal(nameCase('Ahmed McDonald'), 'Ahmed McDonald');
});

test('finds the header under title rows, recognises columns, fixes and merges duplicates', () => {
  const grid = [
    ['MIU clubs — members 2026'], [],
    ['Student Name', 'Mail', 'Club', 'Committee', ''],
    ['  ahmed   ali ', 'AHMED2406700@miuegypt.edu', 'robotcs club', 'media', '+201012345678'],
    ['Sara Nabil', 'sara2500123@miuegypt.edu.eg', 'Robotics Club', 'HR', '01112223334'],
    ['', '', '', '', ''],
    ['Sara Nabil', 'sara2500123@miuegypt.edu.eg', 'Robotics Club', '', '01112223334']
  ];
  const result = autofixMembers(grid, { clubNames: ['Robotics Club', 'Rawi'] });
  assert.equal(result.headerRow, 3);
  assert.deepEqual(result.missing, []);
  assert.equal(result.rows.length, 2, 'duplicate merged, empty row skipped');
  const [ahmed] = result.rows;
  assert.equal(ahmed.name, 'Ahmed Ali'); assert.equal(ahmed.email, 'ahmed2406700@miuegypt.edu.eg');
  assert.equal(ahmed.clubName, 'Robotics Club'); assert.equal(ahmed.committee, 'Media');
  assert.equal(ahmed.phone, '01012345678', 'phone column recognised from its content');
  assert.equal(ahmed.universityId, '2406700', 'MIU ID read from the email');
  assert.ok(result.changes.some(c => c.why === 'Same email and club listed twice'));
  assert.equal(result.rows[1].name, 'Sara Nabil', 'correct values are not touched');
});

test('an unknown club name is kept, not guessed', () => {
  const result = autofixMembers([['Full Name', 'Email', 'Club Name'], ['A B', 'a2400001@miuegypt.edu.eg', 'Chess Society']], { clubNames: ['Robotics Club'] });
  assert.equal(result.rows[0].clubName, 'Chess Society');
});
