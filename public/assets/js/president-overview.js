// Club dashboard overview: "Needs your attention" lists what the club should act on now.
(() => {
  'use strict';
  const list = document.getElementById('presidentTodoList');
  if (!list) return;
  let lastFetch = 0, remote = { block: null, heads: null }, renderQueued = false;

  const clubAccount = () => (typeof state !== 'undefined' ? state.clubAccount : null);
  const openSection = (id) => {
    if (typeof window.setPresidentDashboardSection === 'function') window.setPresidentDashboardSection(id);
    else document.querySelector(`[data-dashboard-section="${id}"]`)?.click();
  };

  function item({ tone, title, detail, action, href, onClick }) {
    const li = document.createElement('li');
    li.className = `president-todo-item is-${tone}`;
    const text = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = title;
    const span = document.createElement('span'); span.textContent = detail;
    text.append(strong, span);
    const control = document.createElement(href ? 'a' : 'button');
    control.className = 'secondary-btn president-todo-action';
    control.textContent = action;
    if (href) control.href = href; else { control.type = 'button'; control.addEventListener('click', onClick); }
    li.append(text, control);
    return li;
  }

  async function refreshRemote() {
    const account = clubAccount();
    if (!account || Date.now() - lastFetch < 60000) return;
    lastFetch = Date.now();
    const president = account.role === 'president';
    const [block, heads] = await Promise.all([
      president ? fetch('/api/post-event-reports/block-status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
      president ? fetch('/api/club/heads', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null
    ]);
    remote = { block, heads: Array.isArray(heads) ? heads : null };
    queueRender();
  }

  function render() {
    renderQueued = false;
    const account = clubAccount();
    if (!account) return;
    const president = account.role === 'president';
    const needsReview = Number(document.getElementById('statNeedsReview')?.textContent) || 0;
    const items = [];
    if (needsReview > 0) items.push(item({ tone: 'warning', title: `${needsReview} applicant${needsReview === 1 ? '' : 's'} waiting for review`,
      detail: 'Interview, accept or reject new applications.', action: 'Review', onClick: () => openSection('presidentApplicantsPanel') }));
    if (president && remote.block?.blocked) {
      const count = remote.block.pendingReports.length;
      items.push(item({ tone: 'danger', title: `${count} post-event report${count === 1 ? '' : 's'} needed`,
        detail: 'New event requests are paused until these reports are fully approved.', action: 'Open reports', href: remote.block.pendingReports[0]?.link || '/pages/post-event-reports.html' }));
    }
    if (president && ['closed', 'full'].includes(account.status)) items.push(item({ tone: 'info', title: `Applications are ${account.status}`,
      detail: 'Students cannot apply to your club right now.', action: 'Change status', onClick: () => openSection('presidentClubStatusPanel') }));
    if (president && remote.heads && !remote.heads.length) items.push(item({ tone: 'info', title: 'No committee heads yet',
      detail: 'Add a head for each committee so applicants reach the right person.', action: 'Add heads', onClick: () => openSection('presidentHeadManager') }));
    if (!items.length) {
      const done = document.createElement('li');
      done.className = 'president-todo-item is-done';
      const strong = document.createElement('strong'); strong.textContent = 'You’re all caught up';
      const span = document.createElement('span'); span.textContent = 'Nothing needs your attention right now.';
      const text = document.createElement('div'); text.append(strong, span);
      done.append(text);
      items.push(done);
    }
    list.replaceChildren(...items);
  }
  function queueRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); } }

  // Re-render when the dashboard updates its numbers or opens the overview.
  const stat = document.getElementById('statNeedsReview');
  if (stat) new MutationObserver(queueRender).observe(stat, { childList: true, characterData: true, subtree: true });
  const view = document.getElementById('headDashboardView');
  if (view) new MutationObserver(() => { if (view.classList.contains('active')) { void refreshRemote(); queueRender(); } }).observe(view, { attributes: true, attributeFilter: ['class'] });
  const overview = document.getElementById('presidentOverviewPanel');
  if (overview) new MutationObserver(() => { if (!overview.classList.contains('hidden')) { void refreshRemote(); queueRender(); } }).observe(overview, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('presidentClubStatusForm')?.addEventListener('submit', () => setTimeout(queueRender, 800));
  if (view?.classList.contains('active')) { void refreshRemote(); queueRender(); }
})();
