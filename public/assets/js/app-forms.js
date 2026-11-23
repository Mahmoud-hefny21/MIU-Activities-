// President / head dashboard: application form and interview question builders.
// Both use the same question cards; saved data keeps the same shape ({ key, label, type, required, options }).
const QUESTION_LIMIT = 12;
const SECTION_LIMIT = 10;
const OPTION_LIMIT = 20;
const QUESTION_TYPES = [['text', 'Short answer'], ['textarea', 'Paragraph'], ['select', 'Multiple choice']];
const RATING = ['Weak', 'Fair', 'Good', 'Excellent'];
const HOURS = ['1–3 hours', '4–6 hours', '7–10 hours', 'More than 10 hours'];
// Ready questions for the application form (the standard fields such as motivation are already on every form).
const APPLICATION_QUESTION_TEMPLATES = [
  { label: 'Which year are you in?', type: 'select', required: true, options: ['First year', 'Second year', 'Third year', 'Fourth year', 'Fifth year'] },
  { label: 'How many hours per week can you give to the club?', type: 'select', required: true, options: HOURS },
  { label: 'Have you been a member of a student club before?', type: 'select', required: false, options: ['Yes', 'No'] },
  { label: 'Tell us about any experience related to this committee', type: 'textarea', required: false },
  { label: 'What skills would you bring to the team?', type: 'textarea', required: false },
  { label: 'Link to your LinkedIn or portfolio', type: 'text', required: false },
  { label: 'How did you hear about us?', type: 'select', required: false, options: ['Instagram', 'Facebook', 'A friend', 'Club booth', 'Other'] }
];
// The standard interview evaluation used by clubs.
const INTERVIEW_TEMPLATE = [
  { title: 'First impression', questions: [
    { label: 'Communication skills', type: 'select', required: true, options: RATING },
    { label: 'Confidence', type: 'select', required: true, options: RATING },
    { label: 'Punctuality and appearance', type: 'select', required: false, options: RATING }] },
  { title: 'Motivation and commitment', questions: [
    { label: 'Why does the applicant want to join?', type: 'textarea', required: true },
    { label: 'Hours per week they can commit', type: 'select', required: true, options: HOURS },
    { label: 'Teamwork', type: 'select', required: false, options: RATING }] },
  { title: 'Skills and experience', questions: [
    { label: 'Relevant skills or experience', type: 'textarea', required: false },
    { label: 'Fit for the chosen committee', type: 'select', required: true, options: RATING }] },
  { title: 'Final decision', questions: [
    { label: 'Overall rating', type: 'select', required: true, options: ['1 – Poor', '2 – Fair', '3 – Good', '4 – Very good', '5 – Excellent'] },
    { label: 'Recommendation', type: 'select', required: true, options: ['Accept', 'Waiting list', 'Reject'] },
    { label: 'Interviewer notes', type: 'textarea', required: false }] }
];
const newKey = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const newQuestion = (template = {}) => ({ key: newKey('q'), label: template.label || '', type: template.type || 'text',
  required: Boolean(template.required), options: Array.isArray(template.options) ? [...template.options] : [] });
const cloneQuestion = question => ({ ...question, options: Array.isArray(question.options) ? [...question.options] : [] });
const QB_ICONS = {
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  remove: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>'
};
const qbIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${QB_ICONS[name]}</svg>`;
const qbTool = (action, label, icon, { disabled = false, danger = false } = {}) =>
  `<button type="button" class="qb-icon-btn${danger ? ' is-danger' : ''}" data-qb="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled ? ' disabled' : ''}>${qbIcon(icon)}</button>`;

function questionCardHtml(question, index, total, placeholder) {
  const number = index + 1;
  const isChoice = question.type === 'select';
  const options = isChoice && question.options.length ? question.options : (isChoice ? ['', ''] : []);
  return `
    <article class="qb-card" data-q="${index}">
      <header class="qb-card-head">
        <span class="qb-number">Question ${number}</span>
        <span class="qb-tools">
          ${qbTool('up', `Move question ${number} up`, 'up', { disabled: index === 0 })}
          ${qbTool('down', `Move question ${number} down`, 'down', { disabled: index === total - 1 })}
          ${qbTool('remove', `Delete question ${number}`, 'remove', { danger: true })}
        </span>
      </header>
      <div class="qb-card-body">
        <label class="qb-field qb-field-question"><span>Question</span>
          <input type="text" data-qp="label" maxlength="100" value="${escapeHtml(question.label)}" placeholder="${escapeHtml(placeholder)}"></label>
        <label class="qb-field"><span>Answer type</span>
          <select data-qp="type">${QUESTION_TYPES.map(([value, label]) => `<option value="${value}"${question.type === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="qb-switch"><input type="checkbox" role="switch" data-qp="required"${question.required ? ' checked' : ''}><span class="qb-switch-track" aria-hidden="true"></span><span>Required</span></label>
      </div>
      ${isChoice ? `<div class="qb-options">
        <span class="qb-options-title">Choices</span>
        <ol class="qb-option-list">${options.map((option, optionIndex) => `
          <li><input type="text" data-qo="${optionIndex}" maxlength="100" value="${escapeHtml(option)}" placeholder="Choice ${optionIndex + 1}" aria-label="Question ${number}, choice ${optionIndex + 1}">
            ${qbTool('remove-option', `Remove choice ${optionIndex + 1}`, 'close', { disabled: options.length <= 2 })}</li>`).join('')}
        </ol>
        <button type="button" class="qb-text-btn" data-qb="add-option"${options.length >= OPTION_LIMIT ? ' disabled' : ''}>+ Add choice</button>
      </div>` : ''}
    </article>`;
}

// Turns editor state into the saved shape, or explains the first problem (and which input to focus).
function cleanQuestions(questions, where = '') {
  const cleaned = [];
  for (const [index, question] of questions.entries()) {
    const name = `${where}question ${index + 1}`;
    const label = String(question.label || '').trim();
    if (!label) return { error: `Write the text for ${name}.`, index, focus: '[data-qp="label"]' };
    if (label.length > 100) return { error: `Keep ${name} within 100 characters.`, index, focus: '[data-qp="label"]' };
    let options = [];
    if (question.type === 'select') {
      options = question.options.map(option => String(option || '').trim()).filter(Boolean);
      if (options.length < 2) return { error: `Add at least two choices to ${name}.`, index, focus: '[data-qo]' };
      if (new Set(options.map(option => option.toLowerCase())).size !== options.length) return { error: `Each choice in ${name} must be different.`, index, focus: '[data-qo]' };
    }
    cleaned.push({ key: question.key, label, type: question.type, required: Boolean(question.required), options });
  }
  return { questions: cleaned };
}

// Shared editing of one question list (clicks and typing inside the cards).
function editQuestionList(questions, event, rerender) {
  const card = event.target.closest('[data-q]');
  if (!card) return false;
  const index = Number(card.dataset.q);
  const question = questions[index];
  if (!question) return false;
  if (event.type === 'click') {
    const action = event.target.closest('[data-qb]')?.dataset.qb;
    if (!action) return false;
    if (action === 'up' && index > 0) [questions[index - 1], questions[index]] = [questions[index], questions[index - 1]];
    else if (action === 'down' && index < questions.length - 1) [questions[index + 1], questions[index]] = [questions[index], questions[index + 1]];
    else if (action === 'remove') questions.splice(index, 1);
    else if (action === 'add-option') {
      if (question.options.length < 2) question.options = [...question.options, '', ''].slice(0, 2);
      if (question.options.length < OPTION_LIMIT) question.options.push('');
    } else if (action === 'remove-option') {
      question.options.splice(Number(event.target.closest('li').querySelector('[data-qo]').dataset.qo), 1);
    } else return false;
    const focusAfter = action === 'add-option' ? { q: index, option: question.options.length - 1 }
      : action === 'up' ? { q: index - 1, tool: 'up' } : action === 'down' ? { q: index + 1, tool: 'down' } : null;
    rerender(focusAfter);
    return true;
  }
  const property = event.target.dataset.qp;
  if (property === 'required') question.required = event.target.checked;
  else if (property === 'label') question.label = event.target.value;
  else if (property === 'type') {
    question.type = event.target.value;
    if (question.type === 'select' && question.options.filter(option => option.trim()).length < 2) question.options = [...question.options.filter(option => option.trim()), '', ''].slice(0, Math.max(2, question.options.length));
    if (event.type === 'change') rerender({ q: index, type: true });
  } else if (event.target.dataset.qo !== undefined) question.options[Number(event.target.dataset.qo)] = event.target.value;
  else return false;
  return true;
}

function focusAfterRender(list, focus) {
  if (!focus) return;
  const card = list.querySelector(`[data-q="${focus.q}"]`) || list.querySelector('[data-q]:last-of-type');
  const target = focus.option !== undefined ? card?.querySelector(`[data-qo="${focus.option}"]`)
    : focus.tool ? (card?.querySelector(`[data-qb="${focus.tool}"]:not(:disabled)`) || card?.querySelector('[data-qp="label"]'))
      : focus.type ? card?.querySelector('[data-qp="type"]') : card?.querySelector('[data-qp="label"]');
  target?.focus();
  if (focus.scroll) card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function markQuestionFormDirty(kind, dirty = true) {
  state[kind === 'application' ? 'applicationFormDirty' : 'interviewFormDirty'] = dirty;
  document.getElementById(kind === 'application' ? 'presidentFormUnsaved' : 'interviewFormUnsaved')?.toggleAttribute('hidden', !dirty);
}

function setQuestionFeedback(id, message, isError = false) {
  const feedback = document.getElementById(id);
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}

document.getElementById('reloadApplicationQuestionsBtn').addEventListener('click', () => loadPresidentApplicationForm().catch(() => {}));
document.getElementById('reloadInterviewQuestionsBtn').addEventListener('click', () => loadInterviewForm().catch(() => {}));
function questionEditorScope(kind) {
  return document.getElementById(kind === 'application' ? 'applicationQuestionScope' : 'interviewQuestionScope');
}
function updateQuestionScope(kind, result) {
  const select = questionEditorScope(kind);
  select.replaceChildren();
  if (state.clubAccount?.role !== 'head') select.add(new Option(kind === 'application' ? 'Whole club' : 'Club interviews', ''));
  for (const committee of result.committees || []) select.add(new Option(committee, committee));
  select.value = result.committee || '';
  select.disabled = state.clubAccount?.role === 'head';
  if (kind === 'application') document.getElementById('presidentApplicationIntro').closest('.field-group').classList.toggle('hidden', Boolean(result.committee));
}
for (const kind of ['application', 'interview']) {
  questionEditorScope(kind)?.addEventListener('change', () => {
    const load = kind === 'application' ? loadPresidentApplicationForm : loadInterviewForm;
    load().catch(() => {});
  });
}

// ---- Application form ----
async function loadPresidentApplicationForm() {
  const button = document.getElementById('savePresidentApplicationFormBtn');
  button.disabled = true;
  setQuestionFeedback('presidentFormFeedback', 'Loading questions…');
  try {
    const scope = state.clubAccount?.role === 'head' ? state.clubAccount.committee : questionEditorScope('application').value;
    const response = await fetch('/api/club/application-form?committee=' + encodeURIComponent(scope || ''), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load your application form.');
    updateQuestionScope('application', result);
    state.applicationQuestionVersion = result.version;
    document.getElementById('presidentApplicationIntro').value = result.applicationIntro || '';
    state.presidentApplicationFields = (result.applicationFields || []).map(cloneQuestion);
    renderPresidentApplicationFields();
    markQuestionFormDirty('application', false);
    setQuestionFeedback('presidentFormFeedback', '');
    button.disabled = false;
  } catch (error) { setQuestionFeedback('presidentFormFeedback', error.message, true); throw error; }
}

function renderPresidentApplicationFields(focus = null) {
  const list = document.getElementById('presidentApplicationFieldList');
  const fields = state.presidentApplicationFields;
  list.innerHTML = fields.length
    ? fields.map((field, index) => questionCardHtml(field, index, fields.length, 'e.g. Which year are you in?')).join('')
    : '<p class="qb-empty">No extra questions yet. Your form already asks for name, MIU ID, major, email, phone, photo, committee, age and motivation. Add a question below, or pick a ready one.</p>';
  document.getElementById('presidentQuestionCount').textContent = `${fields.length} of ${QUESTION_LIMIT} questions`;
  document.getElementById('addPresidentApplicationFieldBtn').disabled = fields.length >= QUESTION_LIMIT;
  const templates = document.getElementById('presidentQuestionTemplate');
  const used = new Set(fields.map(field => String(field.label || '').trim().toLowerCase()));
  templates.disabled = fields.length >= QUESTION_LIMIT;
  [...templates.options].slice(1).forEach(option => { option.disabled = used.has(APPLICATION_QUESTION_TEMPLATES[Number(option.value)].label.toLowerCase()); });
  focusAfterRender(list, focus);
}

const presidentApplicationFieldList = document.getElementById('presidentApplicationFieldList');
for (const type of ['click', 'input', 'change']) {
  presidentApplicationFieldList.addEventListener(type, (event) => {
    if (type === 'input' && event.target.dataset.qp === 'type') return;
    if (editQuestionList(state.presidentApplicationFields, event, focus => renderPresidentApplicationFields(focus))) {
      event.target.classList?.remove('is-invalid');
      markQuestionFormDirty('application');
    }
  });
}
document.getElementById('presidentApplicationIntro').addEventListener('input', () => markQuestionFormDirty('application'));
// Enter never saves by accident: in a choice it adds the next choice; elsewhere it does nothing.
function questionListKeydown(event) {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT' || event.target.type === 'checkbox') return;
  event.preventDefault();
  if (event.target.dataset.qo !== undefined) event.target.closest('[data-q]')?.querySelector('[data-qb="add-option"]:not(:disabled)')?.click();
}
presidentApplicationFieldList.addEventListener('keydown', questionListKeydown);

function addApplicationQuestion(template) {
  if (state.presidentApplicationFields.length >= QUESTION_LIMIT) {
    setQuestionFeedback('presidentFormFeedback', `A form can have up to ${QUESTION_LIMIT} extra questions.`, true);
    return;
  }
  state.presidentApplicationFields.push(newQuestion(template));
  markQuestionFormDirty('application');
  renderPresidentApplicationFields({ q: state.presidentApplicationFields.length - 1, scroll: true });
}
document.getElementById('addPresidentApplicationFieldBtn').addEventListener('click', () => addApplicationQuestion());
document.getElementById('presidentQuestionTemplate').addEventListener('change', (event) => {
  const template = APPLICATION_QUESTION_TEMPLATES[Number(event.target.value)];
  event.target.value = '';
  if (template) addApplicationQuestion(template);
});

document.getElementById('presidentFormEditor').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('savePresidentApplicationFormBtn');
  if (button.disabled) return;
  const { questions, error, index, focus } = cleanQuestions(state.presidentApplicationFields);
  if (error) {
    setQuestionFeedback('presidentFormFeedback', error, true);
    const field = presidentApplicationFieldList.querySelector(`[data-q="${index}"] ${focus}`);
    field?.classList.add('is-invalid');
    field?.focus();
    return;
  }
  button.disabled = true;
  setQuestionFeedback('presidentFormFeedback', 'Saving…');
  try {
    const response = await fetch('/api/club/application-form', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationIntro: document.getElementById('presidentApplicationIntro').value,
        committee: questionEditorScope('application').value, version: state.applicationQuestionVersion,
        applicationFields: questions
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save your application form.');
    state.applicationQuestionVersion = result.version;
    state.presidentApplicationFields = (result.applicationFields || []).map(cloneQuestion);
    renderPresidentApplicationFields();
    markQuestionFormDirty('application', false);
    const club = state.clubs.find((item) => item.id === state.clubAccount.id);
    if (club) {
      club.applicationIntro = result.applicationIntro;
      club.applicationFields = [...(club.applicationFields || []).filter(f => (f.committee || '') !== (result.committee || '')), ...result.applicationFields];
    }
    setQuestionFeedback('presidentFormFeedback', 'Application form saved. New applicants will see these changes.');
  } catch (error) {
    setQuestionFeedback('presidentFormFeedback', error.message, true);
  } finally {
    button.disabled = false;
  }
});

// ---- Interview form ----
function setInterviewFeedback(message, isError = false) { setQuestionFeedback('interviewFormFeedback', message, isError); }

async function loadInterviewForm() {
  const button = document.getElementById('saveInterviewFormBtn');
  button.disabled = true;
  setInterviewFeedback('Loading questions…');
  try {
    const scope = state.clubAccount?.role === 'head' ? state.clubAccount.committee : questionEditorScope('interview').value;
    const response = await fetch('/api/club/interview-form?committee=' + encodeURIComponent(scope || ''), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load interview questions.');
    updateQuestionScope('interview', result);
    state.interviewQuestionVersion = result.version;
    state.interviewSections = (result.sections || []).map(section => ({ ...section, questions: (section.questions || []).map(cloneQuestion) }));
    renderInterviewSections();
    markQuestionFormDirty('interview', false);
    setInterviewFeedback('');
    button.disabled = false;
  } catch (error) { setInterviewFeedback(error.message, true); throw error; }
}

function renderInterviewSections(focus = null) {
  const list = document.getElementById('interviewSectionList');
  const sections = state.interviewSections;
  list.innerHTML = sections.length ? sections.map((section, sectionIndex) => {
    const number = sectionIndex + 1;
    return `
    <section class="qb-section" data-s="${sectionIndex}">
      <header class="qb-section-head">
        <span class="qb-number">Section ${number}</span>
        <span class="qb-tools">
          ${qbTool('section-up', `Move section ${number} up`, 'up', { disabled: sectionIndex === 0 })}
          ${qbTool('section-down', `Move section ${number} down`, 'down', { disabled: sectionIndex === sections.length - 1 })}
          ${qbTool('remove-section', `Delete section ${number}`, 'remove', { danger: true })}
        </span>
        <label class="qb-field qb-section-title"><span>Section name</span>
          <input type="text" data-sp="title" maxlength="80" value="${escapeHtml(section.title)}" placeholder="e.g. First impression"></label>
      </header>
      <div class="qb-question-list">
        ${section.questions.length ? section.questions.map((question, index) => questionCardHtml(question, index, section.questions.length, 'e.g. Communication skills')).join('')
          : '<p class="qb-empty">No questions in this section yet.</p>'}
      </div>
      <footer class="qb-list-footer">
        <button type="button" class="secondary-btn qb-add-btn" data-qb="add-question"${section.questions.length >= QUESTION_LIMIT ? ' disabled' : ''}>+ Add question</button>
        <span class="qb-count">${section.questions.length} of ${QUESTION_LIMIT} questions</span>
      </footer>
    </section>`;
  }).join('') : '<p class="qb-empty">No interview questions yet. Start from the standard template, or add your own section.</p>';
  document.getElementById('addInterviewSectionBtn').disabled = sections.length >= SECTION_LIMIT;
  const template = document.getElementById('useInterviewTemplateBtn');
  template.disabled = sections.length + INTERVIEW_TEMPLATE.length > SECTION_LIMIT;
  template.textContent = sections.length ? 'Add the standard template' : 'Use the standard template';
  if (!focus) return;
  const sectionElement = list.querySelector(`[data-s="${focus.s}"]`);
  if (focus.title) {
    const title = sectionElement?.querySelector('[data-sp="title"]');
    title?.focus();
    if (focus.scroll) sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (focus.sectionTool) sectionElement?.querySelector(`[data-qb="${focus.sectionTool}"]:not(:disabled)`)?.focus();
  else if (sectionElement) focusAfterRender(sectionElement, focus);
}

const interviewSectionList = document.getElementById('interviewSectionList');
interviewSectionList.addEventListener('keydown', questionListKeydown);
for (const type of ['click', 'input', 'change']) {
  interviewSectionList.addEventListener(type, (event) => {
    const sectionElement = event.target.closest('[data-s]');
    if (!sectionElement) return;
    const sectionIndex = Number(sectionElement.dataset.s);
    const sections = state.interviewSections;
    const section = sections[sectionIndex];
    if (!section) return;
    if (type === 'click') {
      const action = event.target.closest('[data-qb]')?.dataset.qb;
      if (action === 'section-up' && sectionIndex > 0) {
        [sections[sectionIndex - 1], sections[sectionIndex]] = [sections[sectionIndex], sections[sectionIndex - 1]];
        markQuestionFormDirty('interview'); renderInterviewSections({ s: sectionIndex - 1, sectionTool: 'section-up' }); return;
      }
      if (action === 'section-down' && sectionIndex < sections.length - 1) {
        [sections[sectionIndex + 1], sections[sectionIndex]] = [sections[sectionIndex], sections[sectionIndex + 1]];
        markQuestionFormDirty('interview'); renderInterviewSections({ s: sectionIndex + 1, sectionTool: 'section-down' }); return;
      }
      if (action === 'remove-section') {
        const name = section.title.trim() || `Section ${sectionIndex + 1}`;
        if (section.questions.length && !window.confirm(`Delete “${name}” and its ${section.questions.length} question${section.questions.length === 1 ? '' : 's'}? You can undo with “Reload questions” before saving.`)) return;
        sections.splice(sectionIndex, 1);
        markQuestionFormDirty('interview'); renderInterviewSections(); return;
      }
      if (action === 'add-question') {
        if (section.questions.length >= QUESTION_LIMIT) return setInterviewFeedback(`A section can have up to ${QUESTION_LIMIT} questions.`, true);
        section.questions.push(newQuestion());
        markQuestionFormDirty('interview');
        renderInterviewSections({ s: sectionIndex, q: section.questions.length - 1, scroll: true }); return;
      }
    }
    if (event.target.dataset.sp === 'title') {
      if (type !== 'click') { section.title = event.target.value; event.target.classList.remove('is-invalid'); markQuestionFormDirty('interview'); }
      return;
    }
    if (type === 'input' && event.target.dataset.qp === 'type') return;
    if (editQuestionList(section.questions, event, focus => renderInterviewSections(focus && { ...focus, s: sectionIndex }))) {
      event.target.classList?.remove('is-invalid');
      markQuestionFormDirty('interview');
    }
  });
}

document.getElementById('addInterviewSectionBtn').addEventListener('click', () => {
  if (state.interviewSections.length >= SECTION_LIMIT) return setInterviewFeedback(`An interview form can have up to ${SECTION_LIMIT} sections.`, true);
  state.interviewSections.push({ key: newKey('s'), title: '', questions: [newQuestion()] });
  markQuestionFormDirty('interview');
  renderInterviewSections({ s: state.interviewSections.length - 1, title: true, scroll: true });
});
document.getElementById('useInterviewTemplateBtn').addEventListener('click', () => {
  if (state.interviewSections.length + INTERVIEW_TEMPLATE.length > SECTION_LIMIT) return setInterviewFeedback(`An interview form can have up to ${SECTION_LIMIT} sections.`, true);
  const first = state.interviewSections.length;
  state.interviewSections.push(...INTERVIEW_TEMPLATE.map(section => ({ key: newKey('s'), title: section.title, questions: section.questions.map(newQuestion) })));
  markQuestionFormDirty('interview');
  renderInterviewSections({ s: first, title: true, scroll: true });
  setInterviewFeedback('Standard template added. Change anything you need, then save.');
});

document.getElementById('saveInterviewFormBtn').addEventListener('click', async () => {
  const button = document.getElementById('saveInterviewFormBtn');
  if (button.disabled) return;
  const sections = [];
  const seen = new Set();
  for (const [sectionIndex, section] of state.interviewSections.entries()) {
    const sectionElement = interviewSectionList.querySelector(`[data-s="${sectionIndex}"]`);
    const title = String(section.title || '').trim();
    if (!title) {
      setInterviewFeedback(`Give section ${sectionIndex + 1} a name.`, true);
      const input = sectionElement?.querySelector('[data-sp="title"]');
      input?.classList.add('is-invalid'); input?.focus();
      return;
    }
    const { questions, error, index, focus } = cleanQuestions(section.questions, `section ${sectionIndex + 1}, `);
    if (error) {
      setInterviewFeedback(error, true);
      const field = sectionElement?.querySelector(`[data-q="${index}"] ${focus}`);
      field?.classList.add('is-invalid'); field?.focus();
      return;
    }
    for (const question of questions) { if (seen.has(question.key)) question.key = newKey('q'); seen.add(question.key); }
    sections.push({ key: section.key, title, questions });
  }
  button.disabled = true;
  setInterviewFeedback('Saving…');
  try {
    const response = await fetch('/api/club/interview-form', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections, committee: questionEditorScope('interview').value, version: state.interviewQuestionVersion })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not save interview questions.');
    state.interviewQuestionVersion = result.version;
    state.interviewSections = (result.sections || []).map(section => ({ ...section, questions: (section.questions || []).map(cloneQuestion) }));
    renderInterviewSections();
    markQuestionFormDirty('interview', false);
    setInterviewFeedback('Interview form saved.');
  } catch (error) {
    setInterviewFeedback(error.message, true);
  } finally {
    button.disabled = false;
  }
});

// Shared club application, interview and student forms.
function parseClubContentDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareClubUpcoming(left, right) {
  const leftDate = parseClubContentDate(left.date);
  const rightDate = parseClubContentDate(right.date);
  if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return leftDate - rightDate;
  if (leftDate && !rightDate) return -1;
  if (!leftDate && rightDate) return 1;
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

function compareClubNewest(left, right) {
  const leftCreated = new Date(left.createdAt || 0).getTime();
  const rightCreated = new Date(right.createdAt || 0).getTime();
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;
  return (Number(right.requestId) || 0) - (Number(left.requestId) || 0);
}

const CLUB_CONTENT_SECTIONS = [
  { key: 'events', label: 'Event', type: 'event', order: 'upcoming' },
  { key: 'posts', label: 'Feed', type: 'feed', order: 'newest' },
  { key: 'sponsors', label: 'Sponsor', type: 'sponsor', order: 'newest' },
  { key: 'booths', label: 'Booth', type: 'booth', order: 'upcoming' }
];

// Readable date like "Thu, 8 Oct 2026"; anything that is not YYYY-MM-DD is shown as written.
function formatClubCardDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return String(value || '').trim();
  return new Date(+match[1], +match[2] - 1, +match[3]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Card details split into when (date and time) and where (place or extra details).
function clubContentMeta(item, type) {
  if (type === 'sponsor') return { when: '', where: [item.sponsorCompany].filter(Boolean).join(' · ') };
  if (type === 'booth') return { when: formatClubCardDate(item.boothOpenDate), where: [item.boothLocation].filter(Boolean).join(' · ') };
  // Keep times like "2:20 PM" on one line.
  const time = String(window.formatSiteTime(item.time) || '').replace(/ (AM|PM)$/, ' $1');
  const when = [formatClubCardDate(item.date), time].filter(Boolean).join(' · ');
  return { when, where: type === 'feed' ? '' : String(item.location || '') };
}

function clubContentImage(item, type, club) {
  if (type === 'sponsor') return item.sponsorLogo || '';
  if (type === 'booth') return '';
  return item.image || club.image;
}

function renderClubContentSections(club) {
  // Every club gets the same page: a new club with nothing published yet shows an empty Events section.
  const hasContent = CLUB_CONTENT_SECTIONS.some((section) => Array.isArray(club[section.key]) && club[section.key].length);
  if (!hasContent) return `
    <section class="detail-section detail-content-section is-empty" aria-label="Club events">
      <div class="detail-section-heading"><h3>Events</h3></div>
      <p class="detail-content-empty">${escapeHtml(club.name)} has not published any events or posts yet. Check back soon or open the calendar.</p>
    </section>`;
  return CLUB_CONTENT_SECTIONS.map((section) => {
    const heading = section.type === 'feed' ? 'Feed' : `${section.label}s`;
    const items = Array.isArray(club[section.key]) ? [...club[section.key]] : [];
    if (!items.length) return '';
    const sorted = section.order === 'upcoming'
      ? items.sort(compareClubUpcoming)
      : items.sort(compareClubNewest);
    const cards = sorted.map((item, index) => {
      const image = clubContentImage(item, section.type, club);
      const meta = clubContentMeta(item, section.type);
      const imageBlock = image
        ? window.FeedMedia.render(image, item.title || section.label, 'club-image')
        : `<div class="club-image club-image-placeholder" aria-hidden="true">${escapeHtml(section.label)}</div>`;
      return `
        <article class="club-card feed-card club-content-card">
          <div class="club-image-wrap">
            ${imageBlock}
          </div>
          <div class="club-card-content">
            <span class="content-type-badge ${escapeHtml(section.type)}">${escapeHtml(section.label)}</span>
            <div class="club-name" title="${escapeHtml(item.title || section.label)}">${escapeHtml(item.title || section.label)}</div>
            ${meta.when ? `<div class="club-content-when">${escapeHtml(meta.when)}</div>` : ''}
            ${meta.where ? `<div class="club-content-where">${escapeHtml(meta.where)}</div>` : ''}
            <div class="club-actions">
              <button class="event-info-btn" type="button" data-info="${escapeHtml(section.key)}-${index}" data-content-section="${escapeHtml(section.key)}" data-content-index="${club[section.key].indexOf(item)}" aria-haspopup="dialog"${section.type === 'event' ? ` data-event-index="${club.events.indexOf(item)}"` : ''}>Details</button>
            </div>
          </div>
        </article>`;
    }).join('');
    return `
    <section class="detail-section detail-content-section" aria-label="Club ${escapeHtml(section.label)}s">
      <div class="detail-section-heading">
        <h3>${escapeHtml(heading)}</h3>
        <div class="detail-carousel-controls" aria-label="${escapeHtml(section.label)} navigation">
          <button type="button" class="detail-carousel-arrow" data-carousel-direction="-1" aria-label="Scroll ${escapeHtml(section.label)} cards left">&#8592;</button>
          <button type="button" class="detail-carousel-arrow" data-carousel-direction="1" aria-label="Scroll ${escapeHtml(section.label)} cards right">&#8594;</button>
        </div>
      </div>
      <div class="detail-cards-grid detail-club-cards" tabindex="0" role="region" aria-label="${escapeHtml(club.name)} ${escapeHtml(section.label)} cards">
        ${cards}
      </div>
    </section>`;
  }).join('');
}

let clubDetailCarouselResizeHandler = null;

function openClubDetail(clubId) {
  const normalizedClubId = Number(clubId);
  const club = state.clubs.find((item) => Number(item.id) === normalizedClubId);
  if (!club) return;
  if (clubDetailCarouselResizeHandler) {
    window.removeEventListener('resize', clubDetailCarouselResizeHandler);
    clubDetailCarouselResizeHandler = null;
  }
  fetch(`/api/clubs/${encodeURIComponent(normalizedClubId)}/view`, { method: 'POST', cache: 'no-store' }).catch(() => {});
  const canApply = club.status === 'open';

  state.selectedClub = club;
  clubDetail.innerHTML = `
    <button class="club-profile-back" data-action="go-home" type="button"><span aria-hidden="true">←</span> Back to clubs</button>
    <div class="club-detail-hero">
      <div class="detail-logo-frame">
        <img class="detail-logo${club.imageFit === 'contain' ? ' detail-logo-contain' : ''}" src="${escapeHtml(club.image)}" alt="${escapeHtml(club.name)} logo" />
      </div>
      <div class="detail-hero-copy">
        <div class="detail-title-row">
          <h2 class="detail-title">${escapeHtml(club.name)}</h2>
          ${clubSocialLinks(club)}
        </div>
        <div class="detail-chip-row">
          <span class="detail-status-dot status-${escapeHtml(club.status)}"><span aria-hidden="true"></span>${escapeHtml(getClubStatusLabel(club.status))}</span>
          <span class="detail-meta">${[club.category, club.committee && club.committee !== club.category ? club.committee : ''].filter(Boolean).map(escapeHtml).join(' · ')}</span>
          ${club.pinned ? '<span class="detail-pinned-label">Featured club</span>' : ''}
        </div>
        ${club.tagline && club.tagline !== club.category ? `<p class="detail-tagline">${escapeHtml(club.tagline)}</p>` : ''}
        <div class="club-detail-actions">
          <button class="primary-btn club-detail-apply" data-action="apply-club" data-id="${club.id}" ${canApply ? '' : 'disabled'}>${canApply ? 'Apply Now' : escapeHtml(getClubActionLabel(club.status))}</button>
          <button class="secondary-btn club-rate-button club-calendar-button" data-action="show-year-plan" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Calendar</button>
          <button class="secondary-btn club-rate-button" data-action="rate-club" type="button" aria-haspopup="dialog" aria-label="Rate this club"><span aria-hidden="true">&#9734;</span> Rate<span class="detail-label-extra" aria-hidden="true"> this club</span></button>
        </div>
      </div>
    </div>
    <section class="detail-section">
      <h3>About the club</h3>
      <p class="detail-description">${escapeHtml(club.description)}</p>
      <button class="detail-read-more" type="button" data-action="read-more" hidden>Read more</button>
    </section>

    <div class="detail-info detail-stats" role="list" aria-label="${escapeHtml(club.name)} in numbers">
      <div class="detail-box" role="listitem"><strong>${Number(club.members) || 0}</strong><p>Members</p></div>
      <div class="detail-box" role="listitem"><strong>${Number.isInteger(club.seats) && club.seats > 0 ? club.seats : 'Unlimited'}</strong><p>Seats</p></div>
      <div class="detail-box" role="listitem"><strong>${Number(club.applicants) || 0}</strong><p>Applicants</p></div>
    </div>

    <section class="detail-requirements">
      <h3>Joining requirements</h3>
      ${clubRequirementsMarkup(club.requirements)}
    </section>

    <dialog class="club-rating-dialog" aria-label="Rate ${escapeHtml(club.name)}">
      <button class="club-detail-close" data-action="close-rating" type="button" aria-label="Close club rating">&times;</button>
      ${window.studentFeedbackForm('club', club.id)}
    </dialog>
    ${renderClubContentSections(club)}

  `;

  clubDetail.querySelector('[data-action="apply-club"]').addEventListener('click', () => openApplicationForm(normalizedClubId));
  clubDetail.querySelectorAll('[data-action="go-home"]').forEach(button => button.addEventListener('click', () => showView('home')));
  // Long descriptions show three lines first; "Read more" opens the rest.
  const description = clubDetail.querySelector('.detail-description');
  const readMore = clubDetail.querySelector('[data-action="read-more"]');
  if (description && readMore) {
    description.classList.add('is-clamped');
    requestAnimationFrame(() => { readMore.hidden = description.scrollHeight <= description.clientHeight + 2; });
    readMore.addEventListener('click', () => {
      const open = description.classList.toggle('is-clamped') === false;
      readMore.textContent = open ? 'Show less' : 'Read more';
    });
  }
  clubDetail.querySelectorAll('[data-action="more-requirements"]').forEach(button => button.addEventListener('click', () => {
    button.closest('ul').querySelectorAll('li[hidden]').forEach((li) => { li.hidden = false; });
    button.parentElement.remove();
  }));
  const ratingDialog = clubDetail.querySelector('.club-rating-dialog');
  // Rating needs a signed-in student: guests go to sign in, then come straight back to this rating.
  clubDetail.querySelector('[data-action="rate-club"]').addEventListener('click', async () => {
    const signedIn = await fetch('/api/student-auth/session?optional=1', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => response.status === 200).catch(() => false);
    if (!signedIn) { window.location.assign(`/pages/applicant-login.html?redirect=${encodeURIComponent(`/?rate=${normalizedClubId}`)}`); return; }
    ratingDialog.showModal();
  });
  clubDetail.querySelector('[data-action="close-rating"]').addEventListener('click', () => ratingDialog.close());
  ratingDialog.addEventListener('click', (event) => {
    if (event.target !== ratingDialog) return;
    const bounds = ratingDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ratingDialog.close();
  });

  clubDetail.querySelectorAll('.detail-club-cards .club-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select, textarea, video')) return;
      card.querySelector('.event-info-btn')?.click();
    });
  });
  clubDetail.querySelectorAll('.detail-content-section').forEach(section => {
    const track = section.querySelector('.detail-club-cards');
    const controls = section.querySelector('.detail-carousel-controls');
    const arrows = [...section.querySelectorAll('[data-carousel-direction]')];
    const updateControls = () => {
      const canScroll = track.scrollWidth > track.clientWidth + 2;
      controls.hidden = !canScroll;
      arrows[0].disabled = track.scrollLeft <= 1;
      arrows[1].disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    };
    controls.addEventListener('click', event => {
      const button = event.target.closest('[data-carousel-direction]');
      if (!button) return;
      track.scrollBy({ left: Number(button.dataset.carouselDirection) * track.clientWidth * 0.85, behavior: 'smooth' });
    });
    track.addEventListener('scroll', updateControls, { passive: true });
    requestAnimationFrame(updateControls);
  });
  clubDetailCarouselResizeHandler = () => {
    clubDetail.querySelectorAll('.detail-content-section').forEach(section => {
      const track = section.querySelector('.detail-club-cards');
      const arrows = [...section.querySelectorAll('[data-carousel-direction]')];
      section.querySelector('.detail-carousel-controls').hidden = track.scrollWidth <= track.clientWidth + 2;
      arrows[0].disabled = track.scrollLeft <= 1;
      arrows[1].disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    });
  };
  window.addEventListener('resize', clubDetailCarouselResizeHandler, { passive: true });
  // Opens the site calendar filtered to this club: its events plus its approved year plan.
  clubDetail.querySelector('[data-action="show-year-plan"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.setAttribute('aria-busy', 'true');
    let plan = [];
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(normalizedClubId)}/year-plan`, { cache: 'no-store' });
      if (response.ok) plan = (await response.json()).entries || [];
    } catch { /* Still open the calendar with the club's events. */ }
    button.removeAttribute('aria-busy');
    window.openClubCalendar?.(club, plan);
  });
  clubDetail.querySelectorAll('.event-info-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = CLUB_CONTENT_SECTIONS.find(section => section.key === btn.dataset.contentSection);
      const item = section && club[section.key]?.[Number(btn.dataset.contentIndex)];
      if (item) window.openClubContentInfoPopup(item, section.type, club, btn);
    });
  });

  showView('club');
}

let applicationSubmissionPending = false;
let applicationFormVersion = 0;
let applicationAutoCloseTimer;
document.getElementById('applicationBackHomeBtn').addEventListener('click', () => clearTimeout(applicationAutoCloseTimer));

async function openApplicationForm(clubId, allowClosedClub = false) {
  const club = state.clubs.find((item) => item.id === clubId);
  if (!club || (!allowClosedClub && club.status !== 'open')) return;
  // Applying needs a student account; send guests to sign in, then straight back to this form.
  const signedIn = await fetch('/api/student-auth/session', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => response.ok).catch(() => false);
  if (!signedIn) {
    window.location.assign(`/pages/applicant-login.html?redirect=${encodeURIComponent(`/?apply=${club.id}`)}`);
    return;
  }
  applicationFormVersion++;
  clearTimeout(applicationAutoCloseTimer);

  const activeView = Object.keys(views).find((name) => views[name]?.classList.contains('active'));
  if (activeView && activeView !== 'application') state.applicationReturnView = activeView;

  state.selectedClub = club;
  state.editingMyForm = null;
  state.defaultApplicantPhoto = null;
  applicationForm.reset();
  clearApplicantPhotoPreview();
  applicantPhotoInput.required = true;
  applicationForm.querySelector('.applicant-photo-field small').textContent = 'PNG, JPG, or WebP. Maximum size: 10 MB.';
  applicationForm.querySelector('[type="submit"]').textContent = 'Submit Application';
  applicationForm.querySelector('[type="submit"]').disabled = applicationSubmissionPending;
  applicationFeedback.textContent = '';
  applicationFeedback.classList.remove('is-error');
  applicationTitle.textContent = `Join ${club.name}`;
  applicationClubLogo.src = club.image;
  applicationClubLogo.alt = `${club.name} logo`;
  applicationClubLogo.classList.toggle('application-club-logo-contain', club.imageFit === 'contain');
  applicationFormIntro.textContent = club.applicationIntro || `Complete your details and answer ${club.name}'s questions.`;
  state.applicationQuestionsReady = false;
  renderApplicationFields({ applicationFields: [] });
  showView('application');
  const [profile, , accountPhoto] = await Promise.all([
    loadStudentProfile(), loadApplicationCommittees(clubId).then(() => loadPublicApplicationQuestions(clubId)), loadInterviewSlots(clubId),
    window.loadAccountPhoto?.().catch(() => null)
  ]);
  if (state.selectedClub?.id !== clubId || state.editingMyForm) return;
  if (accountPhoto?.url && !applicantPhotoInput.files[0]) {
    state.defaultApplicantPhoto = accountPhoto;
    applicantPhotoInput.required = false;
    applicantPhotoPreview.src = accountPhoto.url;
    applicantPhotoPreview.classList.remove('hidden');
    applicantPhotoPlaceholder.classList.add('hidden');
    applicationForm.querySelector('.applicant-photo-field small').textContent = 'Your account photo is selected. Choose a file to use a different photo.';
  }
  state.studentProfile = profile;
  if (profile) {
    const emailLocalPart = String(profile.email || '').split('@')[0];
    const miuEmailMatch = /@miuegypt\.edu\.eg$/i.test(String(profile.email || ''))
      ? emailLocalPart.match(/^([a-z]+)(\d{5,})$/i)
      : null;
    const nameParts = String(profile.name || '').trim().split(/\s+/).filter(Boolean);
    const defaults = {
      firstName: nameParts.shift() || miuEmailMatch?.[1] || '', lastName: nameParts.join(' '),
      universityId: window.MiuStudentFields ? window.MiuStudentFields.displayMiuId(profile.universityId, profile.email) : profile.universityId || '',
      major: profile.major, email: profile.email, phone: profile.phone, age: profile.age
    };
    for (const [field, value] of Object.entries(defaults)) {
      const input = applicationForm.elements.namedItem(field);
      if (input && !input.value) input.value = value || '';
    }
  }
}

async function loadStudentProfile() {
  try {
    const response = await fetch('/api/student-auth/profile', { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

let studentProfileSaveTimer = null;
let studentProfileSaveQueue = Promise.resolve();
function getStudentProfileFormData() {
  const value = (name) => String(applicationForm.elements.namedItem(name)?.value || '').trim();
  return {
    name: `${value('firstName')} ${value('lastName')}`.trim(),
    universityId: value('universityId'), major: value('major'), phone: value('phone'), age: value('age')
  };
}

async function saveStudentProfileFromForm() {
  if (!state.studentProfile) return;
  const profile = getStudentProfileFormData();
  const fields = window.MiuStudentFields;
  if (fields) {
    // Half-typed MIU ID or age: wait (the field explains the format when it is left or the form is sent).
    const universityId = fields.normalizeMiuId(profile.universityId);
    const age = fields.normalizeAge(profile.age);
    if (universityId === null || age === null) return state.studentProfile;
    profile.universityId = universityId;
    profile.age = age;
  }
  const save = studentProfileSaveQueue.then(async () => {
    const response = await fetch('/api/student-auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(profile)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Your profile was not saved. Please try again.');
    state.studentProfile = result;
    return result;
  });
  studentProfileSaveQueue = save.catch(() => {});
  const result = await save;
  return result;
}

for (const fieldName of ['firstName', 'lastName', 'universityId', 'major', 'phone', 'age']) {
  const input = applicationForm.elements.namedItem(fieldName);
  input?.addEventListener('input', () => {
    if (!state.studentProfile || state.editingMyForm) return;
    clearTimeout(studentProfileSaveTimer);
    studentProfileSaveTimer = setTimeout(() => {
      saveStudentProfileFromForm().catch((error) => {
        applicationFeedback.textContent = error.message;
        applicationFeedback.classList.add('is-error');
      });
    }, 700);
  });
  input?.addEventListener('change', () => {
    if (!state.studentProfile || state.editingMyForm) return;
    clearTimeout(studentProfileSaveTimer);
    saveStudentProfileFromForm().catch((error) => {
      applicationFeedback.textContent = error.message;
      applicationFeedback.classList.add('is-error');
    });
  });
}

function clearApplicantPhotoPreview() {
  if (applicantPhotoPreview.dataset.objectUrl) {
    URL.revokeObjectURL(applicantPhotoPreview.dataset.objectUrl);
    delete applicantPhotoPreview.dataset.objectUrl;
  }
  applicantPhotoPreview.removeAttribute('src');
  applicantPhotoPreview.classList.add('hidden');
  applicantPhotoPlaceholder.classList.remove('hidden');
  if (!state.editingMyForm && state.defaultApplicantPhoto?.url) {
    applicantPhotoPreview.src = state.defaultApplicantPhoto.url;
    applicantPhotoPreview.classList.remove('hidden');
    applicantPhotoPlaceholder.classList.add('hidden');
  }
}

applicantPhotoInput.addEventListener('change', () => {
  const file = applicantPhotoInput.files[0];
  if (!file) {
    clearApplicantPhotoPreview();
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    applicantPhotoInput.value = '';
    clearApplicantPhotoPreview();
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 10 MB.';
    applicationFeedback.classList.add('is-error');
    return;
  }

  if (applicantPhotoPreview.dataset.objectUrl) URL.revokeObjectURL(applicantPhotoPreview.dataset.objectUrl);
  const imageUrl = URL.createObjectURL(file);
  applicantPhotoPreview.dataset.objectUrl = imageUrl;
  applicantPhotoPreview.src = imageUrl;
  applicantPhotoPreview.classList.remove('hidden');
  applicantPhotoPlaceholder.classList.add('hidden');
  applicationFeedback.textContent = '';
  applicationFeedback.classList.remove('is-error');
});

let publicQuestionRequest = 0;
async function loadPublicApplicationQuestions(clubId) {
  const request = ++publicQuestionRequest, version = applicationFormVersion;
  const values = new Map([...applicationCustomFields.querySelectorAll('input, textarea, select')].map(input => [input.name, input.value]));
  const button = applicationForm.querySelector('[type="submit"]');
  button.disabled = true;
  state.applicationQuestionsReady = false;
  applicationFeedback.textContent = 'Loading application questions...';
  try {
    const response = await fetch('/api/clubs/' + clubId + '/application-form', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Could not load application questions.');
    if (request !== publicQuestionRequest || version !== applicationFormVersion || state.selectedClub?.id !== clubId) return;
    Object.assign(state.selectedClub, result);
    applicationFormIntro.textContent = result.applicationIntro || 'Complete your details and answer the questions below.';
    renderApplicationFields(state.selectedClub);
    for (const [name, value] of values) {
      const input = applicationForm.elements.namedItem(name);
      if (input) input.value = value;
    }
    state.applicationQuestionsReady = true;
    button.disabled = applicationSubmissionPending || applicationCommitteeInput.disabled || ![...applicationCommitteeInput.options].some(option => option.value && !option.disabled);
    applicationFeedback.textContent = '';
    applicationFeedback.classList.remove('is-error');
  } catch (error) {
    if (request !== publicQuestionRequest || version !== applicationFormVersion) return;
    applicationFeedback.textContent = error.message + ' ';
    applicationFeedback.classList.add('is-error');
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'secondary-btn'; retry.textContent = 'Retry loading questions';
    retry.addEventListener('click', () => loadPublicApplicationQuestions(clubId));
    applicationFeedback.append(retry);
  }
}
applicationCommitteeInput.addEventListener('change', () => {
  if (state.selectedClub) loadPublicApplicationQuestions(state.selectedClub.id);
});

function renderApplicationFields(club) {
  const fields = (club.applicationFields || []).filter(field => !field.committee || field.committee.toLowerCase() === String(applicationCommitteeInput.value || '').toLowerCase());
  state.activeApplicationFields = fields;
  applicationCustomFields.classList.toggle('hidden', fields.length === 0);
  applicationCustomFields.innerHTML = fields.map((field) => {
    const fieldName = `club-answer-${field.key}`;
    const required = field.required ? 'required' : '';
    if (field.type === 'select') {
      return `
        <div class="field-group">
          <label for="${escapeHtml(fieldName)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
          <select id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" ${required}>
            <option value="">Choose an option</option>
            ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const input = field.type === 'textarea'
      ? `<textarea id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" rows="4" maxlength="2000" ${required}></textarea>`
      : `<input id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" type="text" maxlength="2000" ${required} />`;
    return `
      <div class="field-group">
        <label for="${escapeHtml(fieldName)}">${escapeHtml(field.label)}${field.required ? ' *' : ''}</label>
        ${input}
      </div>
    `;
  }).join('');
}

applicationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = applicationForm.querySelector('[type="submit"]');
  if (applicationSubmissionPending || submitButton?.disabled || state.applicationQuestionsReady === false) return;
  const formVersion = applicationFormVersion;
  const editing = state.editingMyForm;
  const clubName = state.selectedClub.name;
  let closingAfterSuccess = false;

  const formData = new FormData(applicationForm);
  const applicantPhoto = applicantPhotoInput.files[0];
  if (!applicantPhoto && !state.editingMyForm && !state.defaultApplicantPhoto) {
    applicationFeedback.textContent = 'Upload your photo before submitting.';
    applicationFeedback.classList.add('is-error');
    return;
  }
  if (applicantPhoto && (!['image/png', 'image/jpeg', 'image/webp'].includes(applicantPhoto.type) || applicantPhoto.size > 10 * 1024 * 1024)) {
    applicationFeedback.textContent = 'Choose a PNG, JPG, or WebP photo up to 10 MB.';
    applicationFeedback.classList.add('is-error');
    return;
  }

  applicationSubmissionPending = true;
  const submitButtonText = submitButton?.textContent || '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = state.editingMyForm ? 'Saving...' : 'Submitting...';
  }

  const payload = {
    clubId: state.selectedClub?.id || 1,
    committee: formData.get('committee'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    studentName: `${formData.get('firstName')} ${formData.get('lastName')}`,
    universityId: formData.get('universityId'),
    major: formData.get('major'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    // Only the club's own interview times (checked again by the server for seats and date).
    ...(document.getElementById('applicationSlotGroup')?.hidden ? {} : { interviewSlotId: formData.get('interviewSlotId') || '' }),
    age: formData.get('age') || '20',
    motivation: formData.get('motivation') || 'Interested in joining this committee.',
    notes: formData.get('notes') || '',
    answers: (state.activeApplicationFields || state.selectedClub?.applicationFields || []).map((field) => ({
      key: field.key,
      value: formData.get(`club-answer-${field.key}`) || '',
    })),
    rating: 4,
  };

  try {
    if (!state.editingMyForm && state.studentProfile) {
      clearTimeout(studentProfileSaveTimer);
      await saveStudentProfileFromForm();
    }
    if (applicantPhoto) {
      const uploadedPhoto = await window.uploadImageToCloudinary(applicantPhoto, 'applicant');
      payload.photo = uploadedPhoto.url;
      payload.photoPublicId = uploadedPhoto.publicId;
      payload.photoUploadSignature = uploadedPhoto.signature;
      payload.photoVersion = uploadedPhoto.version;
    } else if (!state.editingMyForm && state.defaultApplicantPhoto) {
      payload.photo = state.defaultApplicantPhoto.url;
      payload.photoPublicId = state.defaultApplicantPhoto.publicId;
    }
    if (!state.editingMyForm && !payload.photo) throw new Error('Upload your photo before submitting.');
    const response = await fetch(editing ? `/api/my-forms/${encodeURIComponent(editing.id)}` : '/api/applications', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(editing?.token ? { Authorization: `Bearer ${editing.token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || (editing ? 'Could not save your changes.' : 'Could not submit the application.'));

    if (!editing && (response.status !== 201 || !result.application?.id || Number(result.application.clubId) !== Number(payload.clubId)
      || typeof result.managementToken !== 'string' || !result.managementToken.trim())) {
      throw new Error('The server accepted the form but could not link it to My Forms. Check with the club before submitting again to avoid a duplicate application.');
    }

    if (!editing) rememberMyForm(result.application.id, result.managementToken);
    if (formVersion !== applicationFormVersion || !views.application.classList.contains('active')) return;
    if (editing) {
      editing.application = result;
      state.myForms = state.myForms.map((item) => item.id === editing.id ? { ...item, application: result } : item);
      applicationFeedback.textContent = 'Your changes were saved.';
      if (applicantPhoto) {
        clearApplicantPhotoPreview();
        applicantPhotoPreview.src = result.photo;
        applicantPhotoPreview.classList.remove('hidden');
        applicantPhotoPlaceholder.classList.add('hidden');
        applicationForm.querySelector('.applicant-photo-field small').textContent = 'Current photo is kept. Upload a new photo only if you want to replace it.';
      }
      await loadMyForms();
    } else {
      applicationForm.reset();
      clearApplicantPhotoPreview();
      applicationFeedback.textContent = `Your application to ${clubName} was submitted.`;
      closingAfterSuccess = true;
      applicationAutoCloseTimer = setTimeout(() => {
        if (formVersion === applicationFormVersion && views.application.classList.contains('active')) {
          document.getElementById('applicationBackHomeBtn').click();
        }
      }, 1200);
    }
    applicationFeedback.classList.remove('is-error');
  } catch (error) {
    if (formVersion === applicationFormVersion) {
      applicationFeedback.textContent = error.message;
      applicationFeedback.classList.add('is-error');
    }
  } finally {
    applicationSubmissionPending = false;
    if (submitButton) {
      submitButton.disabled = closingAfterSuccess && formVersion === applicationFormVersion;
      if (formVersion === applicationFormVersion) submitButton.textContent = submitButtonText;
    }
  }
});

// Small social icons beside the club name, from the links saved by the clubs Excel import.
const CLUB_SOCIAL_ICONS = {
  instagram: ['Instagram', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'],
  tiktok: ['TikTok', '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.7"/>'],
  facebook: ['Facebook', '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3.5H9V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"/>'],
  linkedin: ['LinkedIn', '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V16M8 7.5v.01M12 16v-5.5M12 13a2.5 2.5 0 0 1 5 0v3"/>'],
  website: ['Website', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>']
};
function clubSocialKind(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') return 'instagram';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'facebook';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  return 'website';
}
function clubSocialLinks(club) {
  const links = (Array.isArray(club.socialLinks) ? club.socialLinks : []).filter(link => /^https:\/\//i.test(link));
  if (!links.length) return '';
  return `<nav class="club-social-links" aria-label="${escapeHtml(club.name)} social media">${links.map((link) => {
    const kind = clubSocialKind(link); if (!kind) return '';
    const [label, path] = CLUB_SOCIAL_ICONS[kind];
    return `<a class="club-social-link is-${kind}" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(club.name)} on ${label}" title="${label}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></a>`;
  }).join('')}</nav>`;
}

// A comma or line separated list of short qualities shows as tags; anything else stays a paragraph.
function clubRequirementsMarkup(text) {
  const value = String(text || '').trim();
  const items = value.replace(/\.\s*$/, '').split(/\s*(?:,|\n|;|•)\s*/).map((item) => item.trim()).filter(Boolean);
  if (items.length >= 3 && items.every((item) => item.length <= 32)) {
    // Show the first six; the rest open with "+N more" so the section stays short.
    const extra = items.length - 6;
    return `<ul class="detail-requirement-tags">${items.map((item, index) => `<li${index >= 6 ? ' hidden' : ''}>${escapeHtml(item)}</li>`).join('')}${extra > 0 ? `<li class="detail-requirement-more"><button type="button" data-action="more-requirements">+${extra} more</button></li>` : ''}</ul>`;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

// Interview times published by the club president, with seats left. Shown only when the club has times.
async function loadInterviewSlots(clubId, currentId = '', currentLabel = '') {
  const group = document.getElementById('applicationSlotGroup'), select = document.getElementById('applicationSlot'), hint = document.getElementById('applicationSlotHint');
  if (!group || !select) return;
  group.hidden = true; select.required = false;
  select.replaceChildren(new Option('Choose an interview time', ''));
  let slots = [];
  try {
    const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/interview-slots`, { cache: 'no-store' });
    if (response.ok) slots = (await response.json()).slots || [];
  } catch { /* The application still works; the club arranges interviews directly. */ }
  if (state.selectedClub?.id !== clubId) return;
  if (currentId && !slots.some((slot) => slot.id === currentId) && currentLabel) {
    const kept = new Option(`${currentLabel} (your current time)`, currentId); select.append(kept);
  }
  for (const slot of slots) {
    const own = slot.id === currentId;
    const seats = own ? 'your current time' : slot.seatsLeft > 0 ? `${slot.seatsLeft} seat${slot.seatsLeft === 1 ? '' : 's'} left` : 'full';
    const option = new Option(`${slot.label}${slot.location ? ` · ${slot.location}` : ''} — ${seats}`, slot.id);
    option.disabled = !own && slot.seatsLeft <= 0;
    select.append(option);
  }
  if (select.options.length <= 1) return;
  group.hidden = false;
  select.required = true;
  select.value = currentId || '';
  if (hint) hint.textContent = slots.every((slot) => slot.seatsLeft <= 0) && !currentId
    ? 'All interview times are full right now. Check back later or contact the club.'
    : 'Times set by the club president. Full times cannot be chosen.';
}
