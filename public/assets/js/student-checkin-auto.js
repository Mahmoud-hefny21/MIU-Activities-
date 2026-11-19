// Student dashboard: attendance check-in opens by itself. For every event the student registered for,
// check-in opens 30 minutes before the start (the server decides the window). When it opens, a banner
// appears at the top of the dashboard and the personal attendance QR opens once for that event.
(() => {
  'use strict';
  const main = document.querySelector('.student-dashboard-main');
  if (!main) return;
  const seenKey = (item) => `miu-checkin-opened:${item.source}:${item.clubId}:${item.eventRequestId || item.eventIndex}`;
  const qrUrl = (item) => '/pages/attendance-qr.html?' + new URLSearchParams({ source: item.source, clubId: String(item.clubId), eventIndex: String(item.eventIndex), ...(item.eventRequestId ? { eventRequestId: String(item.eventRequestId) } : {}) });
  const visible = () => main.offsetParent !== null && document.visibilityState === 'visible';
  const remember = (key) => { try { localStorage.setItem(key, '1'); } catch { /* storage blocked: the banner still shows */ } };
  const opened = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
  let banner = null, timer = 0, loading = false;

  function render(openItems) {
    if (!openItems.length) { banner?.remove(); banner = null; return; }
    if (!banner) { banner = document.createElement('section'); banner.className = 'student-checkin-banner'; banner.setAttribute('role', 'status'); main.prepend(banner); }
    banner.replaceChildren(...openItems.map((item) => {
      const row = document.createElement('div'); row.className = 'student-checkin-row';
      const text = document.createElement('div');
      const label = document.createElement('span'); label.className = 'admin-eyebrow'; label.textContent = 'CHECK-IN IS OPEN';
      const title = document.createElement('strong'); title.textContent = item.title;
      const when = document.createElement('span'); when.textContent = [item.date, item.time ? (window.formatSiteTime?.(item.time) || item.time) : ''].filter(Boolean).join(' · ');
      text.append(label, title, when);
      const link = document.createElement('a'); link.className = 'primary-btn'; link.href = qrUrl(item); link.textContent = 'Show my attendance QR';
      row.append(text, link);
      return row;
    }));
  }

  async function check() {
    if (loading || !visible()) return;
    loading = true;
    try {
      const response = await fetch('/api/reverse-attendance/my-events', { cache: 'no-store' });
      if (!response.ok) { render([]); return; }
      const { items = [] } = await response.json();
      const open = items.filter((item) => item.checkIn?.state === 'open');
      render(open);
      // Open the QR by itself the first time an event's check-in opens.
      const first = open.find((item) => !opened(seenKey(item)));
      if (first) { remember(seenKey(first)); window.location.href = qrUrl(first); return; }
      // Wake up exactly when the next check-in opens (server clock), otherwise look again in a minute.
      const offset = items.find((item) => item.checkIn)?.checkIn.serverNow - Date.now() || 0;
      const nextOpen = Math.min(...items.filter((item) => item.checkIn?.state === 'waiting').map((item) => item.checkIn.opensAt - offset - Date.now()));
      clearTimeout(timer);
      timer = setTimeout(check, Math.max(5000, Math.min(60000, Number.isFinite(nextOpen) ? nextOpen + 500 : 60000)));
    } catch { clearTimeout(timer); timer = setTimeout(check, 60000); }
    finally { loading = false; }
  }

  // The dashboard view is shown and hidden in place; check whenever it becomes visible.
  new MutationObserver(() => { if (visible()) check(); }).observe(main.closest('.view, section, main') || document.body, { attributes: true, attributeFilter: ['class', 'hidden'] });
  document.addEventListener('visibilitychange', () => { if (visible()) check(); });
  check();
})();
