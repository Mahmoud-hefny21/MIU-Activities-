const test = require('node:test');
const assert = require('node:assert/strict');
const { importDetails, mergeDetails, socialLinks } = require('../services/club-import-details');

test('club sheet details split into public profile and private officers', () => {
  const details = importDetails({ mission: ' Build  leaders ', vision: 'Every student', facultyAdvisor: 'Dr. Sara', clubNumber: '12',
    socialLinks: 'https://instagram.com/club\nwww.facebook.com/club, @clubhandle javascript:alert(1)',
    presidentName: 'Ali', presidentEmail: 'ALI@miuegypt.edu.eg', presidentUniversityId: '2023/1', presidentPhone: '010', presidentFacultyYear: 'CS 2nd',
    vicePresidentName: 'Mona', supervisorName: 'Dr. Omar', supervisorEmail: 'omar@miuegypt.edu.eg' });
  assert.equal(details.profile.mission, 'Build leaders');
  assert.deepEqual(details.profile.socialLinks, ['https://instagram.com/club', 'https://www.facebook.com/club', '@clubhandle']);
  assert.equal(details.profile.presidentName, 'Ali');
  assert.equal(details.profile.supervisorName, 'Dr. Omar');
  // Private contact details are only in officers, never in the public profile.
  assert.equal(JSON.stringify(details.profile).includes('010'), false);
  assert.equal(details.officers.president.email, 'ali@miuegypt.edu.eg');
  assert.equal(details.officers.president.phone, '010');
  assert.equal(details.officers.supervisor.email, 'omar@miuegypt.edu.eg');
});

test('re-uploading keeps saved values where the new sheet cell is blank', () => {
  const saved = mergeDetails({}, importDetails({ mission: 'Old mission', vision: 'Old vision', presidentPhone: '010', socialLinks: 'https://x.com/club' }));
  const next = mergeDetails(saved, importDetails({ mission: 'New mission', vision: '', presidentPhone: '', socialLinks: '' }));
  assert.equal(next.profile.mission, 'New mission');
  assert.equal(next.profile.vision, 'Old vision');
  assert.equal(next.officers.president.phone, '010');
  assert.deepEqual(next.profile.socialLinks, ['https://x.com/club']);
});

test('only web links and @handles are kept as social links', () => {
  assert.deepEqual(socialLinks('ftp://bad data:text/html,x <script> @ok_handle https://tiktok.com/@club'), ['@ok_handle', 'https://tiktok.com/@club']);
});
