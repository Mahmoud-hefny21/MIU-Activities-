// Read-only event information using the site's existing modal primitives/styles.
(() => {
  let active = null;
  const text = value => ['string', 'number'].includes(typeof value) ? String(value).trim() : '';
  function dateLabel(value) {
    if (!text(value)) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  // Finished club events: the approved post-event report (totals, average rating and photos).
  async function appendEventReport(copy, { clubId, eventIndex }, signal) {
    let data;
    try {
      const response = await fetch(`/api/event-feedback/${clubId}/${eventIndex}`, { cache: 'no-store', credentials: 'same-origin', signal });
      if (!response.ok) return;
      data = await response.json();
    } catch { return; }
    if (!data.completed || signal.aborted) return;
    const section = document.createElement('section');
    section.className = 'event-report-summary';
    section.setAttribute('aria-labelledby', 'eventReportSummaryTitle');
    const heading = document.createElement('h3');
    heading.id = 'eventReportSummaryTitle';
    heading.textContent = 'Event report';
    section.append(heading);
    if (data.reportStatus !== 'approved') {
      const note = document.createElement('p');
      note.className = 'event-modal-meta';
      note.textContent = data.reportStatus === 'in_review'
        ? 'This event has ended. Its report is being reviewed; photos and results appear here once it is approved.'
        : 'This event has ended. Photos and results appear here once the club’s report is approved.';
      section.append(note);
    } else {
      const stats = document.createElement('dl');
      stats.className = 'event-report-stats';
      const rating = data.report.rating;
      for (const [term, value] of [
        ['Participants (MIU)', data.report.totalParticipants],
        ['External beneficiaries', data.report.externalBeneficiaries],
        ['Student rating', rating.count ? `${rating.average} / 5 (${rating.count})` : 'No ratings yet']
      ]) {
        if (value === null || value === undefined) continue;
        const item = document.createElement('div');
        const dt = document.createElement('dt'); dt.textContent = term;
        const dd = document.createElement('dd'); dd.textContent = typeof value === 'number' ? value.toLocaleString('en-US') : value;
        item.append(dt, dd); stats.append(item);
      }
      section.append(stats);
      if (data.photos.length) {
        const list = document.createElement('ul');
        list.className = 'event-report-photos';
        data.photos.forEach((photo, index) => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = photo.url; link.target = '_blank'; link.rel = 'noopener';
          link.setAttribute('aria-label', `Open event photo ${index + 1} in a new tab`);
          const image = document.createElement('img');
          image.src = photo.url; image.alt = `Event photo ${index + 1}`; image.loading = 'lazy';
          link.append(image); item.append(link); list.append(item);
        });
        section.append(list);
      }
    }
    const more = document.createElement('a');
    more.className = 'secondary-btn event-report-link';
    more.href = `/pages/event.html?club=${encodeURIComponent(clubId)}&event=${encodeURIComponent(eventIndex)}`;
    more.textContent = data.evaluation?.open ? 'Open event page to rate it' : 'Open event page';
    section.append(more);
    copy.append(section);
  }

  window.openEventInfoPopup = (event, trigger = document.activeElement, type = 'event') => {
    if (!event) return;
    active?.close(false);
    const controller = new AbortController();
    const { signal } = controller;
    const modal = document.createElement('div');
    modal.id = 'eventCardInfoModal';
    modal.className = 'event-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'eventCardInfoTitle');
    const panel = document.createElement('article');
    panel.className = 'event-modal-panel';
    panel.tabIndex = -1;
    const closeButton = window.MiuUI.button('\u00d7', 'calendar-close-btn event-modal-close', () => close());
    closeButton.style.color = 'var(--text-main)';
    const label = ({ event: 'Event', feed: 'Feed', sponsor: 'Sponsor', booth: 'Booth' })[type] || 'Item';
    closeButton.setAttribute('aria-label', `Close ${label.toLowerCase()} information`);
    const copy = document.createElement('div');
    copy.className = 'event-modal-copy';
    const append = (tag, className, content) => {
      if (!text(content)) return null;
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = content;
      copy.append(element);
      return element;
    };
    append('span', 'event-modal-club', text(event.clubName));
    const heading = append('h2', '', text(event.title) || text(event.boothName) || text(event.sponsorName) || label);
    heading.id = 'eventCardInfoTitle';
    const formatTime = value => text(value) ? window.formatSiteTime ? window.formatSiteTime(value) : text(value) : '';
    const time = [formatTime(event.time), formatTime(event.endTime)].filter(Boolean).join(' – ');
    append('p', 'event-modal-meta', [dateLabel(event.date), time, text(event.location)].filter(Boolean).join(' · '));
    const description = append('p', 'event-modal-description', text(event.text) || text(event.description));
    if (description) {
      description.id = 'eventCardInfoDescription';
      description.style.overflowWrap = 'anywhere';
      description.style.whiteSpace = 'pre-wrap';
      modal.setAttribute('aria-describedby', description.id);
    }
    if (text(event.text) && text(event.description) && text(event.text) !== text(event.description)) {
      const extra = append('p', 'event-modal-description', text(event.description));
      extra.style.whiteSpace = 'pre-wrap';
      extra.style.overflowWrap = 'anywhere';
    }
    const detailFields = {
      feed: [['author', 'Author']],
      sponsor: [['sponsorName', 'Sponsor'], ['sponsorCompany', 'Company'], ['sponsorDescription', 'About the sponsor']],
      booth: [['boothName', 'Booth'], ['boothDescription', 'About the booth'], ['boothLocation', 'Location'], ['boothOpenDate', 'Opens'], ['boothCloseDate', 'Closes']]
    };
    for (const [key, title] of detailFields[type] || []) {
      if (!text(event[key])) continue;
      const detail = append('p', 'event-modal-description', `${title}: ${text(event[key])}`);
      detail.style.whiteSpace = 'pre-wrap';
      detail.style.overflowWrap = 'anywhere';
    }
    if (typeof event.registrationEnabled === 'boolean') append('p', 'event-modal-meta', 'Student registration: ' + (event.registrationEnabled ? 'Enabled' : 'Not enabled'));
    if ((event.registrationEnabled || event.attendanceEnabled) && ['members', 'all_students'].includes(event.attendanceAudience)) append('p', 'event-modal-meta', event.attendanceAudience === 'members' ? 'Club members only' : 'Open to all university students');
    if (event.attendanceEnabled === true) append('p', 'event-attendance-status', 'Attendance taken');
    if (type === 'event' && event.reportRef) void appendEventReport(copy, event.reportRef, signal);
    const closeRail = document.createElement('div');
    closeRail.className = 'modal-close-rail';
    closeRail.style.gridColumn = '1 / -1';
    closeRail.append(closeButton);
    panel.append(closeRail);
    const source = type === 'sponsor' ? text(event.sponsorLogo) : type === 'booth' ? '' : text(event.image) || text(event.clubImage);
    let imageUrl;
    try {
      const url = new URL(source, location.origin);
      if (source && (['http:', 'https:'].includes(url.protocol) || /^data:image\//i.test(source))) imageUrl = url.href;
    } catch { /* Missing or invalid optional media is omitted. */ }
    const omitImage = () => {
      panel.querySelector('.event-modal-image')?.remove();
      panel.style.gridTemplateColumns = 'minmax(0, 1fr)';
    };
    if (imageUrl) {
      const video = type === 'feed' && window.FeedMedia?.isVideo(imageUrl);
      const image = document.createElement(video ? 'video' : 'img');
      image.className = 'event-modal-image';
      if (video) {
        image.controls = true;
        image.playsInline = true;
        image.preload = 'none';
        image.poster = window.FeedMedia.poster(imageUrl);
        image.setAttribute('aria-label', text(event.title) || 'Feed video');
      } else image.alt = text(event.title) || `${label} image`;
      image.addEventListener('error', omitImage, { signal });
      image.src = imageUrl;
      panel.append(image);
    } else omitImage();
    panel.append(copy); modal.append(panel);
    const hadScrollLock = document.body.classList.contains('modal-open');
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children].map(element => [element, element.inert]);
    document.body.append(modal);
    background.forEach(([element]) => { element.inert = true; });
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    let closed = false;
    function close(restoreFocus = true) {
      if (closed) return;
      closed = true;
      panel.querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
      controller.abort();
      window.MiuUI.modals.close(modal);
      modal.remove();
      background.forEach(([element, wasInert]) => { if (element.isConnected) element.inert = wasInert; });
      document.body.style.overflow = previousOverflow;
      if (!hadScrollLock) document.body.classList.remove('modal-open');
      if (active?.modal === modal) active = null;
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
    active = { modal, close };
    modal.addEventListener('click', click => { if (click.target === modal) close(); }, { signal });
    document.addEventListener('keydown', key => {
      if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); close(); return; }
      if (key.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length);
      const first = focusable[0] || panel, last = focusable.at(-1) || panel;
      if (key.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { key.preventDefault(); last.focus(); }
      else if (!key.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { key.preventDefault(); first.focus(); }
    }, { capture: true, signal });
    window.addEventListener('pagehide', () => close(false), { once: true, signal });
    window.MiuUI.modals.open(modal);
    closeButton.focus({ preventScroll: true });
  };
  window.openClubContentInfoPopup = (item, type, club, trigger) => {
    const eventIndex = type === 'event' && Array.isArray(club.events) ? club.events.indexOf(item) : -1;
    const reportRef = eventIndex >= 0 && Number(club.id) > 0 ? { clubId: Number(club.id), eventIndex } : null;
    window.openEventInfoPopup({ ...item, clubName: club.name, clubImage: club.image, reportRef }, trigger, type);
  };
})();
