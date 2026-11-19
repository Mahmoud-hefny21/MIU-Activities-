// Admin tool: import club members from the standard members sheet. The admin first sees a preview of every
// row (added, updated or error), then confirms. Nothing is saved before the confirmation.
(() => {
  'use strict';
  // Header text -> field. Matching is loose so small wording changes in the sheet still work.
  const COLUMNS = [
    ['name', /full\s*name|^name$/i], ['phone', /phone|mobile/i], ['universityId', /miu\s*id|university\s*id|student\s*id/i],
    ['email', /e-?mail/i], ['faculty', /faculty|major/i], ['clubName', /club\s*name|^club$/i],
    ['boardPosition', /board\s*position/i], ['role', /role|position/i], ['committee', /committee/i]
  ];
  const loadExcel = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/assets/vendor/exceljs.min.js'; script.async = true;
    script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel reader failed to start.'));
    script.onerror = () => reject(new Error('Excel reader could not be loaded.')); document.head.append(script);
  });
  const text = (cell) => {
    const value = cell?.value;
    if (value == null) return '';
    if (typeof value === 'object') return value.text || value.result || (value.richText || []).map(part => part.text).join('') || value.hyperlink?.replace(/^mailto:/i, '') || '';
    return String(value);
  };

  async function readRows(file) {
    const ExcelJS = await loadExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets.find(ws => ws.actualRowCount > 1) || workbook.worksheets[0];
    if (!sheet) throw new Error('The workbook has no sheets.');
    const header = sheet.getRow(1), map = {};
    header.eachCell((cell, col) => {
      const label = text(cell).trim();
      const match = COLUMNS.find(([field, pattern]) => !Object.values(map).includes(field) && pattern.test(label));
      if (match) map[col] = match[0];
    });
    const missing = ['name', 'email', 'clubName'].filter(field => !Object.values(map).includes(field));
    if (missing.length) throw new Error(`The sheet is missing these columns: ${missing.map(f => ({ name: 'Full Name', email: 'MIU Email Address', clubName: 'Club Name' })[f]).join(', ')}.`);
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const item = { rowNumber };
      for (const [col, field] of Object.entries(map)) item[field] = text(row.getCell(Number(col))).trim();
      if (Object.entries(item).some(([key, value]) => key !== 'rowNumber' && value)) rows.push(item);
    });
    if (!rows.length) throw new Error('The sheet has no member rows under the header.');
    return rows;
  }

  window.mountAdminMemberImport = ({ request, escape, invalidate, refresh }) => {
    const $ = id => document.getElementById(id);
    $('toolContent').innerHTML = `<section class="v2-excel-review">
      <p class="v2-panel-note">Upload the club members sheet with these columns: <b>Full Name, Phone Number, MIU ID, MIU Email Address, Faculty, Club Name, Role / Position in the club, Board Position, Member Committee</b>. Full Name, MIU Email Address and Club Name are required. Each row is added to its club, or updates the member with the same email in that club. Nothing is deleted, and nothing is saved until you confirm.</p>
      <label class="v2-form">Members workbook (.xlsx)<input id="memberImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
      <p id="memberImportStatus" class="v2-panel-note" role="status" aria-live="polite"></p>
      <div id="memberImportActions" hidden><button id="memberImportConfirm" type="button" class="v2-action">Import members</button></div>
      <div id="memberImportPreview"></div></section>`;
    const input = $('memberImportFile'), status = $('memberImportStatus'), preview = $('memberImportPreview'), actions = $('memberImportActions'), confirm = $('memberImportConfirm');
    let rows = [];
    const render = (result) => {
      const badge = s => s === 'error' ? 'Error' : s === 'updated' ? 'Update' : 'Add';
      preview.innerHTML = `<p class="v2-panel-note"><b>${result.added}</b> to add · <b>${result.updated}</b> to update · <b>${result.errors}</b> with errors</p>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Row</th><th>Result</th><th>Name</th><th>Email</th><th>Club</th><th>Details</th></tr></thead><tbody>
        ${result.rows.map(r => `<tr class="member-import-${escape(r.status)}"><td>${r.rowNumber}</td><td>${badge(r.status)}</td><td>${escape(r.name)}</td><td>${escape(r.email)}</td><td>${escape(r.club)}</td><td>${escape(r.message)}</td></tr>`).join('')}
        </tbody></table></div>`;
    };
    input.addEventListener('change', async () => {
      actions.hidden = true; preview.replaceChildren(); rows = [];
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) { status.textContent = 'The workbook is larger than 20 MB.'; return; }
      status.textContent = 'Reading the workbook…';
      try {
        rows = await readRows(file);
        status.textContent = `Checking ${rows.length} rows…`;
        const result = await request('/api/admin/members/import', { method: 'POST', body: JSON.stringify({ rows, dryRun: true }) });
        render(result);
        status.textContent = result.added + result.updated ? 'Review the preview, then import. Rows with errors are skipped.' : 'No rows can be imported. Fix the errors in the sheet and upload it again.';
        actions.hidden = !(result.added + result.updated);
      } catch (error) { status.textContent = error.message || 'The workbook could not be read.'; }
    });
    confirm.addEventListener('click', async () => {
      confirm.disabled = true; status.textContent = 'Importing members…';
      try {
        const result = await request('/api/admin/members/import', { method: 'POST', body: JSON.stringify({ rows }) });
        render(result);
        status.textContent = `Done: ${result.added} added, ${result.updated} updated across ${result.savedClubs} clubs. ${result.errors ? result.errors + ' rows with errors were skipped.' : ''}`;
        actions.hidden = true; input.value = '';
        invalidate?.('members'); refresh?.();
      } catch (error) { status.textContent = error.message || 'Members could not be imported.'; }
      finally { confirm.disabled = false; }
    });
  };
})();
