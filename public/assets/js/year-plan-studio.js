// President-only Excel upload for the club's year plan calendar. Uploads go to review; the Dean's approval publishes them.
(() => {
  const panel = document.getElementById('yearPlanPanel');
  if (!panel) return;
  const fileInput = document.getElementById('yearPlanFile');
  const uploadLabel = fileInput.closest('label');
  const clearButton = document.getElementById('yearPlanClear');
  const status = document.getElementById('yearPlanStatus');
  const skippedList = document.getElementById('yearPlanSkipped');
  const STAGES = { pending_supervisor: 'the supervisor', pending_pr: 'the PR Department', pending_english: 'the English Department', pending_dean: 'the Dean' };

  const formatDate = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const describe = (plan) => {
    const count = plan.entries.length;
    const published = count
      ? `${count} ${count === 1 ? 'activity is' : 'activities are'} on your club calendar${plan.updatedAt ? ` (approved ${formatDate(plan.updatedAt)})` : ''}.`
      : 'No approved year plan on your club calendar yet.';
    const request = plan.request;
    if (!request || request.status === 'published') return published;
    if (STAGES[request.status]) return `${published} Your new plan (${request.count} activities) is waiting for approval from ${STAGES[request.status]}.`;
    if (request.status === 'changes_requested') return `${published} Reviewers asked for changes to your last plan${request.notice ? `: ${request.notice}` : '.'} Fix the Excel sheet and upload it again.`;
    if (request.status === 'rejected') return `${published} Your last plan was rejected${request.notice ? `: ${request.notice}` : '.'}`;
    return published;
  };
  const render = (plan) => {
    const inReview = Boolean(STAGES[plan.request?.status]);
    uploadLabel.classList.toggle('is-disabled', inReview);
    fileInput.disabled = inReview;
    clearButton.hidden = !plan.entries.length;
    setStatus(describe(plan));
  };
  const showSkipped = (skipped = []) => {
    skippedList.replaceChildren(...skipped.slice(0, 20).map(({ row, reason }) => {
      const item = document.createElement('li');
      item.textContent = `Row ${row}: ${reason}`;
      return item;
    }));
    skippedList.hidden = !skipped.length;
  };

  let current = null;
  const load = () => fetch('/api/club/year-plan', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((plan) => {
      // The server only answers presidents, so a failed load keeps the panel hidden.
      if (!plan) return;
      current = plan;
      panel.hidden = false;
      render(plan);
    })
    .catch(() => {});
  load();

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setStatus('The Excel file must be 5 MB or smaller.', true);
    setStatus('Uploading your plan…');
    showSkipped();
    try {
      const response = await fetch('/api/club/year-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: await readAsDataUrl(file) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return setStatus(result.message || 'Could not upload the plan. Try again.', true);
      current = { ...(current || { entries: [] }), request: result.request };
      render(current);
      const skippedNote = result.skipped?.length ? ` ${result.skipped.length} row(s) were skipped:` : '';
      setStatus(`Plan sent for approval. ${describe(current)}${skippedNote}`);
      showSkipped(result.skipped);
    } catch {
      setStatus('Could not upload the plan. Check your connection and try again.', true);
    }
  });

  clearButton.addEventListener('click', async () => {
    if (!window.confirm('Remove the approved year plan from your club calendar?')) return;
    try {
      const response = await fetch('/api/club/year-plan', { method: 'DELETE' });
      if (!response.ok) return setStatus('Could not remove the plan. Try again.', true);
      showSkipped();
      await load();
    } catch {
      setStatus('Could not remove the plan. Check your connection and try again.', true);
    }
  });
})();
