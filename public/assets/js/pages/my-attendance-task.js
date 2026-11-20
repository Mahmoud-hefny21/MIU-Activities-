(() => {
  const $ = id => document.getElementById(id), message = $('usherTaskMessage'), panel = $('usherTask');
  const api = window.MiuUI.createJsonClient({
    defaults: {"credentials":"same-origin","cache":"no-store"},
    fallbackMessage: "Could not load your task.", tolerateInvalidJson: true, includeStatus: false
  });
  const form = $('usherSelfCheckinForm'), takeButton = $('recordUsherAttendance'), feedback = $('usherSelfCheckinFeedback');
  let profileComplete = false;
  async function load() {
    try {
      const { task } = await api('/api/miu-attendance-task');
      if (!task) { panel.hidden = true; message.textContent = 'No MIU attendance task is currently assigned to your account.'; return; }
      panel.hidden = false; $('usherTaskTitle').textContent = task.eventTitle; $('usherTaskDate').textContent = task.eventDate;
      $('acceptUsherTask').hidden = task.accepted; $('openUsherQr').hidden = !task.accepted;
      $('openUsherQr').textContent = 'Open attendance scanner';
      for (const [id, key] of [['usherName', 'name'], ['usherUniversityId', 'universityId'], ['usherMajor', 'major']]) {
        if (!$(id).value) $(id).value = task.profile?.[key] || '';
      }
      // Assigned staff record only their own attendance. The name, MIU ID and major fields appear only
      // when the profile is missing one of them; otherwise one tap on "Take my attendance" is enough.
      profileComplete = ['name', 'universityId', 'major'].every(key => String(task.profile?.[key] || '').trim());
      form.hidden = !task.accepted;
      form.dataset.needsDetails = String(!profileComplete);
      for (const id of ['usherName', 'usherUniversityId', 'usherMajor']) {
        const field = $(id); field.hidden = profileComplete; const label = field.labels?.[0]; if (label) label.hidden = profileComplete;
      }
      takeButton.textContent = task.attendanceAsUsher ? 'Attendance recorded ✓' : 'Take my attendance';
      takeButton.disabled = Boolean(task.attendanceAsUsher);
      // Step 1 is your own attendance; the scanner becomes the main button once it is recorded.
      $('openUsherQr').className = task.attendanceAsUsher ? 'primary-btn' : 'secondary-btn';
      $('usherAttendanceStatus').textContent = task.attendanceAsUsher ? 'Your attendance is recorded as an Usher.'
        : task.accepted ? 'Tap "Take my attendance" to record your own attendance. It works only for you, on this device, on the event day.' : '';
      message.textContent = task.accepted ? 'Task accepted. Take your attendance, then open the scanner to check in students.' : 'A university event team assigned this attendance task to your account.';
    } catch (error) { message.textContent = error.message; }
  }
  $('acceptUsherTask').addEventListener('click', async () => {
    $('acceptUsherTask').disabled = true;
    try { const result = await api('/api/miu-attendance-task/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); message.textContent = result.message; await load(); }
    catch (error) { message.textContent = error.message; $('acceptUsherTask').disabled = false; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    takeButton.disabled = true; feedback.textContent = 'Recording your attendance…';
    try {
      const body = JSON.stringify({ name: $('usherName').value, universityId: $('usherUniversityId').value, major: $('usherMajor').value });
      const result = await api('/api/miu-attendance-task/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (result.savedToDatabase !== true) throw new Error('Your attendance was not confirmed. Please try again.');
      feedback.textContent = result.message;
      await load();
    } catch (error) { feedback.textContent = error.message; takeButton.disabled = false; }
  });
  $('openUsherQr').addEventListener('click', () => { location.href = '/pages/attendance-scanner.html'; });
  void load();
})();
