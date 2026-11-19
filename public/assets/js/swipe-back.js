// iPhone-style swipe back for phones and tablets: drag from the left edge and the page follows the
// finger; let go past the threshold to go back (through the same miuGoBack the Back buttons use).
(() => {
  'use strict';
  const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (!touch || !window.miuGoBack || !window.miuCanGoBack) return;
  // iOS Safari (outside the installed app) already has its own native swipe back; adding ours would go back twice.
  const iOS = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (iOS && !installed) return;

  const EDGE = 28;             // gesture must start this close to the left edge
  const LOCK = 10;             // movement before deciding horizontal vs vertical
  const small = window.matchMedia('(max-width: 1024px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const page = document.body;
  const root = document.documentElement;

  let startX = 0, startY = 0, lastX = 0, lastTime = 0, velocity = 0, width = 1;
  let state = 'idle';          // idle → pending → dragging
  let navigating = false;

  // Never take over a gesture meant for something else.
  const blocked = (target) => {
    if (document.querySelector('dialog[open], .drawer-open, .bottom-bar-menu:not([hidden]), .event-modal:not(.hidden)')) return true;
    if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe-back], .leaflet-container, canvas, video')) return true;
    for (let el = target; el && el !== page; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.scrollLeft > 0) return true;
    }
    return false;
  };

  const setOffset = (x) => {
    page.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    page.style.boxShadow = x ? `-12px 0 28px rgba(15, 23, 42, ${Math.max(0, 0.22 - (x / width) * 0.22).toFixed(3)})` : '';
    root.style.setProperty('--swipe-back-shade', String(Math.max(0, 0.32 - (x / width) * 0.32)));
  };
  const begin = () => { root.classList.add('swipe-back-active'); page.style.willChange = 'transform'; page.style.transition = 'none'; };
  const finish = () => { root.classList.remove('swipe-back-active'); page.style.willChange = ''; page.style.transition = ''; setOffset(0); state = 'idle'; };
  const animateTo = (x, duration, done) => {
    if (reduced.matches) { done?.(); return; }
    page.style.transition = `transform ${duration}ms cubic-bezier(.2, .8, .2, 1), box-shadow ${duration}ms ease`;
    requestAnimationFrame(() => setOffset(x));
    window.setTimeout(() => done?.(), duration);
  };

  document.addEventListener('touchstart', (event) => {
    if (navigating || state !== 'idle' || event.touches.length !== 1 || !small.matches) return;
    const point = event.touches[0];
    if (point.clientX > EDGE || !window.miuCanGoBack() || blocked(event.target)) return;
    startX = lastX = point.clientX; startY = point.clientY; lastTime = event.timeStamp; velocity = 0;
    width = window.innerWidth; state = 'pending';
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (state === 'idle') return;
    const point = event.touches[0], dx = point.clientX - startX, dy = point.clientY - startY;
    if (state === 'pending') {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      // Mostly vertical, or moving left: this is a scroll, leave it alone.
      if (Math.abs(dy) > Math.abs(dx) || dx <= 0) { state = 'idle'; return; }
      state = 'dragging'; begin();
    }
    event.preventDefault();
    const now = event.timeStamp;
    if (now > lastTime) velocity = (point.clientX - lastX) / (now - lastTime);
    lastX = point.clientX; lastTime = now;
    if (!reduced.matches) setOffset(Math.max(0, Math.min(width, dx)));
  }, { passive: false });

  const release = () => {
    if (state === 'pending') { state = 'idle'; return; }
    if (state !== 'dragging') return;
    const dx = lastX - startX;
    const goBack = dx > width * 0.35 || (velocity > 0.5 && dx > 40);
    if (!goBack) { animateTo(0, 260, finish); return; }
    navigating = true;
    animateTo(width, 220, () => {
      let left = false;
      const onHide = () => { left = true; };
      window.addEventListener('pagehide', onHide, { once: true });
      window.miuGoBack(location.pathname);
      // In-page Back (dashboard sections) or a cancelled leave keeps this page: bring it back into view.
      window.setTimeout(() => { window.removeEventListener('pagehide', onHide); if (!left) { finish(); navigating = false; } }, 700);
    });
  };
  document.addEventListener('touchend', release, { passive: true });
  document.addEventListener('touchcancel', () => { if (state === 'dragging') animateTo(0, 200, finish); else state = 'idle'; }, { passive: true });
  // Coming back with the browser cache must never show a page that is still slid away.
  window.addEventListener('pageshow', () => { navigating = false; finish(); });
})();
