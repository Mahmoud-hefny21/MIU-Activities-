// President "Interview times": add days and times with seats; applicants book one when they apply.
// The server keeps booked times safe (cannot remove them or set seats below the bookings).
(() => {
  'use strict';
  const panel = document.getElementById('presidentInterviewSlots');
  if (!panel) return;
  const form = document.getElementById('interviewSlotForm');
  const list = document.getElementById('interviewSlotList');
  const feedback = document.getElementById('interviewSlotFeedback');
  let slots = [], loaded = false, busy = false;

  const say = (text, error = false) => { feedback.textContent = text; feedback.classList.toggle('is-error', error); };
  const plain = (slot) => ({ id: slot.id, date: slot.date, start: slot.start, end: slot.end, capacity: Number(slot.capacity), location: slot.location || '' });

  async function request(method, body) {
    const response = await fetch('/api/club/interview-slots', {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Interview times are unavailable right now.');
    return data;
  }

  function render() {
    list.replaceChildren();
    if (!slots.length) {
      const empty = document.createElement('li'); empty.className = 'interview-slot-empty';
      empty.textContent = 'No interview times yet. Applicants will not see a time choice until you add one.';
      list.append(empty); return;
    }
    for (const slot of slots) {
      const item = document.createElement('li'); item.className = 'interview-slot-item' + (slot.past ? ' is-past' : '');
      const text = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = slot.label;
      const meta = document.createElement('span');
      meta.textContent = [slot.location, `${slot.booked} of ${slot.capacity} booked`, slot.past ? 'Passed' : slot.booked >= slot.capacity ? 'Full' : ''].filter(Boolean).join(' · ');
      text.append(title, meta);
      const seats = document.createElement('label'); seats.className = 'interview-slot-seats';
      const input = document.createElement('input'); input.type = 'number'; input.min = String(Math.max(1, slot.booked)); input.max = '500'; input.value = String(slot.capacity);
      input.setAttribute('aria-label', `Seats for ${slot.label}`);
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < Math.max(1, slot.booked)) { input.value = String(slot.capacity); say(`Seats cannot be fewer than ${Math.max(1, slot.booked)}.`, true); return; }
        void save(slots.map((item) => item.id === slot.id ? { ...plain(item), capacity: value } : plain(item)), 'Seats updated.');
      });
      seats.append(document.createTextNode('Seats '), input);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-btn'; remove.textContent = 'Remove';
      remove.disabled = slot.booked > 0; if (slot.booked > 0) remove.title = 'Booked times cannot be removed.';
      remove.addEventListener('click', () => void save(slots.filter((item) => item.id !== slot.id).map(plain), 'Interview time removed.'));
      item.append(text, seats, remove); list.append(item);
    }
  }

  async function load() {
    try { slots = (await request('GET')).slots || []; loaded = true; render(); }
    catch (error) { say(error.message, true); }
  }

  async function save(next, done) {
    if (busy) return; busy = true; say('Saving…');
    try { slots = (await request('PUT', { slots: next })).slots || []; render(); say(done); }
    catch (error) { say(error.message, true); await load(); }
    finally { busy = false; }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const slot = { date: data.get('date'), start: data.get('start'), end: data.get('end'), capacity: Number(data.get('capacity')), location: String(data.get('location') || '').trim() };
    if (slot.end <= slot.start) { say('The end time must be after the start time.', true); return; }
    void save([...slots.map(plain), slot], 'Interview time added. Applicants can book it now.').then(() => { if (!feedback.classList.contains('is-error')) { form.elements.start.value = form.elements.end.value; form.elements.end.value = ''; } });
  });

  // Load the first time the president opens this section.
  const section = panel.closest('section');
  const maybeLoad = () => { if (!loaded && section && !section.classList.contains('hidden')) void load(); };
  new MutationObserver(maybeLoad).observe(section, { attributes: true, attributeFilter: ['class'] });
  maybeLoad();
})();
