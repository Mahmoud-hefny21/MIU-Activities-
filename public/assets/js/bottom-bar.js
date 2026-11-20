// Bottom navigation bar for phones and tablets.
// Students and visitors get the main site sections; each dashboard gets its own most useful
// sections plus Back and Menu. It slides away near the footer and comes back on scroll up.
(() => {
  'use strict';
  const small = window.matchMedia('(max-width: 1024px)');
  // Sign-in, password and error pages are single-purpose screens: no bottom bar there.
  const standalone = /(?:forgot-password|reset-password|applicant-login|admin-login|club-login|\/login|404|500|offline)(?:\.html)?$/.test(location.pathname)
    || document.querySelector('.home-action, .retry-action, .error-reference');
  if (document.querySelector('.bottom-bar') || standalone) return;

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
hub: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18"/>',
    sponsors: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    booths: '<path d="M3 9h18l-1.5-5h-15z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
    ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/>',
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
    const picks = [...rest].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
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
      // Admin has no slide-out drawer: list every section in the small pop-up menu instead.
      if (sidebar.id === 'dashboardNavigation') {
        if (!siteMenu.hidden) { closeSiteMenu(); return; }
        siteMenu.replaceChildren(...links.map((link) => {
          const el = document.createElement('button'); el.type = 'button'; el.className = 'bottom-bar-menu-item'; el.setAttribute('role', 'menuitem');
          el.innerHTML = `${svg(iconFor(link, link === overview))}<span></span>`; el.querySelector('span').textContent = labelOf(link).replace(/\s*\d+$/, '');
          if (link.matches('.is-active, [aria-pressed="true"]')) el.setAttribute('aria-current', 'page');
          el.addEventListener('click', () => { closeSiteMenu(); link.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
          return el;
        }));
        if (!siteMenu.isConnected) document.body.append(siteMenu);
        siteMenu.hidden = false; event.currentTarget.setAttribute('aria-expanded', 'true'); event.currentTarget.dataset.siteMenu = '';
        siteMenu.querySelector('button')?.focus({ preventScroll: true });
        return;
      }
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

  // Visitors and students: Back (inner pages), the four main sections and Menu. Menu holds everything else
  // (Calendar, Sponsors, Booths, Ask AI), so nothing appears twice.
  const siteMenu = document.createElement('div');
  siteMenu.className = 'bottom-bar-menu'; siteMenu.hidden = true; siteMenu.id = 'bottomBarMenu';
  siteMenu.setAttribute('role', 'menu'); siteMenu.setAttribute('aria-label', 'More pages');
  const closeSiteMenu = () => { siteMenu.hidden = true; bar.querySelector('[data-site-menu]')?.setAttribute('aria-expanded', 'false'); bar.querySelector('[data-site-menu]')?.classList.remove('is-active'); };
  document.addEventListener('click', (event) => { if (!siteMenu.hidden && !siteMenu.contains(event.target) && !event.target.closest('[data-site-menu]')) closeSiteMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !siteMenu.hidden) closeSiteMenu(); });
  function siteMenuEntries(onHome) {
    const entry = (label, icon, href, onClick) => {
      const el = document.createElement(href ? 'a' : 'button');
      el.className = 'bottom-bar-menu-item'; el.setAttribute('role', 'menuitem');
      if (href) { el.href = href; if (location.pathname === href.split('#')[0] && !href.includes('#')) el.setAttribute('aria-current', 'page'); } else el.type = 'button';
      el.innerHTML = `${svg(icon)}<span>${label}</span>`;
      el.addEventListener('click', () => { closeSiteMenu(); onClick?.(); });
      return el;
    };
    const askAi = document.querySelector('#navLinks a[href="/pages/ask-ai.html"]');
    const onBar = new Set([...bar.querySelectorAll('a[href]')].map((el) => new URL(el.href).pathname));
    return [
      ...[['MIU Hub', 'hub', '/pages/miu-hub.html'], ['Events', 'events', '/pages/events.html'], ['Feed', 'feed', '/pages/feed.html']]
        .filter(([, , href]) => !onBar.has(href)).map(([label, icon, href]) => entry(label, icon, href)),
      entry('Calendar', 'calendar', '/#calendar'),
      entry('Sponsors', 'sponsors', '/pages/sponsors.html'),
      entry('Booths', 'booths', '/pages/booths.html'),
      ...(askAi && !askAi.hidden ? [entry('Ask AI', 'ai', '/pages/ask-ai.html')] : [])
    ];
  }
  function siteItems() {
    const path = location.pathname;
    // Only the Home list itself counts as Home; a club view, My Forms or a form opened on / gets Back.
    const onHome = path === '/' && location.hash !== '#calendar' && (!location.search || Boolean(document.querySelector('#homeView.active'))) && !document.querySelector('#clubView.active, #myFormsView.active, #applicationView.active, #signInView.active');
    const menuButton = makeItem({ label: 'Menu', icon: 'menu', onClick: () => {
      if (!siteMenu.hidden) { closeSiteMenu(); return; }
      siteMenu.replaceChildren(...siteMenuEntries(onHome));
      siteMenu.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); menuButton.classList.add('is-active');
      siteMenu.querySelector('a, button')?.focus({ preventScroll: true });
    } });
    menuButton.dataset.siteMenu = ''; menuButton.setAttribute('aria-haspopup', 'menu'); menuButton.setAttribute('aria-controls', siteMenu.id); menuButton.setAttribute('aria-expanded', 'false');
    if (!siteMenu.isConnected) document.body.append(siteMenu);
    // Always five buttons. Home: Home, MIU Hub, Events, Feed, Menu.
    // Every other page: Back, Home, two shortcuts, Menu. A page opened from the menu (Feed, Sponsors,
    // Booths, Ask AI) takes the first shortcut and is highlighted, so visitors always see where they are.
    const pages = {
      '/pages/miu-hub.html': ['MIU Hub', 'hub'], '/pages/events.html': ['Events', 'events'], '/pages/feed.html': ['Feed', 'feed'],
      '/pages/sponsors.html': ['Sponsors', 'sponsors'], '/pages/booths.html': ['Booths', 'booths'], '/pages/ask-ai.html': ['Ask AI', 'ai']
    };
    const link = (href) => makeItem({ label: pages[href][0], icon: pages[href][1], href, active: path === href });
    if (onHome) return [makeItem({ label: 'Home', icon: 'home', href: '/', active: true }), link('/pages/miu-hub.html'), link('/pages/events.html'), link('/pages/feed.html'), menuButton];
    const shortcuts = ['/pages/miu-hub.html', '/pages/events.html'];
    if (pages[path] && !shortcuts.includes(path)) shortcuts[0] = path;
    return [back(), makeItem({ label: 'Home', icon: 'home', href: '/', active: false }), ...shortcuts.map(link), menuButton];
  }

  function build() {
    const sidebar = [...document.querySelectorAll('.committee-sidebar, #presidentSidebar, .president-sidebar, .student-dashboard-sidebar, .report-admin-sidebar, .v2-sidebar #dashboardNavigation')]
      .find((el) => el.querySelector('a, button') && !el.closest('[hidden], .view:not(.active)'));
    const items = (sidebar && dashboardItems(sidebar)) || siteItems();
    bar.replaceChildren(...items);
    bar.dataset.kind = sidebar ? 'dashboard' : 'site';
    bar.style.setProperty('--bb-count', String(items.length));
    requestAnimationFrame(fitLabels);
    // The site bar replaces the header's mobile menu, so that menu is hidden to avoid showing links twice.
    document.body.classList.toggle('bottom-bar-site', !sidebar);
    if (sidebar) closeSiteMenu?.();
  }

  // A label that is still too wide for its button gets slightly smaller text instead of being cut off.
  function fitLabels() {
    bar.querySelectorAll('.bottom-bar-label').forEach((label) => {
      label.style.fontSize = '';
      let size = 0.95;
      for (; label.scrollWidth > label.clientWidth + 1 && size >= (bar.classList.contains("is-inline") ? 0.72 : 0.9); size -= 0.05) label.style.fontSize = `${size.toFixed(2)}em`;
      // One more small step for a label that had to shrink, so sub-pixel rounding never shows "…".
      if (label.style.fontSize) label.style.fontSize = `${(size - 0.05).toFixed(2)}em`;
    });
  }
  window.addEventListener('resize', () => requestAnimationFrame(fitLabels));
  // The web font can arrive after the first check and make labels wider; check again then.
  document.fonts?.ready.then(() => requestAnimationFrame(fitLabels));
  window.addEventListener('load', () => requestAnimationFrame(fitLabels), { once: true });

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
  // The footer can be added after the bar starts (Home), so it is looked up on scroll.
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const footer = document.querySelector('.site-footer, footer');
    const wasVisible = footerVisible;
    footerVisible = !!footer && footer.getBoundingClientRect().top < window.innerHeight - 40;
    if (wasVisible && !footerVisible) show();
    if (bar.classList.contains('is-inline')) return;
    const atEnd = footerVisible && y + window.innerHeight >= document.documentElement.scrollHeight - 8;
    if (atEnd || (y > lastY + 4 && footerVisible)) hide();
    else if (y < lastY - 4) show();
    lastY = y;
  }, { passive: true });
})();
