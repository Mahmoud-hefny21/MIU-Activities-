const test = require('node:test');
const assert = require('node:assert/strict');
const heads = require('../services/committee-heads');

// In-memory ClubAccount stand-in. find() returns every account; the service
// itself filters role assignments by club, so the fake stays simple.
function fakeModel(initial = []) {
  const accounts = initial.map(account => ({ _id: account.email, sessionVersion: 0, ...account }));
  const query = value => ({ select() { return this; }, read() { return this; }, session() { return this; }, lean: async () => value && structuredClone(value) });
  const byEmail = email => accounts.find(account => account.email === email) || null;
  return {
    accounts, byEmail,
    find: () => query(accounts),
    findOne: filter => query(byEmail(filter.email)),
    async create([doc]) { accounts.push({ _id: doc.email, ...doc }); return [{ toObject: () => structuredClone(doc) }]; },
    findOneAndUpdate(filter, update) {
      const account = accounts.find(item => item._id === filter._id && (item.sessionVersion ?? 0) === (filter.sessionVersion ?? item.sessionVersion ?? 0));
      if (account) { Object.assign(account, update.$set); if (update.$inc) account.sessionVersion += 1; }
      return query(account || null);
    },
    async deleteOne(filter) {
      const index = accounts.findIndex(item => item._id === filter._id);
      if (index < 0) return { deletedCount: 0 };
      accounts.splice(index, 1); return { deletedCount: 1 };
    }
  };
}
const base = { session: null, blockedEmail: email => email === 'admin@miuegypt.edu.eg' };
const head = 'head@miuegypt.edu.eg';

test('one MIU Google account can head committees in several clubs without a password', async () => {
  const ClubAccount = fakeModel();
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 1, committee: 'IT' });
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 2, committee: 'Media' });
  assert.deepEqual(await heads.listHeads(ClubAccount, 1), [{ clubId: 1, email: head, committee: 'IT' }]);
  assert.deepEqual(await heads.listHeads(ClubAccount, 2), [{ clubId: 2, email: head, committee: 'Media' }]);
  assert.equal(ClubAccount.accounts.length, 1);
  assert.match(ClubAccount.byEmail(head).passwordHash, /^[a-f0-9]{128}$/);
});

test('an existing president can also become a head in another club, keeping the president role', async () => {
  const ClubAccount = fakeModel([{ email: head, role: 'president', clubId: 5, committee: '' }]);
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 2, committee: 'IT' });
  assert.deepEqual(ClubAccount.byEmail(head).roleAssignments.map(item => [item.role, item.clubId]), [['president', 5], ['head', 2]]);
});

test('duplicates are rejected: same person twice in one club, or a committee that already has a head', async () => {
  const ClubAccount = fakeModel();
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 1, committee: 'IT' });
  await assert.rejects(heads.addHead({ ...base, ClubAccount, email: head, clubId: 1, committee: 'PR' }), { status: 409 });
  await assert.rejects(heads.addHead({ ...base, ClubAccount, email: 'other@miuegypt.edu.eg', clubId: 1, committee: ' it ' }), { status: 409 });
  await assert.rejects(heads.addHead({ ...base, ClubAccount, email: 'admin@miuegypt.edu.eg', clubId: 1, committee: 'HR' }), { status: 400 });
});

test('removing one club keeps the other head roles; removing the last role deletes the account', async () => {
  const ClubAccount = fakeModel();
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 1, committee: 'IT' });
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 2, committee: 'Media' });
  await heads.removeHead({ ...base, ClubAccount, email: head, clubId: 1 });
  assert.deepEqual(await heads.listHeads(ClubAccount), [{ clubId: 2, email: head, committee: 'Media' }]);
  assert.equal(ClubAccount.byEmail(head).sessionVersion, 1);
  await heads.removeHead({ ...base, ClubAccount, email: head, clubId: 2 });
  assert.equal(ClubAccount.byEmail(head), null);
  await assert.rejects(heads.removeHead({ ...base, ClubAccount, email: head, clubId: 2 }), { status: 404 });
});

test('editing renames the committee in place, or moves the club role to a new email', async () => {
  const ClubAccount = fakeModel();
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 1, committee: 'IT' });
  await heads.addHead({ ...base, ClubAccount, email: head, clubId: 2, committee: 'Media' });
  await heads.updateHead({ ...base, ClubAccount, oldEmail: head, email: head, clubId: 1, committee: 'Tech' });
  assert.deepEqual(await heads.listHeads(ClubAccount, 1), [{ clubId: 1, email: head, committee: 'Tech' }]);
  await heads.updateHead({ ...base, ClubAccount, oldEmail: head, email: 'new@miuegypt.edu.eg', clubId: 1, committee: 'Tech' });
  assert.deepEqual(await heads.listHeads(ClubAccount, 1), [{ clubId: 1, email: 'new@miuegypt.edu.eg', committee: 'Tech' }]);
  assert.deepEqual(await heads.listHeads(ClubAccount, 2), [{ clubId: 2, email: head, committee: 'Media' }]);
});
