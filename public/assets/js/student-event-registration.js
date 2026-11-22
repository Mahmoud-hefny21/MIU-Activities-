const controllers = new WeakMap();
window.unmountStudentEventRegistration = form => {
  controllers.get(form)?.abort();
  form.classList.remove('student-event-registration-active');
  form.querySelector('[data-student-cancel]')?.remove();
  form.querySelector('[data-student-qr]')?.remove();
  form.querySelector('[data-public-capacity]')?.remove();
  form.querySelectorAll('input').forEach(input => { input.required = true; const field = input.closest('.field-group'); if (field) { field.hidden = false; field.style.display = ''; } });
  const submit = form.querySelector('[type="submit"]'); submit.disabled = false; submit.textContent = 'Register for event';
};
window.mountStudentEventRegistration = async (form, feedback, endpoint) => {
  controllers.get(form)?.abort();
  form.classList.add('student-event-registration-active');
  const controller = new AbortController(); controllers.set(form, controller);
  const signal = controller.signal, submit = form.querySelector('[type="submit"]');
  form.hidden = false;
  form.querySelectorAll('input').forEach(input => { input.required = false; const field = input.closest('.field-group'); if (field) { field.hidden = true; field.style.display = 'none'; } });
  form.querySelector('[data-student-cancel]')?.remove();
  form.querySelector('[data-student-qr]')?.remove();
  const qr = document.createElement('a'); qr.className = 'secondary-btn'; qr.dataset.studentQr = ''; qr.textContent = 'Show my attendance QR'; qr.hidden = true;
  const clubRef = endpoint.match(/^\/api\/events\/(\d+)\/(\d+)\/registrations/), universityRef = endpoint.match(/^\/api\/university-content\/(\d+)\/registrations/);
  qr.href = '/pages/attendance-qr.html?' + new URLSearchParams(clubRef ? { source: 'club', clubId: clubRef[1], eventIndex: clubRef[2] } : { source: 'miu', clubId: 0, eventIndex: universityRef?.[1] || '' }); form.append(qr);
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-btn'; cancel.dataset.studentCancel = ''; cancel.textContent = 'Cancel registration'; cancel.hidden = true; form.append(cancel);
  submit.disabled = true; feedback.textContent = 'Checking registration status…';
  let busy = false, needsSignIn = false;
  const signInUrl = () => '/pages/applicant-login.html?redirect=' + encodeURIComponent(location.pathname + location.search + location.hash);
  async function status() {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal });
    const data = await response.json();
    if (response.status === 401) {
      feedback.replaceChildren(document.createTextNode('Sign in with your university student account to register. '));
      const link = document.createElement('a'); link.href = signInUrl(); link.textContent = 'Sign in'; feedback.append(link);
      // Registering needs a signed-in student: the button stays usable and goes to sign-in, then back here.
      needsSignIn = true; submit.disabled = false; submit.textContent = 'Sign in to register'; return;
    }
    if (!response.ok) throw new Error(data.message || 'Could not check registration.');
    feedback.textContent = data.message; submit.textContent = data.registered ? 'Already registered' : data.full ? 'Full Capacity' : 'Register for event';
    submit.disabled = data.registered || !data.eligible; cancel.hidden = !data.cancellationAllowed;
    qr.hidden = !data.registered; if (clubRef && data.eventRequestId) { const url=new URL(qr.href,location.origin);url.searchParams.set('eventRequestId',data.eventRequestId);qr.href=url.href; }
  }
  async function write(method) {
    if (busy) return; busy = true; submit.disabled = true; cancel.disabled = true; feedback.textContent = method === 'POST' ? 'Registering…' : 'Cancelling…';
    try {
      // A slow or dropped answer must not leave the button spinning; the server may still have saved it.
      const timeout = AbortSignal.timeout ? AbortSignal.timeout(30000) : null;
      const response = await fetch(endpoint, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}',
        signal: timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not confirm registration.');
      await status();
      if (method === 'POST' && data.registered) feedback.textContent = data.alreadyRegistered ? 'You are registered for this event. Registration is not proof of physical attendance.' : data.message;
    } catch (error) {
      if (signal.aborted) return;
      const message = error.name === 'TimeoutError' ? 'The server is taking too long to answer.' : error.message || 'Could not confirm registration.';
      // Show what the server actually stored (registered or not) instead of a stale or disabled button.
      try { await status(); } catch { submit.disabled = false; }
      feedback.textContent = submit.textContent === 'Already registered' && method === 'POST' ? 'You are registered for this event.' : message;
    }
    finally { busy = false; cancel.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); if (needsSignIn) { window.location.assign(signInUrl()); return; } void write('POST'); }, { signal });
  cancel.addEventListener('click', () => { if (window.confirm('Cancel your registration for this event?')) void write('DELETE'); }, { signal });
  try { await status(); } catch (error) { if (error.name !== 'AbortError') feedback.textContent = error.message || 'Registration is temporarily unavailable. Reload to retry.'; }
};
// The existing public university form keeps its name/email inputs. Capacity is
// still authoritative on the backend; this read only explains availability.
window.mountPublicEventCapacity = async (form, endpoint) => {
  controllers.get(form)?.abort();
  const controller = new AbortController(); controllers.set(form, controller);
  form.querySelector('[data-public-capacity]')?.remove();
  const status = document.createElement('p'); status.dataset.publicCapacity = ''; status.setAttribute('role','status'); form.append(status);
  const button = form.querySelector('[type=submit]'); let timer;
  controller.signal.addEventListener('abort', () => { clearTimeout(timer); status.remove(); });
  async function refresh() {
    try {
      if (document.hidden || form.hidden) return;
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration availability could not be checked.');
      button.disabled = data.registered || !data.eligible; button.textContent = data.registered ? 'Already registered' : data.full ? 'Full Capacity' : 'Register for event';
      status.textContent = data.capacity == null ? data.message : `${data.message} ${data.registeredCount} / ${data.capacity} places.`;
    } catch (error) { if (error.name !== 'AbortError') { status.textContent = error.message; button.disabled = true; } }
    finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 20000); }
  }
  button.disabled = true; await refresh();
};
