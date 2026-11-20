// Club Excel import: the extra club information beyond name/description/logo.
// Stored for internal use only (admin and roles); none of it is shown on the public club card.
// profile  = mission, vision, faculty advisor, club number, social links, officer names.
// officers = President / Vice President MIU ID, email, phone, faculty & year; supervisor name and email.
// Blank cells never erase saved values, so re-uploading a partial sheet only updates what it contains.
const { displayMiuId } = require('../public/assets/js/student-fields');
const clean = (value, max) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (value, max) => String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);

// Social links: split on new lines, commas or spaces; keep web links and @handles only.
function socialLinks(value) {
  return [...new Set(String(value ?? '').split(/[\n,;\s]+/).map(item => item.trim()).filter(Boolean)
    .map(item => /^www\./i.test(item) ? `https://${item}` : item)
    .filter(item => /^https?:\/\/[^\s<>"']{3,300}$/i.test(item) || /^@[\w.]{2,60}$/.test(item)))].slice(0, 10);
}

function person(row, prefix) {
  return {
    name: clean(row[`${prefix}Name`], 120), universityId: displayMiuId(clean(row[`${prefix}UniversityId`], 40), row[`${prefix}Email`]),
    email: clean(row[`${prefix}Email`], 254).toLowerCase(), phone: clean(row[`${prefix}Phone`], 40),
    facultyYear: clean(row[`${prefix}FacultyYear`], 120)
  };
}

function importDetails(row) {
  return {
    profile: {
      mission: cleanBlock(row.mission, 1500), vision: cleanBlock(row.vision, 1500),
      facultyAdvisor: clean(row.facultyAdvisor, 120), clubNumber: clean(row.clubNumber, 40),
      socialLinks: socialLinks(row.socialLinks),
      presidentName: clean(row.presidentName, 120), vicePresidentName: clean(row.vicePresidentName, 120),
      supervisorName: clean(row.supervisorName, 120)
    },
    officers: {
      president: person(row, 'president'), vicePresident: person(row, 'vicePresident'),
      supervisor: { name: clean(row.supervisorName, 120), email: clean(row.supervisorEmail, 254).toLowerCase() }
    }
  };
}

// Keep saved values where the sheet cell is blank (empty strings / empty lists).
function keep(saved, incoming) {
  const result = { ...(saved && typeof saved === 'object' ? saved : {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = keep(result[key], value);
    else if (Array.isArray(value) ? value.length : value !== '' && value != null) result[key] = value;
  }
  return result;
}

function mergeDetails(club, details) {
  if (!details) return {};
  return { profile: keep(club?.profile, details.profile), officers: keep(club?.officers, details.officers) };
}

module.exports = { importDetails, mergeDetails, socialLinks };
