// MIU Hub (public/pages/miu-hub.html): official MIU and faculty events and announcements.
(function () {
  'use strict';
  const list = document.getElementById('miuHubList');
  const status = document.getElementById('miuHubStatus');
  const more = document.getElementById('miuHubMore');
  if (!list) return;
  const escapeHtml = window.MiuUI.escapeHtml;
  let type = '', page = 1, items = [], loading = false, loadId = 0;

  const formatDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  const postedOn = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `Posted ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`; };

  function card(item, index) {
    const publisher = item.organization || { name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' };
    const isEvent = item.type === 'event';
    const label = `${publisher.type === 'faculty' ? 'Faculty' : 'MIU'} ${isEvent ? 'Event' : 'Announcement'}`;
    const when = isEvent ? [formatDate(item.date) || 'Date to be announced', item.time ? (window.formatSiteTime?.(item.time) || item.time) : '', item.location].filter(Boolean).join(' · ') : '';
    const image = item.image && item.image !== publisher.image ? `<img src="${escapeHtml((window.miuImage || String)(item.image, 900))}" alt="${escapeHtml(item.title)}" class="feed-timeline-image" loading="lazy" decoding="async" />` : '';
    const interaction = !isEvent && item.interaction && item.interaction !== 'none' && window.studentFeedbackForm ? window.studentFeedbackForm('university', item.id, item.interaction, item.question, item.options) : '';
    return `<article class="feed-post-card miu-hub-card${item.upcoming ? ' is-upcoming' : ''}" id="post-${escapeHtml(String(item.id))}">
      <header class="feed-timeline-header"><img src="${escapeHtml((window.miuImage || String)(publisher.image, 160))}" alt="" class="feed-timeline-avatar university-brand-avatar" loading="lazy" decoding="async" /><span class="feed-timeline-meta"><span class="feed-timeline-club">${escapeHtml(publisher.name)}</span><span class="feed-timeline-date">${escapeHtml(postedOn(item.createdAt))}</span></span><span class="feed-post-type ${isEvent ? 'type-event' : 'type-feed'}">${escapeHtml(label)}</span></header>
      <div class="feed-timeline-body"><h2 class="feed-timeline-title">${escapeHtml(item.title)}</h2>${when ? `<p class="feed-timeline-date feed-event-meta">${escapeHtml(when)}</p>` : ''}${image}
        ${isEvent ? `<div class="feed-event-footer"><p class="feed-timeline-text">${escapeHtml(item.description || '')}</p><button class="primary-btn feed-post-action" type="button" data-hub-event="${index}" aria-haspopup="dialog">View event details</button></div>` : `<p class="feed-timeline-text">${escapeHtml(item.description || '')}</p>${interaction}`}
      </div></article>`;
  }

  function render() {
    list.innerHTML = items.map(card).join('');
    list.querySelectorAll('[data-hub-event]').forEach((button) => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.hubEvent)], publisher = item.organization || {};
      button.disabled = true;
      try { await window.openEventModal({ ...item, clubId: 0, clubName: publisher.name, clubImage: publisher.image, eventIndex: item.id, university: true, universityContentId: item.id }); }
      catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    }));
    // A link such as /pages/miu-hub.html#post-123 scrolls to that post once it is shown.
    const target = location.hash && list.querySelector(location.hash.replace(/[^#\w-]/g, ''));
    if (target && !target.dataset.focused) { target.dataset.focused = '1'; target.classList.add('is-highlighted'); setTimeout(() => target.classList.remove('is-highlighted'), 2500); target.scrollIntoView({ block: 'start' }); }
  }

  async function load(reset) {
    if (loading && !reset) return;
    const id = ++loadId; loading = true;
    if (reset) { page = 1; items = []; list.innerHTML = ''; status.hidden = false; status.textContent = 'Loading official updates…'; }
    more.disabled = true;
    try {
      const response = await fetch(`/api/miu-hub?page=${page}${type ? `&type=${type}` : ''}`, { cache: 'no-cache' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'MIU Hub could not be loaded.');
      if (id !== loadId) return;
      items = items.concat(data.items || []);
      const { totalPages = 1 } = data.pagination || {};
      status.hidden = items.length > 0;
      status.textContent = items.length ? '' : type === 'event' ? 'No official events yet.' : type === 'announcement' ? 'No official announcements yet.' : 'No official MIU or faculty updates yet.';
      more.hidden = page >= totalPages; page += 1;
      render();
    } catch (error) {
      if (id !== loadId) return;
      status.hidden = false; status.textContent = error.message;
    } finally { if (id === loadId) { loading = false; more.disabled = false; } }
  }

  document.querySelectorAll('[data-hub-filter]').forEach((button) => button.addEventListener('click', () => {
    type = button.dataset.hubFilter;
    document.querySelectorAll('[data-hub-filter]').forEach((other) => { const on = other === button; other.classList.toggle('is-active', on); other.setAttribute('aria-pressed', String(on)); });
    void load(true);
  }));
  more.addEventListener('click', () => void load(false));
  void load(true);
  window.siteStartup?.watch?.(() => load(true));
})();
