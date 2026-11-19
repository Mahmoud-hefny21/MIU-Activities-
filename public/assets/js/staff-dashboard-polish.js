// Staff dashboards (Supervisor, PR, English, Security, SSO, Dean): grouped sidebar with icons,
// and an overview card for post-event reports waiting on this reviewer.
(() => {
  'use strict';
  const sidebar = document.querySelector('.committee-sidebar');
  if (!sidebar) return;

  const ICONS = {
    overview: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/>',
    requests: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    approve: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    permit: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    members: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 4a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0-3-4.6"/>',
    feedback: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    attendance: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 20h.01"/>',
    sheet: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/>',
    report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 7"/>',
    speaker: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    events: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  };
  // Group and icon by the link's label; anything unknown keeps its place under "More".
  const RULES = [
    [/^overview/i, 'Overview', 'overview'],
    [/pending requests|club requests|approval requests|all requests/i, 'Reviews', 'requests'],
    [/attendance approvals/i, 'Reviews', 'approve'],
    [/entry permit/i, 'Reviews', 'permit'],
    [/post-event/i, 'Reviews', 'photo'],
    [/club members|assigned clubs/i, 'Clubs', 'members'],
    [/^events$/i, 'Clubs', 'events'],
    [/registrations/i, 'Clubs', 'sheet'],
    [/feedback/i, 'Clubs', 'feedback'],
    [/open event attendance|miu event attendance/i, 'Attendance', 'globe'],
    [/attendance sheets|download attendance/i, 'Attendance', 'sheet'],
    [/attendance/i, 'Attendance', 'attendance'],
    [/report/i, 'Reports', 'report'],
    [/speaker link/i, 'Speakers', 'link'],
    [/speaker/i, 'Speakers', 'speaker']
  ];
  const GROUP_ORDER = ['Overview', 'Reviews', 'Clubs', 'Attendance', 'Reports', 'Speakers', 'More'];
  const labelOf = (item) => (item.querySelector('.sidebar-label')?.textContent || item.childNodes[0]?.textContent || item.textContent).replace(/\s+/g, ' ').trim();
  const classify = (item) => RULES.find(([pattern]) => pattern.test(labelOf(item))) || [null, 'More', null];

  function decorate(item) {
    if (item.querySelector('.sidebar-icon')) return;
    const [, , icon] = classify(item);
    // Keep badges and other child elements; wrap the text label so it can be styled.
    const textNode = [...item.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
    if (textNode) {
      const label = document.createElement('span');
      label.className = 'sidebar-label';
      label.textContent = textNode.textContent.trim();
      textNode.replaceWith(label);
    }
    if (icon) item.insertAdjacentHTML('afterbegin', `<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`);
  }

  let arranging = false, queued = false;
  function arrange() {
    queued = false;
    arranging = true;
    const items = [...sidebar.children].filter((child) => child.matches('a, button') && !child.matches('.dashboard-drawer-close'));
    const heading = sidebar.querySelector(':scope > h2');
    const groups = new Map(GROUP_ORDER.map((name) => [name, []]));
    for (const item of items) { decorate(item); groups.get(classify(item)[1]).push(item); }
    // Old group headings are replaced by the grouped ones below.
    sidebar.querySelectorAll(':scope > h3, :scope > .staff-sidebar-group').forEach((node) => node.remove());
    const after = heading || sidebar.querySelector(':scope > .dashboard-drawer-heading');
    const fragment = document.createDocumentFragment();
    // Controls that are not links (such as the supervisor's club picker) stay near the top.
    const controls = [...sidebar.children].filter((child) => !child.matches('a, button, h2, h3, .dashboard-drawer-heading, .staff-sidebar-group'));
    if (controls.length) {
      const title = document.createElement('h3');
      title.className = 'staff-sidebar-group';
      title.textContent = 'Assigned clubs';
      fragment.append(title, ...controls);
    }
    for (const [name, members] of groups) {
      if (!members.length) continue;
      if (name !== 'Overview') {
        const title = document.createElement('h3');
        title.className = 'staff-sidebar-group';
        title.textContent = name;
        fragment.append(title);
      }
      members.forEach((member) => fragment.append(member));
    }
    if (after) after.after(fragment); else sidebar.append(fragment);
    sidebar.classList.add('is-arranged');
    observer?.takeRecords();
    arranging = false;
  }
  // Re-arrange only when a new, not-yet-decorated link appears; our own moves are ignored,
  // otherwise the sidebar would rebuild itself every frame and swallow clicks.
  const hasNewItem = () => [...sidebar.children].some((child) => child.matches('a, button') && !child.matches('.dashboard-drawer-close') && !child.querySelector('.sidebar-icon, .sidebar-label'));
  const queue = () => { if (!arranging && !queued && hasNewItem()) { queued = true; requestAnimationFrame(arrange); } };
  const observer = new MutationObserver(queue);
  observer.observe(sidebar, { childList: true });
  arrange();
  observer.takeRecords();

  // Overview card: post-event reports waiting for this reviewer.
  let reportCardStarted = false;
  async function addReportCard() {
    const stats = document.querySelector('.committee-overview-stats');
    // Claim the slot before fetching so overlapping calls cannot add a second card.
    if (!stats || reportCardStarted) return;
    reportCardStarted = true;
    let data;
    try {
      const response = await fetch('/api/post-event-reports/overview', { cache: 'no-store' });
      if (!response.ok) return;
      data = await response.json();
    } catch { return; }
    const waiting = (data.reports || []).filter((report) => report.awaitingYou).length;
    const card = document.createElement('a');
    card.className = `overview-stat-card${waiting ? ' has-items' : ''}`;
    card.href = '/pages/post-event-reports.html';
    card.dataset.postEventCard = '';
    const title = document.createElement('span'); title.textContent = 'Post-event reports';
    const count = document.createElement('strong'); count.textContent = String(waiting);
    const hint = document.createElement('small'); hint.textContent = waiting ? 'Waiting for your decision' : 'Nothing waiting for you';
    card.append(title, count, hint);
    stats.append(card);
  }
  // Overview cards: mark the ones waiting for this reviewer so phones and tablets show them first.
  const markCards = () => document.querySelectorAll('.committee-overview-stats .overview-stat-card').forEach((card) => {
    const count = Number((card.querySelector('strong')?.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const hasNumber = /\d/.test(card.querySelector('strong')?.textContent || '');
    card.classList.toggle('is-waiting', count > 0);
    card.classList.toggle('is-zero', hasNumber && count === 0);
  });
  new MutationObserver(markCards).observe(document.body, { subtree: true, childList: true, characterData: true });
  markCards();

  const role = sidebar.dataset.unreadScope;
  if (['pr', 'english', 'dean', 'supervisor'].includes(role)) {
    const tryAdd = () => { void addReportCard(); };
    tryAdd();
    // The overview can render after this script; retry once it appears.
    const observer = new MutationObserver(() => { if (document.querySelector('.committee-overview-stats')) { observer.disconnect(); tryAdd(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
