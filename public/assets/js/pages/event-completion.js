// Completed club events: approved photos and the student evaluation, on the existing event page.
(() => {
  'use strict';
  const section = document.getElementById('eventCompletion');
  if (!section) return;
  const params = new URLSearchParams(location.search);
  const clubId = Number(params.get('club')), eventIndex = Number(params.get('event'));
  if (!Number.isInteger(clubId) || clubId < 1 || !Number.isInteger(eventIndex) || eventIndex < 0) return;
  const endpoint = `/api/event-feedback/${clubId}/${eventIndex}`;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }
  const formatDay = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  let dialog;
  function openPhoto(url) {
    if (!dialog) {
      const image = el('img', { alt: 'Event photo' });
      dialog = el('dialog', { className: 'event-eval-dialog', 'aria-label': 'Event photo' }, [
        el('button', { type: 'button', className: 'close-btn', 'aria-label': 'Close photo', text: '×', onclick: () => dialog.close() }), image]);
      dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    dialog.querySelector('img').src = url;
    dialog.showModal();
  }

  // options: [{ value, label }]; value is what the server receives.
  function choiceField(name, legend, current, options) {
    return el('fieldset', {}, [el('legend', { text: legend }), el('div', { className: 'event-eval-scale' },
      options.map(({ value, label }) => el('label', {}, [
        el('input', { type: 'radio', name, value: String(value), required: true, checked: current !== undefined && String(current) === String(value) }),
        el('span', { text: label })])))]);
  }
  const stars = [1, 2, 3, 4, 5].map((value) => ({ value, label: `${value} ★` }));
  const scale = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));

  function evaluationForm(evaluation) {
    const mine = evaluation.mine || { answers: {} };
    const feedback = el('p', { className: 'admin-feedback', role: 'status', 'aria-live': 'polite' });
    const fields = [choiceField('rating', 'Overall event rating (1 = poor, 5 = excellent)', mine.rating, stars)];
    for (const question of evaluation.survey) {
      if (question.kind === 'scale') fields.push(choiceField(question.id, `${question.text} (1 = not at all, 5 = very)`, mine.answers?.[question.id], scale));
      else if (question.kind === 'choice') fields.push(choiceField(question.id, question.text, mine.answers?.[question.id], question.options.map((option) => ({ value: option, label: option }))));
      else {
        const id = `evalText-${question.id}`;
        const textarea = el('textarea', { id, name: question.id, maxlength: String(question.maxLength || 1000) });
        textarea.value = mine.answers?.[question.id] || '';
        fields.push(el('label', { for: id, className: 'event-eval-text' }, [el('strong', { text: `${question.text} (optional)` }), textarea]));
      }
    }
    const comment = el('textarea', { id: 'evalComment', name: 'comment', maxlength: '1000' });
    comment.value = mine.comment || '';
    fields.push(el('label', { for: 'evalComment' }, [el('strong', { text: 'Anything else you want to tell the club? (optional)' }), comment]));
    const form = el('form', { className: 'event-eval-form' }, [...fields,
      el('button', { type: 'submit', className: 'primary-btn', text: evaluation.mine ? 'Update my evaluation' : 'Submit evaluation' }), feedback,
      el('small', { text: `Your answers are anonymous to the club and reviewers. You can edit them until ${formatDay(evaluation.closesOn)}.` })]);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const answers = {};
      for (const question of evaluation.survey) {
        const raw = data.get(question.id);
        answers[question.id] = question.kind === 'scale' ? Number(raw) : String(raw || '');
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      feedback.textContent = 'Saving…';
      try {
        const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ rating: Number(data.get('rating')), answers, comment: String(data.get('comment') || '') }) });
        const result = await response.json().catch(() => ({}));
        feedback.textContent = response.ok ? result.message : (result.message || 'Your evaluation could not be saved.');
        if (response.ok) button.textContent = 'Update my evaluation';
      } catch { feedback.textContent = 'Check your connection and try again.'; }
      finally { button.disabled = false; }
    });
    return form;
  }

  async function load() {
    let data;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      data = await response.json();
    } catch { return; }
    if (!data.completed) return;
    const photos = data.photos.length
      ? el('ul', { className: 'event-completion-photos' }, data.photos.map((photo, index) => el('li', {},
        el('button', { type: 'button', 'aria-label': `Open photo ${index + 1}`, onclick: () => openPhoto(photo.url) },
          el('img', { src: photo.url, alt: `Event photo ${index + 1}`, loading: 'lazy' })))))
      : el('p', { className: 'event-completion-empty', text: 'Photos from this event will appear here once the club’s report is approved.' });
    const evaluation = data.evaluation;
    let rate;
    if (!evaluation.open) rate = el('p', { className: 'event-completion-empty', text: 'The evaluation for this event has closed. Thank you to everyone who took part.' });
    else if (!evaluation.signedIn) {
      const back = `${location.pathname}${location.search}`;
      rate = el('p', {}, ['Sign in with your MIU account to rate this event. ',
        el('a', { href: `/pages/applicant-login.html?redirect=${encodeURIComponent(back)}`, text: 'Sign in' })]);
    } else rate = evaluationForm(evaluation);
    section.replaceChildren(
      el('h2', { id: 'eventCompletionTitle', text: 'This event has ended' }),
      el('div', {}, [el('h3', { text: 'Event photos' }), photos]),
      el('div', {}, [el('h3', { text: 'Rate this event' }), rate]));
    section.hidden = false;
  }
  void load();
})();
