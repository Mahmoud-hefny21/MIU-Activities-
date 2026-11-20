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

  // Sends the raw sheet; the server finds the header, recognises the columns and fixes mistakes (see excel-autofix).
  async function readGrid(file) {
    const ExcelJS = await loadExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = [...workbook.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
    if (!sheet || sheet.actualRowCount < 2) throw new Error('The workbook has no rows to import.');
    const grid = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells = [];
      for (let col = 1; col <= sheet.columnCount; col++) cells.push(text(row.getCell(col)));
      grid[rowNumber - 1] = cells;
    });
    return Array.from(grid, row => row || []);
  }
  async function downloadCleaned(rows, changes) {
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Members (cleaned)');
    const heads = [['name', 'Full Name'], ['phone', 'Phone Number'], ['universityId', 'MIU ID'], ['email', 'MIU Email Address'], ['faculty', 'Faculty'], ['clubName', 'Club Name'], ['role', 'Role / Position in the club'], ['boardPosition', 'Board Position'], ['committee', 'Member Committee']];
    sheet.addRow(heads.map(h => h[1])).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA8202B' } }; });
    const labels = { name: 'Full Name', phone: 'Phone Number', universityId: 'MIU ID', email: 'MIU Email Address', faculty: 'Faculty', clubName: 'Club Name', role: 'Role / Position', boardPosition: 'Board Position', committee: 'Member Committee' };
    for (const r of rows) {
      const row = sheet.addRow(heads.map(([f]) => r[f] || ''));
      heads.forEach(([f], i) => { const fix = changes.find(c => c.rowNumber === r.rowNumber && c.column === labels[f]); if (fix) { const cell = row.getCell(i + 1); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } }; cell.note = `${fix.why}. Was: ${fix.before || '(empty)'}`; } });
    }
    sheet.columns.forEach(col => { col.width = 24; }); sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: heads.length } };
    const blob = new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'members-cleaned.xlsx' });
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  window.mountAdminMemberImport = ({ request, escape, invalidate, refresh }) => {
    const $ = id => document.getElementById(id);
    $('toolContent').innerHTML = `<section class="v2-excel-review">
      <p class="v2-panel-note">Upload the club members sheet with these columns: <b>Full Name, Phone Number, MIU ID, MIU Email Address, Faculty, Club Name, Role / Position in the club, Board Position, Member Committee</b>. Full Name, MIU Email Address and Club Name are required. Messy sheets are fine: titles above the header, extra spaces, wrong capital letters, email and phone typos and misspelled club names are fixed automatically, and every fix is shown before saving. Each row is added to its club, or updates the member with the same email in that club. Nothing is deleted, and nothing is saved until you confirm.</p>
      <label class="v2-form">Members workbook (.xlsx)<input id="memberImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
      <p id="memberImportStatus" class="v2-panel-note" role="status" aria-live="polite"></p>
      <div id="memberImportActions" hidden><button id="memberImportConfirm" type="button" class="v2-action">Import members</button></div>
      <div id="memberImportPreview"></div></section>`;
    const input = $('memberImportFile'), status = $('memberImportStatus'), preview = $('memberImportPreview'), actions = $('memberImportActions'), confirm = $('memberImportConfirm');
    let grid = [], cleaned = null;
    const render = (result) => {
      const badge = s => s === 'error' ? 'Error' : s === 'updated' ? 'Update' : 'Add';
      const fixes = result.fixes?.changes || [];
      if (result.cleanedRows) cleaned = { rows: result.cleanedRows, changes: fixes };
      const fixTable = fixes.length ? `<details class="v2-autofix" open><summary><b>${fixes.length}</b> automatic fix${fixes.length === 1 ? '' : 'es'} (header found in row ${result.fixes.headerRow}) — only mistakes and formatting were changed</summary>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Row</th><th>Column</th><th>Before</th><th>After</th><th>Why</th></tr></thead><tbody>
        ${fixes.map(f => `<tr><td>${f.rowNumber}</td><td>${escape(f.column)}</td><td>${escape(f.before || '(empty)')}</td><td><b>${escape(f.after)}</b></td><td>${escape(f.why)}</td></tr>`).join('')}</tbody></table></div>
        <button type="button" class="v2-action secondary" id="memberImportDownload">Download the cleaned sheet</button></details>` : (result.fixes ? '<p class="v2-panel-note">The sheet was already clean: no fixes needed.</p>' : '');
      preview.innerHTML = fixTable + `<p class="v2-panel-note"><b>${result.added}</b> to add · <b>${result.updated}</b> to update · <b>${result.errors}</b> with errors</p>
        <div class="v2-table-wrap"><table class="v2-table"><thead><tr><th>Row</th><th>Result</th><th>Name</th><th>Email</th><th>Club</th><th>Details</th></tr></thead><tbody>
        ${result.rows.map(r => `<tr class="member-import-${escape(r.status)}"><td>${r.rowNumber}</td><td>${badge(r.status)}</td><td>${escape(r.name)}</td><td>${escape(r.email)}</td><td>${escape(r.club)}</td><td>${escape(r.message)}</td></tr>`).join('')}
        </tbody></table></div>`;
      $('memberImportDownload')?.addEventListener('click', () => cleaned && downloadCleaned(cleaned.rows, cleaned.changes));
    };
    input.addEventListener('change', async () => {
      actions.hidden = true; preview.replaceChildren(); grid = []; cleaned = null;
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) { status.textContent = 'The workbook is larger than 20 MB.'; return; }
      status.textContent = 'Reading the workbook…';
      try {
        grid = await readGrid(file);
        status.textContent = 'Checking and fixing the sheet…';
        const result = await request('/api/admin/members/import', { method: 'POST', body: JSON.stringify({ grid, dryRun: true }) });
        render(result);
        status.textContent = result.added + result.updated ? 'Review the preview, then import. Rows with errors are skipped.' : 'No rows can be imported. Fix the errors in the sheet and upload it again.';
        actions.hidden = !(result.added + result.updated);
      } catch (error) { status.textContent = error.message || 'The workbook could not be read.'; }
    });
    confirm.addEventListener('click', async () => {
      confirm.disabled = true; status.textContent = 'Importing members…';
      try {
        const result = await request('/api/admin/members/import', { method: 'POST', body: JSON.stringify({ grid }) });
        render(result);
        status.textContent = `Done: ${result.added} added, ${result.updated} updated across ${result.savedClubs} clubs. ${result.errors ? result.errors + ' rows with errors were skipped.' : ''}`;
        actions.hidden = true; input.value = '';
        invalidate?.('members'); refresh?.();
      } catch (error) { status.textContent = error.message || 'Members could not be imported.'; }
      finally { confirm.disabled = false; }
    });
  };
})();
