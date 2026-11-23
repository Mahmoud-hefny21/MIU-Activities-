// Student event attendance (Admin and PR dashboards): how many events each student actually attended.
// Counts recorded check-ins only (never registrations); rejected check-ins are excluded by the server.
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGE = 40;

  function mount(host) {
    if (!host || host.dataset.saMounted) return;
    host.dataset.saMounted = 'true';
    const thisYear = new Date().getFullYear();
    host.innerHTML = `<div class="sa-panel">
      <div class="sa-stats" data-sa-stats><p class="sa-note">Loading attendance…</p></div>
      <div class="sa-levels" data-sa-levels></div>
      <form class="sa-filters" data-sa-filters>
        <label>Search<input type="search" name="q" placeholder="Name, MIU account, ID or club" autocomplete="off"></label>
        <label>Enrollment year<select name="year"><option value="">All years</option></select></label>
        <label>Events in<select name="period"><option value="">All dates</option><option value="${thisYear}">${thisYear}</option><option value="${thisYear - 1}">${thisYear - 1}</option></select></label>
        <label>Sort by<select name="sort"><option value="most">Most events</option><option value="least">Fewest events</option><option value="name">Name (A–Z)</option><option value="recent">Most recent event</option></select></label>
        <a class="primary-btn sa-download" data-sa-download href="/api/report-downloads/student-attendance.xlsx" download>Download Excel</a>
      </form>
      <p class="sa-note" data-sa-count role="status" aria-live="polite"></p>
      <ol class="sa-list" data-sa-list></ol>
      <button type="button" class="secondary-btn sa-more" data-sa-more hidden>Show more students</button>
      <p class="sa-note">Counts only events where the student's check-in was recorded (QR scan or verified check-in). Registrations do not count, and rejected check-ins are excluded. Year and ID come from the MIU account, e.g. mahmoud<b>24</b><b>06700</b> = enrolled 2024, ID 06700.</p>
    </div>`;
    const $ = sel => host.querySelector(sel);
    const form = $('[data-sa-filters]');
    let report = null, shown = PAGE, loadedPeriod = null;

    async function load() {
      const period = form.elements.period.value;
      if (period === loadedPeriod && report) return render();
      $('[data-sa-count]').textContent = 'Loading…';
      const query = period ? `?year=${encodeURIComponent(period)}` : '';
      $('[data-sa-download]').href = '/api/report-downloads/student-attendance.xlsx' + query;
      try {
        const response = await fetch('/api/report-downloads/student-attendance' + query, { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Student attendance is unavailable right now.');
        report = data; loadedPeriod = period;
        const years = [...new Set(report.students.map(s => s.enrollmentYear).filter(Boolean))].sort().reverse();
        const select = form.elements.year, current = select.value;
        select.innerHTML = '<option value="">All years</option>' + years.map(y => `<option ${y === current ? 'selected' : ''}>${esc(y)}</option>`).join('');
        renderStats(); render();
      } catch (error) { $('[data-sa-count]').textContent = error.message; $('[data-sa-stats]').innerHTML = ''; }
    }

    function renderStats() {
      const t = report.totals;
      const tile = (label, value, note) => `<article class="sa-stat"><span>${label}</span><strong>${Number(value).toLocaleString()}</strong><small>${note}</small></article>`;
      $('[data-sa-stats]').innerHTML = tile('Students who attended', t.students, 'At least one event')
        + tile('Events attended', t.checkIns, 'Confirmed check-ins') + tile('Different events', t.events, 'With check-ins')
        + tile('Average per student', t.average, 'Events each');
      const max = Math.max(1, ...Object.values(report.levels));
      $('[data-sa-levels]').innerHTML = '<h3>Students by number of events</h3>' + Object.entries(report.levels).map(([range, count]) =>
        `<div class="sa-level"><span>${range} event${range === '1' ? '' : 's'}</span><span class="sa-bar"><i data-pct="${Math.round(count / max * 100)}"></i></span><b>${count}</b></div>`).join('');
      $('[data-sa-levels]').querySelectorAll('[data-pct]').forEach((bar) => { bar.style.width = bar.dataset.pct + '%'; });
    }

    function filtered() {
      const q = form.elements.q.value.trim().toLowerCase(), year = form.elements.year.value, sort = form.elements.sort.value;
      const rows = report.students.filter(s => (!year || s.enrollmentYear === year)
        && (!q || [s.name, s.email, s.account, s.universityId, s.major, ...s.clubs].join(' ').toLowerCase().includes(q)));
      if (sort === 'least') rows.sort((a, b) => a.attended - b.attended || a.name.localeCompare(b.name));
      else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === 'recent') rows.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
      return rows;
    }

    function render() {
      if (!report) return;
      const rows = filtered(), max = Math.max(1, ...report.students.map(s => s.attended));
      const rank = new Map(report.students.map((s, i) => [s.email, i + 1]));
      $('[data-sa-count]').textContent = rows.length ? `${rows.length.toLocaleString()} student${rows.length === 1 ? '' : 's'}` : 'No students match these filters.';
      $('[data-sa-list]').innerHTML = rows.slice(0, shown).map(s => `<li class="sa-row">
        <details><summary>
          <span class="sa-rank${rank.get(s.email) <= 3 ? ' is-top' : ''}">${rank.get(s.email)}</span>
          <span class="sa-who"><strong>${esc(s.name)}</strong><small>${esc(s.account)}${s.enrollmentYear ? ` · <span class="sa-chip">Class of ${esc(s.enrollmentYear)}</span>` : ''}${s.universityId ? ` · ID ${esc(s.universityId)}` : ''}${s.major ? ` · ${esc(s.major)}` : ''}</small></span>
          <span class="sa-count"><strong>${s.attended}</strong><small>event${s.attended === 1 ? '' : 's'}</small><span class="sa-bar"><i data-pct="${Math.round(s.attended / max * 100)}"></i></span></span>
        </summary>
        <div class="sa-events"><p class="sa-note">${s.approved} approved · ${s.waiting} waiting for review · Clubs: ${esc(s.clubs.join(', '))}</p>
          <ul>${s.events.map(e => `<li><strong>${esc(e.title)}</strong><span>${esc(e.club)} · ${esc(e.date || 'No date')} · ${esc(e.role)}</span><em class="sa-status ${e.status === 'Approved' ? 'ok' : 'wait'}">${esc(e.status)}</em></li>`).join('')}</ul></div>
        </details></li>`).join('');
      $('[data-sa-list]').querySelectorAll('[data-pct]').forEach((bar) => { bar.style.width = bar.dataset.pct + '%'; });
      $('[data-sa-more]').hidden = rows.length <= shown;
    }

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', event => { shown = PAGE; if (event.target.name === 'period') void load(); else render(); });
    $('[data-sa-more]').addEventListener('click', () => { shown += PAGE; render(); });
    void load();
  }

  window.MiuStudentAttendance = { mount };
})();
