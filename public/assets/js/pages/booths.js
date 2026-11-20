// Booths page logic (public/pages/booths.html)
(function () {
  const listEl = document.getElementById('boothsList');
  const detailEl = document.getElementById('boothDetail');
  const backBtn = document.getElementById('boothBack');
  const detailImg = document.getElementById('detailImg');
  const detailClub = document.getElementById('detailClub');
  const detailTitle = document.getElementById('detailTitle');
  const detailMeta = document.getElementById('detailMeta');
  const detailDesc = document.getElementById('detailDesc');

  const parseDate = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const escapeHtml = window.MiuUI.escapeHtml;

  let items = [];
  const nice = (value) => { const d = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(`${value}T00:00:00`) : null; return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : (value || ''); };
  const time = (value) => (value ? (window.formatSiteTime?.(value) || value) : '');
  const opens = (booth) => { const date = booth.boothOpenDate || booth.date; return date ? `Opens ${nice(date)}${booth.boothOpenTime ? ` · ${time(booth.boothOpenTime)}` : ''}` : ''; };

  function renderList() {
    const booths = items;
    if (!booths.length) {
      listEl.innerHTML = '<p class="events-empty">No approved booths right now.</p>';
      return;
    }
    listEl.innerHTML = booths.map((booth) => `
      <button type="button" class="event-timeline-item sponsor-timeline-item booth-timeline-item" data-club="${booth.clubId}" data-idx="${booth.index}">
        <span class="event-timeline-marker" aria-hidden="true"></span>
        <span class="event-timeline-content">
          <span class="event-timeline-header">
            <img src="${escapeHtml((window.miuImage || String)(booth.clubImage, 160))}" alt="" class="feed-timeline-avatar" loading="lazy" decoding="async" />
            <span class="event-timeline-meta">
              <span class="event-tile-club">${escapeHtml(booth.clubName || '')}</span>
              <span class="feed-timeline-date">Campus booth</span>
            </span>
          </span>
          <span class="event-timeline-body">
            <strong class="feed-timeline-title">${escapeHtml(booth.title || booth.boothName || 'Booth')}</strong>
            <span class="booth-chips">
              ${opens(booth) ? `<span class="booth-chip">${escapeHtml(opens(booth))}</span>` : ''}
              ${booth.boothLocation ? `<span class="booth-chip">${escapeHtml(booth.boothLocation)}</span>` : ''}
            </span>
            <span class="event-timeline-link">View booth details &rarr;</span>
          </span>
        </span>
      </button>`).join('');
    listEl.querySelectorAll('.booth-timeline-item').forEach((tile) => {
      tile.addEventListener('click', () => openDetail(Number(tile.dataset.club), Number(tile.dataset.idx)));
    });
  }

  function openDetail(clubId, idx) {
    const booth = items.find(item => Number(item.clubId) === Number(clubId) && Number(item.index) === Number(idx));
    const club = booth ? { name: booth.clubName, image: booth.clubImage } : null;
    if (!booth) return;
    detailImg.src = club.image || '';
    detailClub.textContent = club.name || '';
    detailTitle.textContent = booth.title || booth.boothName || 'Booth';
    const facts = [['Location', booth.boothLocation], ['Opens', nice(booth.boothOpenDate || booth.date)], ['Time', time(booth.boothOpenTime)], ['Closes', nice(booth.boothCloseDate)]].filter(([, value]) => value);
    document.getElementById('detailFacts').innerHTML = facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    detailDesc.textContent = booth.boothDescription || booth.description || '';
    detailDesc.hidden = !detailDesc.textContent;
    detailEl.classList.remove('hidden');
    detailEl.querySelector('.event-modal-panel').scrollTop = 0;
    document.body.classList.add('modal-open');
  }

  function showList() {
    detailEl.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  if (backBtn) backBtn.addEventListener('click', showList);
  if (detailEl) {
    detailEl.addEventListener('click', (event) => { if (event.target === detailEl) showList(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !detailEl.classList.contains('hidden')) showList();
    });
  }

  const pager = window.MiuPagination.create({ section: 'booths', list: listEl,
    render(rows) { items = rows.map(row => ({ ...row.item, clubId: row.club.id, clubName: row.club.name, clubImage: row.club.image, index: row.index })); renderList(); },
    onError(error) { if (!items.length) listEl.textContent = error.message; }
  });
  void pager.load();
  window.siteStartup.watch(() => pager.load());
})();
