// Bug #14: "Validate scanned code" on the scanner page must always respond and send typed codes to the server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/js/reverse-attendance.js'), 'utf8');

// A minimal stand-in for the few DOM features the scanner script uses.
class El {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; this.attrs = {}; this.classList = { add() {}, remove() {}, toggle() {} }; this.style = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(name, fn) { this['on' + name] = fn; }
  reset() { for (const field of Object.values(this.elements || {})) field.value = ''; }
  querySelector(selector) { return this.lookup?.[selector] || new El(); }
  getContext() { return { drawImage() {}, getImageData: () => ({ data: [] }) }; }
  get options() { return this.children.flatMap(child => child.tagName === 'OPTGROUP' ? child.children : [child]); }
  get selectedOptions() { return this.options.filter(option => option.value === this.value); }
}
function page(fetcher) {
  const select = new El('select'), manual = new El('form'), button = new El('button'), textarea = new El('textarea');
  button.textContent = 'Validate scanned code';
  manual.elements = { token: textarea }; manual.lookup = { 'button[type=submit]': button };
  const settings = new El('form'); settings.elements = { capacity: new El(), timeZone: new El(), endTime: new El(), cancellationEnabled: new El() };
  const parts = { '[data-ra-event]': select, '[data-ra-manual]': manual, '[data-ra-settings]': settings };
  const host = new El('main'); host.dataset.reverseAttendance = 'scanner';
  host.querySelector = selector => (parts[selector] ||= new El());
  const document = { hidden: false, head: new El(), querySelector: () => host, addEventListener() {}, createElement: tag => new El(tag), createTextNode: text => ({ textContent: text }) };
  const window = { addEventListener() {}, isSecureContext: true, formatSiteTime: value => value };
  vm.runInNewContext(source, { window, document, navigator: {}, fetch: fetcher, location: { pathname: '/pages/attendance-scanner.html', search: '' }, URLSearchParams, Intl, Date, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame() {}, cancelAnimationFrame() {} });
  return { select, manual, button, textarea, result: parts['[data-ra-result]'] || host.querySelector('[data-ra-result]'), status: host.querySelector('[data-ra-status]') };
}
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const event = { source: 'club', clubId: 1, eventIndex: 3, eventRequestId: 2, title: 'Workshop', date: '2099-01-01', time: '10:00', logoLabel: 'Utopia' };
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const submit = async ui => { await ui.manual.onsubmit({ preventDefault() {}, target: ui.manual }); };

test('with no assigned event the button explains why instead of doing nothing', async () => {
  const calls = [];
  const ui = page(async url => { calls.push(url); return reply({ items: [] }); });
  await settle();
  ui.textarea.value = 'ra1.abc.def.ghi';
  await submit(ui);
  assert.equal(ui.result.hidden, false);
  assert.equal(ui.result.dataset.color, 'red');
  assert.match(ui.status.textContent, /Choose an assigned event first/);
  assert.equal(calls.some(url => url.includes('/scan')), false, 'nothing is sent without an event');
  assert.equal(ui.textarea.value, 'ra1.abc.def.ghi', 'the typed code is kept');
});

test('a pasted code is cleaned, sent to the server for the selected event, and the verdict is shown', async () => {
  const calls = [];
  const ui = page(async (url, options = {}) => {
    calls.push([url, options.body]);
    if (url.endsWith('/managed-events')) return reply({ items: [event] });
    if (url.includes('/scan')) return reply({ result: 'recorded', savedToDatabase: true, color: 'green', message: 'Checked in.' });
    return reply({ state: 'open', serverNow: Date.now(), settings: {}, registrationCount: 1, attendanceCount: 0, title: 'Workshop' });
  });
  await settle();
  ui.select.value = ui.select.options[0].value; // browsers select the first option by default
  ui.textarea.value = '  ra1.abc\n.def .ghi  ';
  await submit(ui);
  const scan = calls.find(([url]) => url.includes('/scan'));
  assert.equal(scan[0], '/api/reverse-attendance/club/1/3/scan?eventRequestId=2');
  assert.deepEqual(JSON.parse(scan[1]), { token: 'ra1.abc.def.ghi' });
  assert.equal(ui.result.dataset.color, 'green');
  assert.equal(ui.textarea.value, '', 'cleared after the server answered');
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.button.textContent, 'Validate scanned code');
});

test('an invalid code shows the server message; the same code can be re-sent at once; empty input is refused', async () => {
  let scans = 0;
  const ui = page(async url => {
    if (url.endsWith('/managed-events')) return reply({ items: [event] });
    if (url.includes('/scan')) { scans++; return reply({ code: 'INVALID_QR', message: 'Invalid attendance QR code.' }, 422); }
    return reply({ state: 'open', serverNow: Date.now(), settings: {} });
  });
  await settle();
  ui.select.value = ui.select.options[0].value;
  ui.textarea.value = 'TEST TEST TEST';
  await submit(ui);
  assert.equal(ui.result.dataset.color, 'red');
  assert.equal(ui.status.textContent, 'Invalid attendance QR code.');
  ui.textarea.value = 'TEST TEST TEST';
  await submit(ui);
  assert.equal(scans, 2, 'a manual resubmission is not silently ignored');
  ui.textarea.value = '   ';
  await submit(ui);
  assert.equal(scans, 2);
  assert.match(ui.result.children.map(child => child.textContent).join(' ') + ui.status.textContent, /Paste the scanned attendance code first|Invalid/);
});
