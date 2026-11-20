// Smart clean-up for uploaded member sheets. It works like a careful assistant:
// - finds the header row anywhere near the top (title rows, blank rows, logos above it are fine),
// - recognises columns by their header, or by their content when the header is unclear,
// - fixes only mistakes and formatting (spaces, letter case, email typos, phone format, club name spelling),
// - never invents data, except the MIU ID, which is read from the student's MIU email when it is missing,
// - reports every change (row, column, before -> after) so the admin can check it before saving.
const FIELDS = {
  name: { label: 'Full Name', header: /full\s*name|student\s*name|^name$|الاسم/i },
  phone: { label: 'Phone Number', header: /phone|mobile|whats\s*app|رقم/i },
  universityId: { label: 'MIU ID', header: /miu\s*id|university\s*id|student\s*id|^id$/i },
  email: { label: 'MIU Email Address', header: /e-?\s*mail|^mail$|البريد/i },
  faculty: { label: 'Faculty', header: /faculty|major|department|كلية/i },
  clubName: { label: 'Club Name', header: /club\s*name|^club$|النادي/i },
  boardPosition: { label: 'Board Position', header: /board\s*position|board/i },
  role: { label: 'Role / Position', header: /role|position|title/i },
  committee: { label: 'Member Committee', header: /committee|team|لجنة/i }
};
const ORDER = ['name', 'phone', 'universityId', 'email', 'faculty', 'clubName', 'boardPosition', 'role', 'committee'];

const text = value => String(value ?? '').normalize('NFKC').replace(/[​-‏﻿]/g, '').replace(/\s+/g, ' ').trim();
const looksEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const looksPhone = v => /^\+?[\d\s()-]{9,16}$/.test(v) && v.replace(/\D/g, '').length >= 10;
const { normalizeMiuId, miuIdFromEmail } = require('../public/assets/js/student-fields');
const looksMiuId = v => Boolean(normalizeMiuId(v));

// "ahmed MOHAMED" stays readable as "Ahmed Mohamed"; mixed-case names the person typed carefully are kept.
function nameCase(value) {
  const words = value.split(' ').filter(w => /[a-z]/i.test(w));
  // Fix only when every word is all-small or ALL-CAPS ("ahmed MOHAMED"); "McDonald" or "Ahmed" stay as typed.
  if (!words.length || words.every(w => /^[A-Z][a-z'-]*$/.test(w)) || !words.every(w => w === w.toLowerCase() || w === w.toUpperCase())) return value;
  return value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

function fixEmail(raw) {
  let v = text(raw).replace(/^mailto:/i, '').replace(/\s+/g, '').replace(/[,;]+$/, '').toLowerCase();
  v = v.replace(/@+/g, '@').replace(/\.{2,}/g, '.');
  // Common MIU domain typos -> @miuegypt.edu.eg
  v = v.replace(/@(miu\s*egypt|miuegpyt|miuegyp|miuegy|miuegytp|muiegypt|miuegpt|miuegyptt)(\.edu)?(\.eg|\.com|\.eg\.com)?$/i, '@miuegypt.edu.eg')
    .replace(/@miuegypt(\.edu)?(\.com)?$/i, '@miuegypt.edu.eg')
    .replace(/@miuegypt\.edu\.(e|eg\.|egg|ge)$/i, '@miuegypt.edu.eg');
  return v;
}

function fixPhone(raw) {
  let digits = text(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+20')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('0020')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('20') && digits.length === 12) digits = '0' + digits.slice(2);
  if (/^1[0125]\d{8}$/.test(digits)) digits = '0' + digits; // Egyptian mobile typed without the leading 0
  return digits;
}

const similarity = (a, b) => {
  a = a.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, ''); b = b.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
  if (!a || !b) return 0; if (a === b) return 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
};

function matchClub(value, clubNames, aliases = new Map()) {
  if (!value) return value;
  const lower = value.toLowerCase();
  const exact = clubNames.find(n => n.toLowerCase() === lower); if (exact) return exact;
  const alias = aliases.get(lower); if (alias) return alias;
  let best = null, score = 0;
  for (const name of clubNames) {
    const s = similarity(value, name) + (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase()) ? 0.15 : 0);
    if (s > score) { score = s; best = name; }
  }
  return score >= 0.72 ? best : value;
}

// Header row: the row (within the first 15) that matches the most known column headers.
function findHeader(grid) {
  let best = { index: -1, map: {}, hits: 0 };
  grid.slice(0, 15).forEach((row, index) => {
    const map = {}; let hits = 0;
    (row || []).forEach((cell, col) => {
      const label = text(cell); if (!label) return;
      const field = ORDER.find(f => !Object.values(map).includes(f) && FIELDS[f].header.test(label));
      if (field) { map[col] = field; hits++; }
    });
    if (hits > best.hits) best = { index, map, hits };
  });
  return best;
}

// Columns with no clear header are recognised from their content (emails, phones, 7-digit IDs).
function guessColumns(grid, header) {
  const used = new Set(Object.values(header.map)), map = { ...header.map };
  const width = Math.max(0, ...grid.map(r => (r || []).length));
  const body = grid.slice(header.index + 1, header.index + 60);
  for (let col = 0; col < width; col++) {
    if (map[col]) continue;
    const values = body.map(r => text(r?.[col])).filter(Boolean); if (values.length < 2) continue;
    const share = test => values.filter(test).length / values.length;
    const guess = !used.has('email') && share(looksEmail) > 0.7 ? 'email' : !used.has('universityId') && share(looksMiuId) > 0.7 ? 'universityId' : !used.has('phone') && share(looksPhone) > 0.7 ? 'phone' : '';
    if (guess) { map[col] = guess; used.add(guess); }
  }
  return map;
}

function autofixMembers(grid, { clubNames = [], aliases = new Map() } = {}) {
  grid = (Array.isArray(grid) ? grid : []).map(row => (Array.isArray(row) ? row : []).map(cell => cell == null ? '' : String(cell)));
  const header = findHeader(grid);
  if (header.index < 0) return { error: 'Could not find the header row. Make sure the sheet has column titles such as Full Name, MIU Email Address and Club Name.' };
  const map = guessColumns(grid, header);
  const changes = [], rows = [], seen = new Map();
  const note = (rowNumber, field, before, after, why) => { if (String(before) !== String(after)) changes.push({ rowNumber, column: FIELDS[field].label, before: String(before), after: String(after), why }); };
  for (let r = header.index + 1; r < grid.length; r++) {
    const raw = grid[r], rowNumber = r + 1, item = { rowNumber };
    for (const [col, field] of Object.entries(map)) item[field] = raw[col] ?? '';
    if (!ORDER.some(f => text(item[f]))) continue; // empty row
    if (ORDER.filter(f => text(item[f])).length === 1 && text(item.name) && /total|المجموع/i.test(item.name)) continue; // totals row
    const out = { rowNumber }, pending = [];
    for (const field of ORDER) {
      const before = item[field] ?? '';
      let after = text(before);
      const spaced = after !== String(before) && String(before).trim() !== '';
      if (field === 'name') after = nameCase(after);
      if (field === 'email') after = fixEmail(after);
      if (field === 'phone' && after) after = fixPhone(after);
      if (field === 'universityId' && after) after = normalizeMiuId(after) || after;
      if (field === 'clubName') after = matchClub(after, clubNames, aliases);
      if (['committee', 'faculty', 'role', 'boardPosition'].includes(field) && after && (after === after.toLowerCase() || after === after.toUpperCase()) && after.length > 3) after = nameCase(after);
      const why = { name: 'Fixed capital letters', email: 'Fixed email format', phone: 'Fixed phone format', universityId: 'Standard MIU ID format (2024/06700)', clubName: 'Matched the club name on the website', committee: 'Fixed capital letters', faculty: 'Fixed capital letters', role: 'Fixed capital letters', boardPosition: 'Fixed capital letters' }[field];
      const reasons = [spaced ? 'Removed extra spaces' : '', after !== text(before) ? why : ''].filter(Boolean);
      if (reasons.length) pending.push({ rowNumber, column: FIELDS[field].label, before: String(before), after, why: reasons.join(' + ') });
      out[field] = after;
    }
    // Same person + club twice: keep one row, filling its empty cells from the other.
    const key = `${out.email}|${out.clubName.toLowerCase()}`;
    if (out.email && seen.has(key)) {
      const first = seen.get(key);
      for (const f of ORDER) if (!first[f] && out[f]) first[f] = out[f];
      changes.push({ rowNumber, column: 'Whole row', before: `Duplicate of row ${first.rowNumber}`, after: 'Merged into row ' + first.rowNumber, why: 'Same email and club listed twice' });
      continue;
    }
    changes.push(...pending);
    // Missing MIU ID: read it from the MIU email (e.g. mahmoud2406700@ -> 2024/06700).
    if (!out.universityId) { const fromEmail = miuIdFromEmail(out.email); if (fromEmail) { out.universityId = fromEmail; note(rowNumber, 'universityId', '', out.universityId, 'Filled from the MIU email'); } }
    seen.set(key, out); rows.push(out);
  }
  const found = Object.values(map);
  return { headerRow: header.index + 1, columns: Object.fromEntries(Object.entries(map).map(([col, field]) => [field, Number(col)])),
    missing: ['name', 'email', 'clubName'].filter(f => !found.includes(f)).map(f => FIELDS[f].label), rows, changes };
}

module.exports = { autofixMembers, fixEmail, fixPhone, nameCase, matchClub, FIELDS, ORDER };
