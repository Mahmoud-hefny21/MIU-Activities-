(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('universityPostForm');
  if (!form) return;
  const list = $('universityPostRecords'), listMessage = $('universityPostListMessage');
  const formMessage = $('universityPostMessage'), submit = $('publishUniversityPostBtn');
  const imageInput = $('universityPostImage'), preview = $('universityPostPreview');
  let canPublish = true, faculties = [];
  let previewUrl = '', loadVersion = 0, editing = null, publishKey = '', publishSignature = '', uploadedFile, uploadedImage;
  const cancelEdit = document.createElement('button');
  cancelEdit.type = 'button'; cancelEdit.className = 'secondary-btn'; cancelEdit.textContent = 'Cancel editing'; cancelEdit.hidden = true;
  submit.after(cancelEdit);
  cancelEdit.addEventListener('click', () => form.reset());
  const escapeHtml = window.MiuUI.escapeHtml;
  function showMessage(node, message, error = false) { node.textContent = message; node.classList.toggle('error', error); }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (!response.ok) { let body = {}; try { body = await response.json(); } catch {} throw new Error(body.message || `Request failed (${response.status}).`); }
    return response.status === 204 ? null : response.json();
  }
  function updateFields() {
    const isEvent = $('universityPostType').value === 'event';
    $('universityEventFields').hidden = !isEvent;
    $('universityAudienceField').hidden = !isEvent;
    $('universityPostAudience').required = isEvent;
    const attendance = isEvent; // attendance can be taken with or without registration
    $('universityAttendanceField').hidden = !attendance;
    if (!attendance) $('universityPostAttendance').value = 'false';
    $('universityQuestionField').hidden = $('universityInteraction').value === 'none';
    $('universityQuestion').required = $('universityInteraction').value !== 'none';
    $('universityOptionsField').hidden = $('universityInteraction').value !== 'poll';
    $('universityOptions').required = $('universityInteraction').value === 'poll';
  }
  // "Published as": MIU or one faculty; the preview shows the name and logo students will see.
  const MIU = { key: 'miu', name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' };
  const publisherOf = key => faculties.find(faculty => faculty.key === key) || MIU;
  function showPublisher() {
    const publisher = publisherOf($('universityPublishedAs').value);
    $('universityPublisherName').textContent = publisher.name;
    $('universityPublisherLogo').src = publisher.image || MIU.image;
  }
  async function loadFaculties() {
    try {
      faculties = await request('/api/miu-events/faculties', { cache: 'no-store' });
      const select = $('universityPublishedAs'), current = select.value;
      select.innerHTML = '<option value="miu">MIU — Misr International University</option>' + (faculties.length ? `<optgroup label="Faculty">${faculties.map(faculty => `<option value="${escapeHtml(faculty.key)}">${escapeHtml(faculty.name)}</option>`).join('')}</optgroup>` : '');
      select.value = [...select.options].some(option => option.value === current) ? current : 'miu';
      showPublisher();
    } catch { /* MIU stays available when the faculty list cannot load. */ }
  }
  function setReadOnly(readOnly) {
    canPublish = !readOnly;
    form.hidden = readOnly;
    document.querySelector('.university-publisher-preview')?.toggleAttribute('hidden', readOnly);
    const notice = $('miuReadOnlyNotice'); if (notice) notice.hidden = !readOnly;
  }
  function render(posts) {
    $('miuEventsCount').textContent = String(posts.length);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const setStat = (id, value) => { const node = $(id); if (node) node.textContent = String(value); };
    setStat('miuUpcomingCount', posts.filter(post => post.type === 'event' && post.date && post.date >= today).length);
    setStat('miuAnnouncementCount', posts.filter(post => post.type === 'announcement').length);
    setStat('miuFacultyCount', posts.filter(post => post.organization?.type === 'faculty').length);
    listMessage.textContent = posts.length ? `${posts.length} update${posts.length === 1 ? '' : 's'} published by MIU.` : 'No MIU posts published yet.';
    list.innerHTML = posts.map(post => `<article class="record"><div class="record-head"><div><h3 class="record-title">${escapeHtml(post.title)}</h3><p class="record-meta miu-record-publisher"><img src="${escapeHtml(post.organization?.image || MIU.image)}" alt="">${escapeHtml(post.organization?.name || MIU.name)}</p><p class="record-meta">${post.type === 'event' ? 'Event' : 'Announcement'}${post.date ? ` · ${escapeHtml(post.date)}` : ''}${post.time ? ` · ${escapeHtml(window.formatSiteTime?.(post.time) || post.time)}` : ''}${post.location ? ` · ${escapeHtml(post.location)}` : ''}</p>${post.type === 'event' ? `<p class="record-meta">${post.attendanceAudience === 'members' ? 'Current members of any MIU club' : 'All university students'}${post.registrationEnabled ? ` · ${post.attendanceEnabled ? 'Attendance will be recorded' : 'Attendance will not be recorded'}` : ''}</p>` : ''}</div>${canPublish ? `<div class="record-actions"><button type="button" data-edit-university-post="${Number(post.id)}">Edit</button><button class="danger" type="button" data-delete-university-post="${Number(post.id)}">Delete</button></div>` : ''}</div><p>${escapeHtml(post.description)}</p></article>`).join('') || '<p class="empty">No university posts have been published.</p>';
    list.querySelectorAll('[data-edit-university-post]').forEach(button => button.addEventListener('click', () => {
      editing = posts.find(post => Number(post.id) === Number(button.dataset.editUniversityPost));
      if (!editing) return;
      for (const [id, key] of Object.entries({ universityPostType: 'type', universityPostTitle: 'title', universityPostDescription: 'description', universityPostDate: 'date', universityPostTime: 'time', universityPostLocation: 'location', universityInteraction: 'interaction', universityQuestion: 'question' })) $(id).value = editing[key] || '';
      $('universityInteraction').value = editing.interaction || 'none';
      $('universityOptions').value = (editing.options || []).join('\n');
      $('universityPostRegistration').value = String(editing.registrationEnabled === true);
      $('universityPostAttendance').value = String(editing.attendanceEnabled === true);
      $('universityPostAudience').value = editing.attendanceAudience || 'all_students';
      $('universityPostType').disabled = true;
      // The publisher stays the same when editing, so links and identity do not change.
      $('universityPublishedAs').value = editing.organization?.type === 'faculty' ? editing.organization.key : 'miu';
      $('universityPublishedAs').disabled = true; showPublisher();
      const customImage = editing.image && editing.image !== '/assets/img/pics/logo.svg.png';
      form.elements.imageChoice.value = customImage ? 'custom' : 'logo';
      imageInput.value = ''; uploadedFile = uploadedImage = null;
      preview.src = editing.image || '/assets/img/pics/logo.svg.png';
      $('universityImageField').hidden = !customImage;
      $('universityPostFormTitle').textContent = 'Edit university update';
      submit.textContent = 'Save changes'; cancelEdit.hidden = false;
      form.dataset.miuDirty = 'true'; updateFields(); showMessage(formMessage, '');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('universityPostTitle').focus({ preventScroll: true });
    }));
    list.querySelectorAll('[data-delete-university-post]').forEach(button => button.addEventListener('click', async () => {
      if (!await (window.miuConfirmAction || window.confirm)('Remove this MIU post from the public website?')) return;
      button.disabled = true;
      try { await request(`/api/miu-events/content/${button.dataset.deleteUniversityPost}`, { method: 'DELETE' }); window.miuLiveData?.invalidate(['universityContent']); await loadPosts(); }
      catch (error) { showMessage(listMessage, error.message, true); button.disabled = false; }
    }));
  }
  async function loadPosts() {
    const version = ++loadVersion;
    showMessage(listMessage, 'Loading published posts…');
    try {
      const response = await fetch('/api/miu-events/content', { credentials: 'same-origin', cache: 'no-store', siteStartupNonBlocking: true });
      const posts = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(posts.message || `Request failed (${response.status}).`);
      if (version !== loadVersion) return;
      setReadOnly(response.headers.get('X-Can-Publish') === '0');
      render(Array.isArray(posts) ? posts : []);
    }
    catch (error) { if (version === loadVersion) { showMessage(listMessage, error.message, true); list.replaceChildren(); $('miuEventsCount').textContent = '—'; } }
  }
  let registrationLoadVersion = 0;
  async function loadRegistrations() {
    const message = $('miuRegistrationsMessage'), container = $('miuRegistrationsList');
    if (!message || !container) return;
    const version = ++registrationLoadVersion;
    showMessage(message, 'Loading event registrations…');
    try {
      const events = await request('/api/miu-events/registrations', { cache: 'no-store' });
      if (version !== registrationLoadVersion) return;
      const rows = Array.isArray(events) ? events : [];
      const total = rows.reduce((sum, event) => sum + (event.registrations?.length || 0), 0);
      showMessage(message, `${rows.length} event${rows.length === 1 ? '' : 's'} · ${total} registration${total === 1 ? '' : 's'}.`);
      container.innerHTML = rows.map(event => `<article class="record registration-event"><header class="record-head"><div><h3 class="record-title">${escapeHtml(event.title)}</h3><p class="record-meta">${[event.date, event.time ? (window.formatSiteTime?.(event.time) || event.time) : '', event.location].filter(Boolean).map(escapeHtml).join(' · ') || 'Date and location not set'}</p></div><strong>${event.registrations?.length || 0}</strong></header>${event.registrations?.length ? `<ul>${event.registrations.map(person => `<li><div><strong>${escapeHtml(person.name)}</strong><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></div><time>${person.registeredAt ? escapeHtml(window.formatSiteTime?.(person.registeredAt) || new Date(person.registeredAt).toLocaleString()) : ''}</time></li>`).join('')}</ul>` : '<p class="registration-empty">No one has registered yet.</p>'}</article>`).join('') || '<p class="empty">No MIU events currently allow registration.</p>';
    } catch (error) {
      if (version !== registrationLoadVersion) return;
      showMessage(message, error.message, true); container.replaceChildren();
    }
  }
  $('universityPostType').addEventListener('change', updateFields);
  $('universityPublishedAs').addEventListener('change', showPublisher);
  void loadFaculties();
  $('universityPostRegistration').addEventListener('change', updateFields);
  $('universityInteraction').addEventListener('change', updateFields);
  $('refreshUniversityPostsBtn').addEventListener('click', loadPosts);
  $('refreshMiuRegistrationsBtn')?.addEventListener('click', loadRegistrations);
  document.addEventListener('dashboard:panel-change', event => { if (event.detail?.panelId === 'miuEventRegistrationsPanel') loadRegistrations(); });
  document.querySelectorAll('input[name="imageChoice"]').forEach(radio => radio.addEventListener('change', () => {
    const custom = form.elements.imageChoice.value === 'custom';
    $('universityImageField').hidden = !custom;
    if (!custom) { imageInput.value = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; preview.src = '/assets/img/pics/logo.svg.png'; }
  }));
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { imageInput.value = ''; showMessage(formMessage, 'Choose a PNG, JPG, or WebP image up to 10 MB.', true); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file); preview.src = previewUrl; showMessage(formMessage, '');
  });
  form.addEventListener('reset', () => {
    editing = null; publishKey = publishSignature = ''; uploadedFile = uploadedImage = null;
    $('universityPostType').disabled = false; $('universityPublishedAs').disabled = false; submit.textContent = 'Publish update';
    setTimeout(showPublisher, 0); cancelEdit.hidden = true;
    $('universityPostFormTitle').textContent = 'New university update';
    form.dataset.miuDirty = 'false';
    setTimeout(() => { updateFields(); $('universityImageField').hidden = true; preview.src = '/assets/img/pics/logo.svg.png'; }, 0);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; showMessage(formMessage, editing ? 'Saving changes…' : 'Publishing…');
    try {
      const isEvent = $('universityPostType').value === 'event', registrationEnabled = isEvent && $('universityPostRegistration').value === 'true';
      const imageChoice = form.elements.imageChoice.value, file = imageInput.files?.[0];
      if (imageChoice === 'custom' && !file && !editing?.image) throw new Error('Choose an image to upload, or select the MIU logo.');
      const payload = { type: $('universityPostType').value, interaction: $('universityInteraction').value, question: $('universityQuestion').value.trim(), options: $('universityOptions').value.split('\n').map(x => x.trim()).filter(Boolean), title: $('universityPostTitle').value.trim(), description: $('universityPostDescription').value.trim(), date: $('universityPostDate').value, time: $('universityPostTime').value, location: $('universityPostLocation').value.trim(), registrationEnabled, attendanceEnabled: isEvent && $('universityPostAttendance').value === 'true', attendanceAudience: $('universityPostAudience').value, imageChoice, publishedAs: $('universityPublishedAs').value };
      if (imageChoice === 'custom' && file) {
        if (typeof window.uploadImageToCloudinary !== 'function') throw new Error('Image upload is not available right now.');
        if (uploadedFile !== file) { uploadedImage = await window.uploadImageToCloudinary(file, 'university'); uploadedFile = file; }
        payload.imageUrl = uploadedImage.url; payload.imagePublicId = uploadedImage.publicId;
      } else if (imageChoice === 'custom' && editing) payload.imageChoice = 'keep';
      const wasEditing = Boolean(editing);
      if (editing) payload.updatedAt = editing.updatedAt || editing.createdAt || null;
      const body = JSON.stringify(payload);
      if (publishSignature !== body) { publishKey = crypto.randomUUID(); publishSignature = body; }
      await request(editing ? `/api/miu-events/content/${editing.id}` : '/api/miu-events/content', { method: editing ? 'PUT' : 'POST', headers: { 'Idempotency-Key': publishKey }, body });
      form.reset(); updateFields(); $('universityImageField').hidden = true; preview.src = '/assets/img/pics/logo.svg.png'; showMessage(formMessage, wasEditing ? 'Changes saved across the public website.' : 'Published. The update is now visible on the public website.');
      window.miuLiveData?.invalidate(['universityContent']); await loadPosts();
    } catch (error) { showMessage(formMessage, error.message, true); }
    finally { submit.disabled = false; }
  });
  updateFields();
  if (window.siteStartup?.afterStartup) window.siteStartup.afterStartup(loadPosts);
  else window.setTimeout(loadPosts, 0);
  window.siteStartup?.watch(loadPosts);
})();
