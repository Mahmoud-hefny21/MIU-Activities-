// MIU ID and age in one standard format everywhere (forms, server checks, exports).
// MIU ID: entry year / 5-digit number, e.g. "2024/06700". Age: a whole number of years, e.g. "20".
(function (root) {
  'use strict';
  const AGE_MIN = 16;
  const AGE_MAX = 100;
  const MIU_ID_HINT = 'Enter the MIU ID like 2024/06700 (entry year / 5-digit number).';
  const AGE_HINT = `Enter the age as a whole number from ${AGE_MIN} to ${AGE_MAX}, like 20.`;

  const validYear = year => year >= 2000 && year <= new Date().getFullYear() + 1;

  // "2024/06700", "2024-06700", "24/06700", "2406700", "202406700" -> "2024/06700".
  // Returns '' for an empty value and null when the text cannot be an MIU ID.
  function normalizeMiuId(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, '');
    if (!text) return '';
    const match = text.match(/^(\d{4}|\d{2})[/\\\-._]?(\d{5})$/);
    if (!match) return null;
    const year = match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1]);
    return validYear(year) ? `${year}/${match[2]}` : null;
  }

  // MIU emails end with the ID: "mahmoud2406700@miuegypt.edu.eg" -> "2024/06700".
  function miuIdFromEmail(email) {
    const match = String(email || '').trim().toLowerCase().match(/(\d{2})(\d{5})@miuegypt\.edu\.eg$/);
    if (!match) return '';
    const year = 2000 + Number(match[1]);
    return validYear(year) ? `${year}/${match[2]}` : '';
  }

  // "20", " 20 ", "20 years" -> "20". Returns '' for an empty value and null when it is not a valid age.
  function normalizeAge(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const match = text.match(/^(\d{1,3})(?:\.0+)?(?:\s*(?:years?(?:\s*old)?|yrs?))?$/i);
    if (!match) return null;
    const age = Number(match[1]);
    return age >= AGE_MIN && age <= AGE_MAX ? String(age) : null;
  }

  // For showing stored records: the standard form when possible, else the ID from the MIU email,
  // else the stored text unchanged (so nothing is hidden).
  function displayMiuId(value, email) {
    const normalized = normalizeMiuId(value);
    if (normalized) return normalized;
    return miuIdFromEmail(email) || String(value ?? '').trim();
  }

  function displayAge(value) {
    const normalized = normalizeAge(value);
    return normalized === null ? String(value ?? '').trim() : normalized;
  }

  const api = { AGE_MIN, AGE_MAX, MIU_ID_HINT, AGE_HINT, normalizeMiuId, miuIdFromEmail, normalizeAge, displayMiuId, displayAge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MiuStudentFields = api;
})(typeof window === 'undefined' ? globalThis : window);
