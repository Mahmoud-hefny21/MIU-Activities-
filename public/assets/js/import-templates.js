// Excel templates for the admin imports, so every upload has the right columns.
// The data sheet has only headers; the example row lives on the "How to fill" sheet so it is never imported.
(() => {
  'use strict';
  const TEMPLATES = {
    clubs: {
      file: 'MIU clubs import template.xlsx',
      columns: [['Club Name', true, 'Robotics Club'], ['Category', false, 'Technology'], ['Tagline', false, 'Build robots together'], ['Description', true, 'A club for students who love robots and coding.'], ['Mission', false, ''], ['Vision', false, ''], ['Requirements', false, 'Basic coding'], ['Committees', false, 'Media, HR, Technical'], ['Club Logo (Google Drive link)', false, 'https://drive.google.com/...'], ['Social Links', false, 'https://instagram.com/...'], ['President Name', false, 'Ahmed Ali'], ['President MIU Email', false, 'ahmed2406700@miuegypt.edu.eg'], ['President MIU ID', false, '2406700'], ['President Phone', false, '01012345678'], ['President Faculty / Year', false, 'Engineering / 3'], ['Vice President Name', false, ''], ['Vice President MIU Email', false, ''], ['Vice President MIU ID', false, ''], ['Vice President Phone', false, ''], ['Vice President Faculty / Year', false, ''], ['Supervisor Name', false, ''], ['Supervisor MIU Email', false, ''], ['Faculty Advisor', false, '']],
      rules: ['One row per club. Club Name must be unique.', 'New clubs need a Description and a logo (Drive link or a picture placed in the row).', 'Existing clubs are updated by name; empty cells keep the current value.', 'President and Vice President get their dashboard accounts from their MIU emails.']
    },
    members: {
      file: 'MIU club members import template.xlsx',
      clubColumn: 'Club Name',
      columns: [['Full Name', true, 'Sara Nabil'], ['Phone Number', false, '01112223334'], ['MIU ID', false, '2025/00123'], ['MIU Email Address', true, 'sara2500123@miuegypt.edu.eg'], ['Faculty', false, 'Pharmacy'], ['Club Name', true, '(choose from the list)'], ['Role / Position in the club', false, 'Member'], ['Board Position', false, 'Head of PR'], ['Member Committee', false, 'Media']],
      rules: ['One row per member per club. A student in two clubs gets two rows.', 'Club Name: choose from the dropdown (names match the website).', 'Members with the same email in the same club are updated, not duplicated.', 'MIU ID can be left empty; it is read from the MIU email.']
    }
  };
  const loadExcel = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/assets/vendor/exceljs.min.js'; script.async = true;
    script.onload = () => resolve(window.ExcelJS); script.onerror = () => reject(new Error('Excel tools could not be loaded.')); document.head.append(script);
  });
  const red = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA8202B' } }, grey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };

  async function download(kind) {
    const spec = TEMPLATES[kind]; if (!spec) return;
    const ExcelJS = await loadExcel();
    const book = new ExcelJS.Workbook(); book.creator = 'MIU Activities';
    const data = book.addWorksheet(kind === 'clubs' ? 'Clubs' : 'Members', { views: [{ state: 'frozen', ySplit: 1 }] });
    data.columns = spec.columns.map(([name]) => ({ header: name, width: Math.max(16, name.length + 4) }));
    data.getRow(1).eachCell((cell, i) => { cell.fill = spec.columns[i - 1][1] ? red : grey; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
    data.getRow(1).height = 32;
    // IDs and phones stay as text (keeps leading zeros).
    spec.columns.forEach(([name], i) => { if (/MIU ID|Phone/.test(name)) data.getColumn(i + 1).numFmt = '@'; });
    if (spec.clubColumn) {
      // Dropdown of the website's club names, so names always match.
      const clubs = await fetch('/api/clubs', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).catch(() => []);
      const lists = book.addWorksheet('Club list', { state: 'veryHidden' });
      clubs.map(c => c.name).sort().forEach((name, i) => { lists.getCell(i + 1, 1).value = name; });
      const col = spec.columns.findIndex(c => c[0] === spec.clubColumn) + 1;
      if (clubs.length) for (let r = 2; r <= 1000; r++) data.getCell(r, col).dataValidation = { type: 'list', allowBlank: true, formulae: [`'Club list'!$A$1:$A$${clubs.length}`], showErrorMessage: true, errorTitle: 'Unknown club', error: 'Choose a club from the list.' };
    }
    const help = book.addWorksheet('How to fill');
    help.columns = [{ width: 34 }, { width: 70 }];
    help.addRow(['How to fill this template']).font = { bold: true, size: 14 };
    help.addRow(['Red columns are required; grey columns are optional.']);
    spec.rules.forEach(rule => help.addRow(['•', rule]));
    help.addRow([]);
    help.addRow(['Example row (do not copy this sheet into the data sheet)']).font = { bold: true };
    spec.columns.forEach(([name, required, example]) => help.addRow([name + (required ? ' *' : ''), example]));
    const blob = new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: spec.file });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  // A small "Download template" button for an import screen.
  function button(kind) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'v2-action secondary'; b.textContent = '⬇ Download the Excel template';
    b.addEventListener('click', async () => { b.disabled = true; try { await download(kind); } catch (error) { alert(error.message); } finally { b.disabled = false; } });
    return b;
  }
  window.MiuImportTemplates = { download, button, TEMPLATES };
})();
