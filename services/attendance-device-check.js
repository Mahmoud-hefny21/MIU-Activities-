// "Phone check" for attendance sheets. Every check-in stores a private device fingerprint (never shown).
// Across all recorded check-ins we flag two things staff should look at:
//  - one phone used by more than one student account (someone may be checking in for friends);
//  - one student account that checked in from more than one phone.
// Labels only name other accounts that are already in the same sheet.
const OK = 'OK';

async function deviceChecks(AttendanceRecord, records) {
  const result = new Map();
  const mine = records.filter((r) => r.deviceHash && r.email);
  if (!AttendanceRecord || !mine.length) return result;
  const emailOf = (r) => String(r.email || '').trim().toLowerCase();
  const emails = [...new Set(mine.map(emailOf))];
  const hashes = [...new Set(mine.map((r) => r.deviceHash))];
  const others = await AttendanceRecord.find({ $or: [{ email: { $in: emails } }, { deviceHash: { $in: hashes } }] })
    .select('+deviceHash email').lean();
  const accountsByPhone = new Map(), phonesByAccount = new Map();
  for (const r of [...others, ...mine]) {
    if (!r.deviceHash || !r.email) continue;
    const email = emailOf(r);
    if (!accountsByPhone.has(r.deviceHash)) accountsByPhone.set(r.deviceHash, new Set());
    accountsByPhone.get(r.deviceHash).add(email);
    if (!phonesByAccount.has(email)) phonesByAccount.set(email, new Set());
    phonesByAccount.get(email).add(r.deviceHash);
  }
  const inSheet = new Set(emails);
  for (const r of mine) {
    const email = emailOf(r), notes = [];
    const sharers = [...(accountsByPhone.get(r.deviceHash) || [])].filter((e) => e !== email);
    if (sharers.length) {
      const named = sharers.filter((e) => inSheet.has(e)), hidden = sharers.length - named.length;
      notes.push(`Same phone as ${[...named, ...(hidden ? [`${hidden} other account${hidden === 1 ? '' : 's'}`] : [])].join(', ')}`);
    }
    const phones = phonesByAccount.get(email)?.size || 0;
    if (phones > 1) notes.push(`Used ${phones} different phones`);
    result.set(r, notes.length ? notes.join(' · ') : OK);
  }
  return result;
}

module.exports = { deviceChecks, DEVICE_OK: OK };
