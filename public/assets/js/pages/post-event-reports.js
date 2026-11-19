// Post-event reports: presidents report on finished events; Supervisor, PR, English and Dean review them in order.
(() => {
  'use strict';
  const statusEl = document.getElementById('perStatus');
  const overviewEl = document.getElementById('perOverview');
  const detailEl = document.getElementById('perDetail');
  const titleEl = document.getElementById('perTitle');
  const photoDialog = document.getElementById('perPhotoDialog');
  const photoLarge = document.getElementById('perPhotoLarge');
  const MAX_PHOTOS = 12;
  const STATUS_CLASS = {
    missing: 'is-required', draft: 'is-draft', changes_requested: 'is-changes', approved: 'is-approved',
    pending_supervisor: 'is-pending', pending_pr: 'is-pending', pending_english: 'is-pending', pending_dean: 'is-pending'
  };
  let overview = null;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }
  const pill = (status, label) => el('span', { className: `per-pill ${STATUS_CLASS[status] || ''}`, text: label });
  const formatDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    return match ? new Date(+match[1], +match[2] - 1, +match[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (value || '—');
  };
  const formatTime = (value) => (value ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', isError);
    statusEl.hidden = !message;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/post-event-reports${path}`, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Please try again.'), { status: response.status });
    return data;
  }

  function openPhoto(url) {
    photoLarge.src = url;
    if (typeof photoDialog.showModal === 'function') photoDialog.showModal();
    else window.open(url, '_blank', 'noopener');
  }
  photoDialog.querySelector('[data-close-photo]').addEventListener('click', () => photoDialog.close());
  photoDialog.addEventListener('click', (event) => { if (event.target === photoDialog) photoDialog.close(); });

  function photoGrid(photos, onRemove) {
    if (!photos.length) return el('p', { className: 'per-muted', text: 'No photos added yet.' });
    return el('ul', { className: 'per-photos' }, photos.map((photo, index) => el('li', {}, [
      el('button', { type: 'button', className: 'per-photo', 'aria-label': `Open photo ${index + 1}`, onclick: () => openPhoto(photo.url) },
        el('img', { src: photo.url, alt: `Event photo ${index + 1}`, loading: 'lazy' })),
      onRemove ? el('button', { type: 'button', className: 'per-photo-remove', 'aria-label': `Remove photo ${index + 1}`, onclick: () => onRemove(index), text: 'Remove' }) : null
    ])));
  }

  function reportActionLabel(event) {
    if (event.status === 'missing') return 'Submit event report';
    if (event.status === 'draft') return 'Edit draft';
    if (event.status === 'changes_requested') return 'Edit and resubmit';
    if (['submitted', 'reviewed'].includes(event.status)) return 'Submit event report';
    return 'View report';
  }

  function openDetail(clubId, eventKey) {
    const url = new URL(location.href);
    url.searchParams.set('club', clubId);
    url.searchParams.set('event', eventKey);
    history.pushState({ per: true }, '', url);
    void loadDetail(clubId, eventKey);
  }

  function eventCard(event, { clubName, showClub } = {}) {
    return el('li', { className: `per-card${event.awaitingYou ? ' is-awaiting' : ''}` }, [
      el('div', { className: 'per-card-main' }, [
        showClub ? el('span', { className: 'per-card-club', text: clubName }) : null,
        el('strong', { className: 'per-card-title', text: event.title }),
        el('span', { className: 'per-muted', text: [formatDate(event.date), event.location].filter(Boolean).join(' · ') })
      ]),
      el('div', { className: 'per-card-side' }, [
        pill(event.status, event.statusLabel),
        event.awaitingYou ? el('span', { className: 'per-awaiting', text: 'Awaiting your decision' }) : null,
        !event.required && event.status === 'missing' ? el('span', { className: 'per-muted per-small', text: 'Optional (before reports were required)' }) : null,
        el('button', { type: 'button', className: event.awaitingYou || ['missing', 'draft', 'changes_requested'].includes(event.status) ? 'primary-btn' : 'secondary-btn',
          text: overview.role === 'president' ? reportActionLabel(event) : event.awaitingYou ? 'Review report' : 'View report',
          onclick: () => openDetail(event.club?.id || overview.club?.id, event.key) })
      ])
    ]);
  }

  function blockBanner(block) {
    return block.blocked
      ? el('div', { className: 'per-banner is-blocked', role: 'alert' }, [
        el('strong', { text: 'New event requests are paused' }),
        el('p', { text: `${block.message} Submit the reports marked “Report Required” or fix those with “Changes Requested”.` })])
      : el('div', { className: 'per-banner is-clear' }, [
        el('strong', { text: 'New event requests are open' }),
        el('p', { text: 'All required post-event reports are fully approved.' })]);
  }

  function renderOverview() {
    detailEl.hidden = true;
    overviewEl.replaceChildren();
    const role = overview.role;
    if (role === 'president') {
      titleEl.textContent = `${overview.club.name} — post-event reports`;
      overviewEl.append(blockBanner(overview.block));
      overviewEl.append(el('h2', { className: 'per-section-title', text: 'Completed events' }));
      overviewEl.append(overview.events.length
        ? el('ul', { className: 'per-list' }, overview.events.map((event) => eventCard(event)))
        : el('p', { className: 'per-empty', text: 'No completed events yet. After an approved event ends, you can report on it here.' }));
      overviewEl.append(el('p', { className: 'per-muted per-small', text: `Reports are required for events ending on or after ${formatDate(overview.requiredFrom)}. Earlier events can still be reported but do not pause new requests.` }));
    } else {
      titleEl.textContent = role === 'admin' ? 'Post-event reports — oversight' : 'Post-event reports to review';
      const awaiting = overview.reports.filter((report) => report.awaitingYou);
      const chips = [['missing', 'Missing'], ['draft', 'Drafts'], ['pending_supervisor', 'Pending Supervisor'], ['pending_pr', 'Pending PR'], ['pending_english', 'Pending English'], ['pending_dean', 'Pending Dean'], ['changes_requested', 'Changes Requested'], ['approved', 'Fully Approved']]
        .filter(([status]) => role === 'admin' || !['missing', 'draft'].includes(status));
      overviewEl.append(el('div', { className: 'per-stats' }, chips.map(([status, label]) => el('div', { className: 'per-stat' }, [
        el('strong', { text: String(overview.counts[status] || 0) }), el('span', { text: label })]))));
      if (role !== 'admin') {
        overviewEl.append(el('h2', { className: 'per-section-title', text: `Awaiting your decision (${awaiting.length})` }));
        overviewEl.append(awaiting.length
          ? el('ul', { className: 'per-list' }, awaiting.map((report) => eventCard(report, { clubName: report.club.name, showClub: true })))
          : el('p', { className: 'per-empty', text: 'Nothing is waiting for you right now.' }));
      }
      if (overview.blockedClubs) {
        overviewEl.append(el('h2', { className: 'per-section-title', text: `Clubs paused from new event requests (${overview.blockedClubs.length})` }));
        overviewEl.append(overview.blockedClubs.length
          ? el('ul', { className: 'per-blocked' }, overview.blockedClubs.map((club) => el('li', { text: `${club.name} — ${club.pending} report${club.pending === 1 ? '' : 's'} not fully approved` })))
          : el('p', { className: 'per-empty', text: 'No club is paused.' }));
      }
      const filter = el('select', { 'aria-label': 'Filter reports by status' }, [el('option', { value: '', text: 'All statuses' }),
        ...chips.map(([status, label]) => el('option', { value: status, text: label }))]);
      const list = el('ul', { className: 'per-list' });
      const fill = () => {
        const rows = overview.reports.filter((report) => !filter.value || report.status === filter.value);
        list.replaceChildren(...(rows.length ? rows.map((report) => eventCard(report, { clubName: report.club.name, showClub: true }))
          : [el('li', { className: 'per-empty', text: 'No reports match this filter.' })]));
      };
      filter.addEventListener('change', fill);
      overviewEl.append(el('div', { className: 'per-section-head' }, [el('h2', { className: 'per-section-title', text: 'All reports' }), filter]), list);
      fill();
    }
    overviewEl.hidden = false;
  }

  function stageTrack(data) {
    const report = data.event.report;
    const approvedRoles = new Set((report?.approvals || []).map((approval) => approval.role));
    const current = report?.status?.startsWith('pending_') ? report.status.slice(8) : '';
    return el('ol', { className: 'per-stages', 'aria-label': 'Approval progress' }, data.stages.map(({ stage, label }) => {
      const state = approvedRoles.has(stage) ? 'is-done' : stage === current ? 'is-current' : '';
      return el('li', { className: state }, [el('span', { className: 'per-stage-dot', 'aria-hidden': 'true' }),
        el('span', { text: label }), el('span', { className: 'visually-hidden', text: state === 'is-done' ? ' (approved)' : state === 'is-current' ? ' (current)' : '' })]);
    }));
  }

  function bars(rows, total, labelOf) {
    return el('ul', { className: 'per-bars' }, rows.map((row) => {
      const percent = total ? Math.round((row.count / total) * 100) : 0;
      return el('li', {}, [el('span', { className: 'per-bar-label', text: labelOf(row) }),
        el('span', { className: 'per-bar-track', 'aria-hidden': 'true' }, el('span', { className: 'per-bar-fill', style: `width:${percent}%` })),
        el('span', { className: 'per-bar-value', text: `${row.count} (${percent}%)` })]);
    }));
  }

  function evaluationSection(evaluation) {
    const section = el('section', { className: 'per-block', 'aria-labelledby': 'perEvalTitle' }, [el('h2', { id: 'perEvalTitle', text: 'Student evaluation results' })]);
    if (!evaluation.count) { section.append(el('p', { className: 'per-empty', text: 'No evaluations submitted yet.' })); return section; }
    section.append(el('div', { className: 'per-stats' }, [
      el('div', { className: 'per-stat' }, [el('strong', { text: `${evaluation.average} / 5` }), el('span', { text: 'Average rating' })]),
      el('div', { className: 'per-stat' }, [el('strong', { text: String(evaluation.count) }), el('span', { text: 'Responses' })])]));
    section.append(el('h3', { text: 'Rating distribution' }), bars(evaluation.distribution, evaluation.count, (row) => `${row.star} ★`));
    for (const question of evaluation.questions) {
      const block = el('div', { className: 'per-question' }, [el('h3', { text: question.text })]);
      if (question.kind === 'scale') block.append(el('p', { className: 'per-muted', text: question.average === null ? 'No answers yet.' : `Average ${question.average} / 5 from ${question.responses} answers` }), bars(question.distribution, question.responses, (row) => `${row.star} ★`));
      else if (question.kind === 'choice') block.append(bars(question.counts, question.responses, (row) => row.option));
      else block.append(question.answers.length ? el('ul', { className: 'per-quotes' }, question.answers.map((text) => el('li', { text }))) : el('p', { className: 'per-muted', text: 'No suggestions yet.' }));
      section.append(block);
    }
    if (evaluation.comments.length) section.append(el('h3', { text: 'Student feedback' }), el('ul', { className: 'per-quotes' }, evaluation.comments.map((text) => el('li', { text }))));
    section.append(el('p', { className: 'per-muted per-small', text: 'Responses are anonymous. Results update as students submit or edit their evaluations.' }));
    return section;
  }

  function historySection(report) {
    if (!report?.history?.length) return null;
    const labels = { draft_saved: 'Draft saved', submitted: 'Submitted', resubmitted: 'Resubmitted', approved: 'Approved', changes_requested: 'Changes requested' };
    const roles = { president: 'Club President', supervisor: 'Club Supervisor', pr: 'PR', english: 'English', dean: 'Dean' };
    return el('section', { className: 'per-block' }, [el('h2', { text: 'Approval history' }), el('ol', { className: 'per-history' },
      [...report.history].reverse().map((entry) => el('li', {}, [
        el('strong', { text: `${labels[entry.action] || entry.action} — ${roles[entry.role] || entry.role || ''}` }),
        el('span', { className: 'per-muted', text: `${entry.actor || ''} · ${formatTime(entry.at)}` }),
        entry.note ? el('p', { text: entry.note }) : null])))]);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  }
  async function uploadPhoto(file) {
    try {
      return await window.uploadImageToCloudinary(file, 'eventReport');
    } catch (error) {
      // Without Cloudinary the server accepts small images directly.
      if (!/not configured/i.test(error.message)) throw error;
      if (file.size > 1.5 * 1024 * 1024) throw new Error('Photo storage is not configured; choose images up to 1.5 MB.');
      return { url: await readFileAsDataUrl(file) };
    }
  }

  function editForm(data) {
    const report = data.event.report;
    const photos = [...(report?.photos || [])];
    const feedback = el('p', { className: 'admin-feedback', role: 'status', 'aria-live': 'polite' });
    const participants = el('input', { id: 'perParticipants', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: report?.totalParticipants ?? '' });
    const external = el('input', { id: 'perExternal', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: report?.externalBeneficiaries ?? '' });
    const photoHolder = el('div');
    const renderPhotos = () => photoHolder.replaceChildren(photoGrid(photos, (index) => { photos.splice(index, 1); renderPhotos(); }));
    const fileInput = el('input', { id: 'perPhotoInput', type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, className: 'visually-hidden' });
    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files]; fileInput.value = '';
      if (photos.length + files.length > MAX_PHOTOS) { feedback.textContent = `Add up to ${MAX_PHOTOS} photos.`; return; }
      for (const [index, file] of files.entries()) {
        feedback.textContent = `Uploading photo ${index + 1} of ${files.length}…`;
        try { photos.push(await uploadPhoto(file)); renderPhotos(); }
        catch (error) { feedback.textContent = error.message; return; }
      }
      feedback.textContent = `${files.length} photo${files.length === 1 ? '' : 's'} added. Save or submit to keep them.`;
    });
    renderPhotos();
    const changes = report?.status === 'changes_requested' ? [...(report.history || [])].reverse().find((entry) => entry.action === 'changes_requested') : null;
    const save = async (submit, button) => {
      const buttons = form.querySelectorAll('button'); buttons.forEach((item) => { item.disabled = true; });
      feedback.textContent = submit ? 'Submitting…' : 'Saving…';
      try {
        const result = await api(`/reports/${data.club.id}/${encodeURIComponent(data.event.key)}`, { method: 'PUT', body: JSON.stringify({
          revision: report?.revision || 0, submit, totalParticipants: participants.value === '' ? null : Number(participants.value),
          externalBeneficiaries: external.value === '' ? null : Number(external.value), photos }) });
        setStatus(result.message);
        await loadDetail(data.club.id, data.event.key);
      } catch (error) { feedback.textContent = error.message; buttons.forEach((item) => { item.disabled = false; }); button.focus(); }
    };
    const form = el('form', { className: 'per-block per-form', onsubmit: (event) => event.preventDefault() }, [
      el('h2', { text: 'Your report' }),
      changes ? el('div', { className: 'per-banner is-blocked' }, [el('strong', { text: 'Changes requested' }), el('p', { text: changes.note })]) : null,
      el('div', { className: 'per-fields' }, [
        el('label', { for: 'perParticipants' }, [el('span', { text: 'Total participants (inside MIU)' }), el('small', { text: 'Everyone from MIU who took part, in one number.' }), participants]),
        el('label', { for: 'perExternal' }, [el('span', { text: 'Total external beneficiaries' }), el('small', { text: 'People from outside MIU who benefited.' }), external])]),
      el('div', { className: 'per-photo-field' }, [
        el('span', { className: 'per-label', text: `Event photos (${MAX_PHOTOS} max)` }),
        el('small', { text: 'PNG, JPG or WebP. Students see them after the Dean approves the report.' }),
        photoHolder,
        el('label', { for: 'perPhotoInput', className: 'secondary-btn per-upload', text: 'Add photos' }), fileInput]),
      el('div', { className: 'per-actions' }, [
        el('button', { type: 'button', className: 'secondary-btn', text: 'Save draft', onclick: (event) => save(false, event.currentTarget) }),
        el('button', { type: 'button', className: 'primary-btn', text: report?.status === 'changes_requested' ? 'Resubmit report' : 'Submit report', onclick: (event) => save(true, event.currentTarget) })]),
      feedback]);
    return form;
  }

  function decisionForm(data) {
    const comment = el('textarea', { id: 'perDecisionComment', rows: '3', maxlength: '2000' });
    const feedback = el('p', { className: 'admin-feedback', role: 'status', 'aria-live': 'polite' });
    const decide = async (action, button) => {
      if (action === 'request_changes' && !comment.value.trim()) { feedback.textContent = 'Add a comment explaining the changes you need.'; comment.focus(); return; }
      const buttons = form.querySelectorAll('button'); buttons.forEach((item) => { item.disabled = true; });
      try {
        const result = await api(`/reports/${data.club.id}/${encodeURIComponent(data.event.key)}/decision`, { method: 'POST',
          body: JSON.stringify({ action, comment: comment.value, revision: data.event.report.revision }) });
        setStatus(result.message);
        await loadDetail(data.club.id, data.event.key);
      } catch (error) { feedback.textContent = error.message; buttons.forEach((item) => { item.disabled = false; }); button.focus(); }
    };
    const form = el('form', { className: 'per-block per-form', onsubmit: (event) => event.preventDefault() }, [
      el('h2', { text: 'Your decision' }),
      el('label', { for: 'perDecisionComment' }, [el('span', { text: 'Comment' }), el('small', { text: 'Required when requesting changes.' }), comment]),
      el('div', { className: 'per-actions' }, [
        el('button', { type: 'button', className: 'secondary-btn', text: 'Request changes', onclick: (event) => decide('request_changes', event.currentTarget) }),
        el('button', { type: 'button', className: 'primary-btn', text: 'Approve', onclick: (event) => decide('approve', event.currentTarget) })]),
      feedback]);
    return form;
  }

  function renderDetail(data) {
    overviewEl.hidden = true;
    const { event } = data;
    const report = event.report;
    titleEl.textContent = event.title;
    const back = el('button', { type: 'button', className: 'club-profile-back', onclick: () => { history.pushState({}, '', location.pathname); void route(); } },
      [el('span', { 'aria-hidden': 'true', text: '←' }), ' All reports']);
    const info = el('section', { className: 'per-block' }, [
      el('div', { className: 'per-section-head' }, [el('h2', { text: 'Event details' }), pill(event.status, event.statusLabel)]),
      el('dl', { className: 'per-info' }, [
        ['Club', event.clubName], ['Event', event.title], ['Date', formatDate(event.date)], ['Location', event.location || '—']
      ].flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })])),
      el('p', { className: 'per-muted per-small', text: 'These details come from the approved event and cannot be changed here.' })]);
    const summary = report && !data.canEdit ? el('section', { className: 'per-block' }, [
      el('h2', { text: 'Report' }),
      el('dl', { className: 'per-info' }, [
        el('dt', { text: 'Total participants (inside MIU)' }), el('dd', { text: report.totalParticipants ?? '—' }),
        el('dt', { text: 'Total external beneficiaries' }), el('dd', { text: report.externalBeneficiaries ?? '—' }),
        el('dt', { text: 'Submitted' }), el('dd', { text: formatTime(report.submittedAt) || '—' })]),
      el('h3', { text: 'Event photos' }), photoGrid(report.photos || [])]) : null;
    // Optional sections are null when they do not apply; skip them rather than printing "null".
    detailEl.replaceChildren(...[back, el('div', { className: 'per-detail-head' }, stageTrack(data)), info,
      data.canEdit ? editForm(data) : summary,
      !data.canEdit && !report ? el('p', { className: 'per-empty', text: 'The club president has not submitted this report yet.' }) : null,
      data.canDecide ? decisionForm(data) : null,
      evaluationSection(data.evaluation), historySection(report)].filter(Boolean));
    detailEl.hidden = false;
  }

  async function loadDetail(clubId, eventKey) {
    setStatus('Loading report…');
    try {
      const data = await api(`/reports/${encodeURIComponent(clubId)}/${encodeURIComponent(eventKey)}`);
      if (statusEl.textContent === 'Loading report…') setStatus('');
      renderDetail(data);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) { setStatus(error.message, true); }
  }

  async function showOverview() {
    if (!overview) {
      try { overview = await api('/overview'); }
      catch (error) {
        setStatus(error.status === 401 ? 'Sign in with your club or staff account to see post-event reports.' : error.message, true);
        return;
      }
    }
    if (statusEl.textContent === 'Loading reports…') setStatus('');
    renderOverview();
  }

  async function route() {
    const params = new URLSearchParams(location.search);
    const club = params.get('club'), event = params.get('event');
    if (club && event) {
      if (!overview) { try { overview = await api('/overview'); } catch { /* the detail view reports its own errors */ } }
      await loadDetail(club, event);
    } else {
      overview = null; // refresh after decisions made in the detail view
      await showOverview();
    }
  }
  window.addEventListener('popstate', route);
  void route();
})();
