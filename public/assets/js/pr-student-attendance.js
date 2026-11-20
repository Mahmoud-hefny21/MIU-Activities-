// PR dashboard: overview numbers for student attendance, and the full list when its panel opens.
(() => {
  'use strict';
  const panel = document.getElementById('studentAttendancePanel');
  if (!panel || !window.MiuStudentAttendance) return;
  const open = () => { if (!panel.hidden) window.MiuStudentAttendance.mount(document.getElementById('studentAttendanceHost')); };
  new MutationObserver(open).observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] });
  open();
  fetch('/api/report-downloads/student-attendance', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(report => { if (report) for (const el of document.querySelectorAll('[data-sa-overview]')) el.textContent = Number(report.totals[el.dataset.saOverview] || 0).toLocaleString(); })
    .catch(() => {});
})();
