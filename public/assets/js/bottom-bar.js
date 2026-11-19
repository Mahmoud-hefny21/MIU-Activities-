// Bottom navigation bar for phones and tablets.
// Students and visitors get the main site sections; each dashboard gets its own most useful
// sections plus Back and Menu. It slides away near the footer and comes back on scroll up.
(() => {
  'use strict';
  const small = window.matchMedia('(max-width: 1024px)');
  if (document.querySelector('.bottom-bar') || /(?:forgot-password|reset-password)/.test(location.pathname)) return;

  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/>',
    feed: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    events: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    overview: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/>',
    inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a7 7 0 0 1 14 0v1M19 8v6M16 11h6"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 20h.01M20 14v.01M14 20v.01"/>',
    report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1"/><path d="M16 4a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0-3-4.6"/>',
    item: '<circle cx="12" cy="12" r="8"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const labelOf = (el) => (el.querySelector('.sidebar-label, :scope > span:not(.student-nav-count):not([class*="badge"]):not(.bottom-bar-icon)')?.textContent || el.childNodes[0]?.textContent || el.textContent).replace(/\s+/g, ' ').trim();

  const bar = document.createElement('nav');
  bar.className = 'bottom-bar';
  bar.setAttribute('aria-label', 'Quick navigation');

  function makeItem({ label, icon, iconNode, href, onClick, active, badgeFrom }) {
    const el = document.createElement(href ? 'a' : 'button');
    el.className = 'bottom-bar-item' + (active ? ' is-active' : '');
    if (href) el.href = href; else el.type = 'button';
    if (active) el.setAttribute('aria-current', 'page');
    const iconWrap = document.createElement('span');
    iconWrap.className = 'bottom-bar-icon';
    if (iconNode) iconWrap.append(iconNode); else iconWrap.innerHTML = svg(icon);
    const text = document.createElement('span');
    text.className = 'bottom-bar-label';
    text.textContent = label;
    el.append(iconWrap, text);
    if (badgeFrom) {
      const badge = document.createElement('span');
      badge.className = 'bottom-bar-badge';
      const sync = () => { const value = badgeFrom.hidden ? '' : badgeFrom.textContent.trim(); badge.textContent = value; badge.hidden = !value || value === '0'; };
      new MutationObserver(sync).observe(badgeFrom, { childList: true, characterData: true, subtree: true, attributes: true });
      sync();
      iconWrap.append(badge);
    }
    if (onClick) el.addEventListener('click', onClick);
    return el;
  }

  // One short word per button so labels never get cut off on small phones.
  const SHORT = { 'pending requests': 'Pending', 'club requests': 'Requests', 'all requests': 'Requests', 'approval requests': 'Approvals',
    'attendance approvals': 'Attendance', 'attendance reviews': 'Attendance', 'entry permits': 'Permits', 'post-event reports': 'Reports',
    'club members': 'Members', 'student feedback': 'Feedback', 'event attendance': 'Check-ins', 'attendance sheets': 'Sheets',
    'open event attendance': 'Open events', 'miu event attendance': 'MIU events', 'event reports': 'Reports', 'activity reports': 'Activity',
    'create speaker link': 'Speaker link', 'my clubs': 'My clubs', 'explore clubs': 'Explore', 'all attendance history': 'History', 'miu events & posts': 'Posts', 'take miu event attendance': 'Check-in', 'registrations': 'Sign-ups', 'external speaker requests': 'Speakers', 'content studio': 'Studio', 'applications': 'Applicants' };
  const shortLabel = (text) => { const clean = text.replace(/\s+\d+$/, '').trim(); return SHORT[clean.toLowerCase()] || clean.split(' ')[0]; };
  // A clear icon for each kind of section, so no two buttons look alike.
  const iconFor = (link, isOverview) => {
    if (isOverview) return 'overview';
    const text = labelOf(link).toLowerCase();
    if (/attendance approval|attendance review/.test(text)) return 'check';
    if (/pending|request|approval/.test(text)) return 'inbox';
    if (/permit/.test(text)) return 'shield';
    if (/applicant|application/.test(text)) return 'userPlus';
    if (/post|feed|announce/.test(text)) return 'megaphone';
    if (/check-in|take .*attendance|event attendance/.test(text)) return 'qr';
    if (/report/.test(text)) return 'report';
    if (/member|head|registration|my clubs/.test(text)) return 'users';
    return 'check';
  };
  const back = () => makeItem({ label: 'Back', icon: 'back', onClick: () => (window.miuGoBack ? window.miuGoBack('/') : history.back()) });

  function dashboardItems(sidebar) {
    const links = [...sidebar.querySelectorAll(':scope > a, :scope > button, :scope > nav > a, :scope > nav > button')].filter((el) => !el.matches('.dashboard-drawer-close') && labelOf(el) && !/log ?out|sign ?out/i.test(labelOf(el)));
    if (!links.length) return null;
    // Overview plus the next two sections, preferring ones with a count badge (work waiting).
    const overview = links[0];
    const rest = links.slice(1);
    // The two sections people use most on each dashboard, in order of importance.
    const PRIORITY = [/^my clubs/i, /^pending requests/i, /^club requests/i, /^applicants/i, /^all requests/i, /^attendance approvals/i,
      /^entry permits/i, /^miu events & posts/i, /^registrations/i, /^take miu event attendance/i, /^post-event reports/i];
    const rank = (el) => { const index = PRIORITY.findIndex((pattern) => pattern.test(labelOf(el))); return index < 0 ? 99 : index; };
    const picks = [...rest].sort((a, b) => rank(a) - rank(b)).slice(0, 1);
    // Each sidebar has its own menu toggle; the club dashboard page holds several dashboards.
    const toggle = () => document.querySelector(`.dashboard-drawer-toggle[aria-controls="${sidebar.id}"]`) || sidebar.previousElementSibling;
    // Sections with work waiting move to the top of the menu under "Needs your attention".
    const prioritise = () => {
      let urgent = 0;
      for (const link of links) {
        const badge = link.querySelector('[data-unread-badge], .badge, .sidebar-badge');
        const waiting = Boolean(badge && !badge.hidden && Number(badge.textContent.replace(/[^0-9]/g, '')) > 0);
        link.classList.toggle('is-urgent', waiting);
        if (waiting) urgent += 1;
      }
      sidebar.classList.toggle('has-urgent', urgent > 0);
      overview.classList.add('menu-first');
    };
    const fromLink = (link) => makeItem({
      label: shortLabel(labelOf(link)),
      icon: iconFor(link, link === overview),
      badgeFrom: link.querySelector('[data-unread-badge], .badge, .sidebar-badge'),
      onClick: () => { link.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    const items = [back(), fromLink(overview), ...picks.map(fromLink), makeItem({ label: 'Menu', icon: 'menu', onClick: (event) => {
      prioritise(); sidebar.classList.add('as-sheet');
      // With the buttons at the top of a short page, the menu opens just under the Menu button.
      const button = event.currentTarget.getBoundingClientRect();
      const atTop = bar.classList.contains('is-inline');
      sidebar.classList.toggle('opens-down', atTop);
      sidebar.style.setProperty('--menu-top', atTop ? `${Math.round(button.bottom + 8)}px` : '');
      sidebar.style.setProperty('--menu-right', atTop ? `${Math.max(12, Math.round(window.innerWidth - button.right))}px` : '');
      toggle()?.click();
    } })];
    // Keep the highlighted item in step with the open dashboard section.
    const sources = [null, overview, ...picks, null];
    const syncActive = () => sources.forEach((source, index) => {
      const on = Boolean(source && source.matches('.is-active, [aria-current="page"]'));
      items[index].classList.toggle('is-active', on);
    });
    new MutationObserver(syncActive).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    syncActive();
    return items;
  }

  function siteItems() {
    const path = location.pathname;
    const onHome = path === '/' && !location.search && location.hash !== '#calendar';
    return [
      back(),
      makeItem({ label: 'Home', icon: 'home', href: '/', active: onHome }),
      makeItem({ label: 'Feed', icon: 'feed', href: '/pages/feed.html', active: path === '/pages/feed.html' }),
      makeItem({ label: 'Events', icon: 'events', href: '/pages/events.html', active: path === '/pages/events.html' })
    ];
  }

  function build() {
    const sidebar = [...document.querySelectorAll('.committee-sidebar, #presidentSidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar')]
      .find((el) => el.querySelector('a, button') && !el.closest('[hidden], .view:not(.active)'));
    const items = (sidebar && dashboardItems(sidebar)) || siteItems();
    bar.replaceChildren(...items);
    bar.dataset.kind = sidebar ? 'dashboard' : 'site';
  }

  build();
  document.body.append(bar);
  // The home page switches between views (home, club dashboard); rebuild when that happens.
  let rebuildQueued = false;
  new MutationObserver(() => {
    if (rebuildQueued) return;
    rebuildQueued = true;
    setTimeout(() => { rebuildQueued = false; const kind = bar.dataset.kind; build(); if (kind !== bar.dataset.kind) show(); }, 300);
  }).observe(document.querySelector('main') || document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  // Short pages have nothing to scroll, so a floating bar would sit on the footer:
  // there the bar becomes a row of pill buttons at the top of the content instead.
  const host = () => document.querySelector('main') || document.querySelector('.page-shell, .container');
  let placing = false;
  const place = () => {
    if (placing) return;
    placing = true;
    const inline = bar.classList.contains('is-inline');
    const contentHeight = document.documentElement.scrollHeight - (inline ? bar.offsetHeight + 12 : 0);
    const short = small.matches && contentHeight <= window.innerHeight + 220 && host();
    if (short && !inline) { bar.classList.add('is-inline'); host().prepend(bar); show(); }
    else if (!short && inline) { bar.classList.remove('is-inline'); document.body.append(bar); }
    placing = false;
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(place)).observe(document.body);
  window.addEventListener('resize', place);
  const setOn = () => document.body.classList.toggle('has-bottom-bar', small.matches);
  small.addEventListener('change', setOn);
  setOn();
  setTimeout(place, 800);

  // Slide away when the footer comes into view; come back as soon as the visitor scrolls up.
  let lastY = window.scrollY, footerVisible = false;
  const show = () => { bar.classList.remove('is-away'); document.body.classList.remove('bottom-bar-away'); };
  const hide = () => { bar.classList.add('is-away'); document.body.classList.add('bottom-bar-away'); };
  const footer = document.querySelector('footer, .site-footer, #site-footer');
  if (footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { footerVisible = entry.isIntersecting; if (!footerVisible) show(); }, { rootMargin: '0px 0px -40px 0px' }).observe(footer);
  }
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (bar.classList.contains('is-inline')) return;
    if (y < lastY - 4) show();
    else if (y > lastY + 4 && footerVisible) hide();
    lastY = y;
  }, { passive: true });
})();
