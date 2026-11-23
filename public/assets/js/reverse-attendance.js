// Official event label: "Event title — Club · Wed, 22 Oct 2026 · 6:00 PM".
window.MiuAttendanceLabel = (event) => {
  const organizer = event.source === 'miu' ? 'Misr International University' : (event.logoLabel || 'Club event');
  let day = 'Date not set';
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.date || '')) day = new Date(event.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = event.time ? (window.formatSiteTime?.(event.time) || event.time) : 'Time not set';
  return `${event.title} — ${organizer} · ${day} · ${time}`;
};
(() => {
  'use strict';
  const host = document.querySelector('[data-reverse-attendance]'); if (!host) return;
  const $ = selector => host.querySelector(selector), student = host.dataset.reverseAttendance === 'student', select = $('[data-ra-event]'), status = $('[data-ra-status]');
  let timer, countdown, generation = 0, eventController, stream, frame, detector, paused = true, scanning = false, currentWindow, serverOffset = 0, verificationToken, decoderPromise, cameraGeneration = 0;
  const ref = () => { try { return JSON.parse(select.value); } catch { return null; } };
  const endpoint = suffix => { const value = ref(); if (!value) throw new Error('Select an event first.'); return `/api/reverse-attendance/${value.source}/${value.clubId}/${value.eventIndex}${suffix || ''}${value.eventRequestId ? '?eventRequestId=' + value.eventRequestId : ''}`; };
  const api = async (url, options = {}) => { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); const value = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(value.message || 'The operation could not be confirmed. Check your connection and refresh.'); error.status = response.status; error.code = value.code; throw error; } return value; };
  const attendanceError = error => error.code === 'SCHEDULE_REQUIRED'
    ? 'This event needs a valid date and start time. Ask the event organizer to update the event schedule. The QR opens 30 minutes before it starts and refreshes every 15 seconds.'
    : error.message;
  const write = (url, body, method = 'POST') => api(url, { method, body: JSON.stringify(body) });
  function clearQr() { clearTimeout(timer); clearInterval(countdown); $('[data-ra-qr]')?.replaceChildren(); }
  function stopCamera() { cameraGeneration++; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); stream = null; paused = true; if ($('[data-ra-video]')) { $('[data-ra-video]').srcObject = null; $('[data-ra-video]').hidden = true; } }
  function showResult(value) {
    const box = $('[data-ra-result]'); box.replaceChildren(); box.hidden = false; box.dataset.color = value.color || 'red';
    // A big, clear verdict first so the scanning person knows at a glance what to do.
    const VERDICT = {
      recorded: ['✓', 'CHECKED IN', 'Attendance saved. Let the student in.'],
      duplicate: ['✕', 'ALREADY CHECKED IN', 'This student was already recorded for this event.'],
      device_used: ['✕', 'DEVICE ALREADY USED', 'This phone already checked in another student. The student must use their own phone.'],
      verification_required: ['!', 'ACCOUNT SWITCHED ON THIS PHONE', 'Check the student’s university ID card before approving.']
    };
    const [icon, title, hint] = VERDICT[value.result] || (value.color === 'green' ? VERDICT.recorded : ['✕', 'NOT ACCEPTED', 'Read the reason below.']);
    const head = document.createElement('div'); head.className = 'ra-verdict';
    const mark = document.createElement('span'); mark.className = 'ra-verdict-icon'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = icon;
    const words = document.createElement('div'); const big = document.createElement('b'); big.textContent = title; const small = document.createElement('span'); small.textContent = hint; words.append(big, small);
    head.append(mark, words); box.append(head);
    // Feel and hear the result without looking: one buzz for OK, two for a warning, three for refused.
    const pattern = value.color === 'green' ? [80] : value.color === 'yellow' ? [120, 80, 120] : [200, 80, 200, 80, 200];
    try { navigator.vibrate?.(pattern); } catch { /* vibration unsupported */ }
    try { const audio = new (window.AudioContext || window.webkitAudioContext)(), tone = audio.createOscillator(), gain = audio.createGain(); tone.frequency.value = value.color === 'green' ? 880 : value.color === 'yellow' ? 520 : 220; gain.gain.value = 0.08; tone.connect(gain).connect(audio.destination); tone.start(); tone.stop(audio.currentTime + (value.color === 'green' ? 0.15 : 0.4)); } catch { /* audio unavailable */ }
    const message = document.createElement('strong'); message.textContent = value.message; box.append(message);
    for (const [label, item] of [['Student',value.name],['University ID',value.universityId],['Event',value.eventTitle],['Type',value.eventType],['Registration',value.registrationStatus],['Attendance time',value.attendedAt ? new Date(value.attendedAt).toLocaleString() : '']]) if (item) { const line = document.createElement('p'); line.textContent = label + ': ' + item; box.append(line); }
    verificationToken = value.verificationToken;
    $('[data-ra-verify]').hidden = !(value.result === 'verification_required' && value.canVerify && verificationToken);
    $('[data-ra-verify]').reset(); $('[data-ra-next]').hidden = false;
    if (value.result === 'verification_required' && !value.canVerify) { const note = document.createElement('p'); note.textContent = 'Ask the authorized event supervisor to verify the student and scan their refreshed QR.'; box.append(note); }
  }
  // Fast queue: the camera keeps going by itself after a clear green or red verdict.
  // Yellow (account switched) waits for the supervisor, and the same code is not sent twice within 4 seconds.
  let lastCode = '', lastCodeAt = 0, resumeTimer;
  function autoResume(result) {
    clearTimeout(resumeTimer);
    if (result.result === 'verification_required' || !stream) return;
    resumeTimer = setTimeout(() => { if (!stream || scanning || verificationToken) return; paused = false; $('[data-ra-next]').hidden = true; status.textContent = 'Ready for the next student.'; }, result.color === 'green' ? 1200 : 2200);
  }
  // Returns true when the server answered (green, yellow or red), false when nothing was sent or it failed.
  async function submitToken(token, verified = false, manual = false) {
    // The camera reads the same QR many times a second; a typed or pasted code is always sent.
    if (!verified && !manual && token === lastCode && Date.now() - lastCodeAt < 4000) return false;
    if (!verified) { lastCode = token; lastCodeAt = Date.now(); }
    if (!ref()) { showResult({ color: 'red', message: select.options.length ? 'Choose the assigned event first, then validate the code.' : 'No events are assigned to your account, so codes cannot be validated here.' }); status.textContent = 'Choose an assigned event first.'; return false; }
    if (scanning) { status.textContent = 'Still validating the previous code…'; return false; }
    scanning = true; paused = true; $('[data-ra-next]').disabled = true;
    const ticket = generation; status.textContent = 'Validating with the server…';
    try {
      const result = await write(endpoint('/scan'), verified ? { verificationToken, verifiedIdentity: $('[data-ra-verify] [name=verified]').checked, verificationNote: $('[data-ra-verify] [name=note]').value } : { token });
      if (ticket !== generation) return;
      if (result.result === 'recorded' && result.savedToDatabase !== true) throw new Error('Attendance was not confirmed by the database.');
      // Show the verdict at once; the event totals refresh in the background.
      showResult(result); status.textContent = result.message;
      if (result.result === 'recorded') void loadOverview();
      autoResume(result);
      return true;
    } catch (error) { if (ticket === generation) { showResult({ color: 'red', message: error.message }); status.textContent = error.message; } if ([401,403].includes(error.status)) stopCamera(); return Boolean(error.status); }
    finally { scanning = false; $('[data-ra-next]').disabled = false; }
  }
  async function loadQr() {
    clearQr(); if (!ref() || document.hidden) return;
    const ticket = generation;
    eventController?.abort(); eventController = new AbortController();
    try {
      const data = await api(endpoint('/qr'), { signal: eventController.signal });
      if (ticket !== generation) return;
      serverOffset = data.serverNow - Date.now(); currentWindow = data;
      status.textContent = data.message;
      if (data.attended || data.state === 'closed') { $('[data-ra-clock]').textContent = data.attendedAt ? 'Recorded: ' + new Date(data.attendedAt).toLocaleString() : ''; return; }
      if (data.available) {
        await window.ensureQRCode(); if (ticket !== generation || Date.now() + serverOffset >= data.expiresAt) { if (ticket === generation) timer = setTimeout(loadQr, 50); return; }
        await window.renderAttendanceQr($('[data-ra-qr]'), data.token, { size: 336, logo: data.qrLogo, label: data.qrLabel, alt: `Rotating attendance QR for ${select.selectedOptions[0]?.textContent || 'event'}` });
      }
      const deadline = data.available ? data.expiresAt : data.opensAt;
      const tick = () => { const seconds = Math.max(0, Math.ceil((deadline - Date.now() - serverOffset) / 1000)); $('[data-ra-clock]').textContent = data.available ? `QR refreshes in ${seconds}s` : `QR available in ${Math.floor(seconds / 60)}m ${seconds % 60}s (${data.timeZone})`; if (!seconds) $('[data-ra-qr]').replaceChildren(); };
      tick(); countdown = setInterval(tick, 250);
      timer = setTimeout(loadQr, Math.min(15000, Math.max(100, deadline - Date.now() - serverOffset + 25)));
    } catch (error) { if (ticket !== generation || error.name === 'AbortError') return; clearQr(); status.textContent = attendanceError(error); if (error.status === 401) signInLink(); else if (!error.status || error.status >= 500) timer = setTimeout(loadQr, 5000); }
  }
  function signInLink() { const link = document.createElement('a'); link.className = 'secondary-btn'; link.href = '/pages/applicant-login.html?redirect=' + encodeURIComponent(location.pathname + location.search); link.textContent = 'Sign in'; status.append(document.createTextNode(' '), link);
    // Students' attendance comes from their own signed-in account: take them to sign in and straight back.
    if (student && !signInLink.redirecting) { signInLink.redirecting = true; setTimeout(() => location.assign(link.href), 900); } }
  async function loadOverview() {
    if (!ref()) return; const ticket = generation;
    try { const value = await api(endpoint()); if (ticket !== generation) return;
      currentWindow = value; serverOffset = value.serverNow - Date.now(); status.textContent = value.message || `Attendance: ${value.state}`;
      $('[data-ra-details]').textContent = `${window.MiuAttendanceLabel({ title: value.title, source: value.eventType === 'miu' ? 'miu' : 'club', logoLabel: value.clubName || value.logoLabel, date: value.date, time: value.time })} · ${value.registrationCount} registered / ${value.registrationCapacity ?? 'unlimited'} places · ${value.attendanceCount} attended`;
      $('[data-ra-camera]').disabled = value.state !== 'open';
      const form = $('[data-ra-settings]'); form.hidden = !value.canManageCapacity; form.elements.capacity.value = value.registrationCapacity ?? ''; form.elements.timeZone.value = value.settings.timeZone || 'Africa/Cairo'; form.elements.endTime.value = value.settings.endTime || ''; form.elements.cancellationEnabled.checked = value.settings.cancellationEnabled === true;
    } catch (error) { if (ticket !== generation) return; status.textContent = attendanceError(error); stopCamera(); if (error.status === 401) signInLink(); }
  }
  async function changeEvent() { generation++; eventController?.abort(); clearQr(); stopCamera(); if (!student) { $('[data-ra-result]').hidden = true; $('[data-ra-verify]').hidden = true; $('[data-ra-next]').hidden = true; $('[data-ra-settings]').hidden = true; verificationToken = null; } return student ? loadQr() : loadOverview(); }
  function decoder() { if (window.jsQR) return Promise.resolve(); if (!decoderPromise) decoderPromise = new Promise((resolve,reject) => { const script = document.createElement('script'); script.src = '/assets/vendor/jsQR.js'; script.onload = () => window.jsQR ? resolve() : reject(new Error('Attendance code reader unavailable.')); script.onerror = () => { decoderPromise = null; reject(new Error('Attendance code reader could not load. Check your connection.')); }; document.head.append(script); }); return decoderPromise; }
  const canvas = document.createElement('canvas'); const context = canvas.getContext('2d', { willReadFrequently: true });
  async function decode(source, width, height, options = {}) {
    const scale = Math.min(1, 1400 / Math.max(width,height)); canvas.width = Math.max(1, Math.round(width*scale)); canvas.height = Math.max(1, Math.round(height*scale)); context.drawImage(source,0,0,canvas.width,canvas.height);
    const image = context.getImageData(0,0,canvas.width,canvas.height);
    // Standard QR (built-in reader or jsQR, about 0.1 s). The older circular code takes seconds to search for,
    // so only uploaded images try it; the live camera never stalls on it.
    if (detector) { const values = await detector.detect(source); if (values[0]?.rawValue) return values[0].rawValue; }
    else { await decoder(); const found = window.jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data; if (found) return found; }
    if (options.search || options.circular) return window.decodeCircularAttendanceCode?.(image, options) || '';
    return '';
  }
  async function openCamera() {
    stopCamera(); const ticket = cameraGeneration; status.textContent = 'Requesting camera access…';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning requires HTTPS and a supported browser. You can upload an attendance code image instead.');
      if (window.BarcodeDetector && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats:['qr_code'] }); else { detector = null; await decoder(); }
      const opened = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
      if (ticket !== cameraGeneration) { opened.getTracks().forEach(track=>track.stop()); return; }
      stream = opened; const video = $('[data-ra-video]'); video.srcObject = stream; video.hidden = false; await video.play(); paused = false; status.textContent = 'Scan the current QR displayed on the student’s device.';
      let last = 0;
      const loop = async time => { if (!stream || ticket !== cameraGeneration) return; if (currentWindow?.endsAt && Date.now() + serverOffset >= currentWindow.endsAt) { stopCamera(); status.textContent = 'Attendance has closed for this event.'; return; } if (!paused && !scanning && time-last>200 && video.readyState>=2) { last = time; try { const code = await decode(video,video.videoWidth,video.videoHeight); if (code && ticket===cameraGeneration) await submitToken(code); } catch { status.textContent = 'Could not read this frame. Hold the QR steady or upload an attendance code image.'; } } if(stream&&ticket===cameraGeneration) frame=requestAnimationFrame(loop); };
      frame = requestAnimationFrame(loop);
    } catch(error) { stopCamera(); status.textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in browser settings, or upload a current QR image.' : error.message; }
  }
  select.addEventListener('change', changeEvent); $('[data-ra-refresh]').onclick = () => { if (!student) { $('[data-ra-settings]').dataset.dirty = ''; } void changeEvent(); };
  if (!student) {
    $('[data-ra-camera]').onclick = openCamera; $('[data-ra-close]').onclick = stopCamera;
    $('[data-ra-next]').onclick = () => { paused = false; verificationToken = null; $('[data-ra-result]').hidden = true; $('[data-ra-verify]').hidden = true; $('[data-ra-next]').hidden = true; status.textContent = stream ? 'Ready for the next student.' : 'Open the scanner for the next student.'; };
    $('[data-ra-manual]').onsubmit = async event => {
      event.preventDefault();
      const form = event.target, button = form.querySelector('button[type=submit]'), label = button.textContent;
      // Scanned text can arrive wrapped across lines or with spaces; an attendance code never contains any.
      const token = form.elements.token.value.replace(/\s+/g, '');
      if (!token) { showResult({ color: 'red', message: 'Paste the scanned attendance code first.' }); return; }
      if (button.disabled) return;
      button.disabled = true; button.textContent = 'Validating…'; form.setAttribute('aria-busy', 'true');
      try { if (await submitToken(token, false, true)) form.reset(); }
      finally { button.disabled = false; button.textContent = label; form.removeAttribute('aria-busy'); }
    };
    $('[data-ra-verify]').onsubmit = event => { event.preventDefault(); void submitToken('',true); };
    $('[data-ra-file]').onchange = async event => { const file=event.target.files?.[0]; if(!file)return; try { if(file.size>10*1024*1024)throw new Error('Choose an attendance code image up to 10 MB.'); const bitmap=await createImageBitmap(file); let code;try{code=await decode(bitmap,bitmap.width,bitmap.height,{search:true});}finally{bitmap.close();}if(!code)throw new Error('No attendance code was found in this image.');await submitToken(code); }catch(error){status.textContent=error.message;}finally{event.target.value='';} };
    $('[data-ra-settings]').onsubmit = async event => { event.preventDefault(); const form=event.target,button=form.querySelector('button'),feedback=form.querySelector('[data-ra-settings-feedback]');button.disabled=true;try{const result=await write(endpoint('/settings'),{capacity:form.elements.capacity.value===''?null:Number(form.elements.capacity.value),timeZone:form.elements.timeZone.value,endTime:form.elements.endTime.value,cancellationEnabled:form.elements.cancellationEnabled.checked},'PUT');if(result.savedToDatabase!==true)throw new Error('The settings were not confirmed.');await loadOverview();feedback.textContent=result.message;}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;} };
  }
  document.addEventListener('visibilitychange', () => { if(document.hidden){generation++;clearQr();stopCamera();eventController?.abort();}else if(student)void loadQr();else void loadOverview(); });
  window.addEventListener('pagehide',()=>{generation++;clearQr();stopCamera();eventController?.abort();});
  window.addEventListener('offline',()=>{generation++;clearQr();stopCamera();status.textContent='You are offline. Attendance cannot be confirmed until the connection returns.';});
  window.addEventListener('online',()=>{if(ref())void changeEvent();});
  (async()=>{try{const data=await api('/api/reverse-attendance/'+(student?'my-events':'managed-events'));select.replaceChildren();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());const rank=e=>!e.date?3:e.date===today?0:e.date>today?1:2;/* Today first, then upcoming (soonest first), then past (latest first); each group is labelled. */const items=[...data.items].sort((a,b)=>rank(a)-rank(b)||(rank(a)===2?String(b.date).localeCompare(String(a.date)):String(a.date||'').localeCompare(String(b.date||'')))||String(a.time||'').localeCompare(String(b.time||'')));const groupNames=['Today','Upcoming','Past events','Date not set'],groups=new Map();for(const event of items){const option=document.createElement('option');option.value=JSON.stringify({source:event.source,clubId:event.clubId,eventIndex:event.eventIndex,eventRequestId:event.eventRequestId});option.textContent=window.MiuAttendanceLabel(event);const name=groupNames[rank(event)];if(!groups.has(name)){const group=document.createElement('optgroup');group.label=name;groups.set(name,group);select.append(group);}groups.get(name).append(option);}const params=new URLSearchParams(location.search);if(params.has('eventIndex')){const match=[...select.options].find(option=>{const item=JSON.parse(option.value);return item.source===params.get('source')&&item.clubId===Number(params.get('clubId'))&&(params.has('eventRequestId')?item.eventRequestId===Number(params.get('eventRequestId')):item.eventIndex===Number(params.get('eventIndex')));});if(match)select.value=match.value;}if(!select.options.length){status.textContent=student?'No registered events yet. Register from an event page first.':'No events are assigned to your account.';return;}await changeEvent();}catch(error){status.textContent=attendanceError(error);if(error.status===401)signInLink();}})();
})();
