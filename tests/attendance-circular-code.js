const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('public/assets/js/attendance-qr-style.js', 'utf8')
  .replace('window.renderAttendanceQr=renderAttendanceQr;', 'window.__test={makePayload,toBits,toSymbols,pointAt,MARKER,RINGS,SECTORS};window.renderAttendanceQr=renderAttendanceQr;');
const window = {};
vm.runInNewContext(source, { window, TextEncoder, TextDecoder, document: {}, console });
const { makePayload, toSymbols, pointAt, MARKER, RINGS, SECTORS } = window.__test;

function imageWithCode(value, rotation = 0, factor = 1, center = [.5, .5]) {
  const width = 1344, height = 1344, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const symbols = [...MARKER, ...toSymbols(makePayload(value))];
  const setBright = (x, y) => {
    const index = (Math.round(y) * width + Math.round(x)) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
  };
  for (let ring = 0; ring < RINGS; ring++) for (let sector = 0; sector < SECTORS; sector++) {
    const symbol = symbols[ring * SECTORS + sector] || 0;
    if (!symbol) continue;
    const fraction = ring === 0 && symbol === 7 ? 1 : .18 + (symbol - 1) * .12;
    for (let i = 0; i < 41; i++) {
      const offset = -.49 + i * .0245;
      if (Math.abs(offset) > fraction / 2) continue;
      const [nx, ny] = pointAt(ring, sector, 336, rotation, offset);
      setBright((nx - 168) * (width * .97 / 336) * factor + width * center[0], (ny - 168) * (width * .97 / 336) * factor + width * center[1]);
    }
  }
  return { width, height, data };
}

for (const [rotation, factor] of [[0,1],[7.5,.84],[14.5,.66],[24.5,.5]]) {
  const expected = 'expiring.attendance.token.20261019.abcdef1234567890';
  assert.equal(window.decodeCircularAttendanceCode(imageWithCode(expected, rotation, factor)), expected, `round trip should work at rotation ${rotation} and size ${factor}`);
}
assert.equal(window.decodeCircularAttendanceCode({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }), '', 'invalid frames must be ignored');
const offCenter = imageWithCode('uploaded circular attendance code', 19, .8, [.3, .7]);
assert.equal(window.decodeCircularAttendanceCode(offCenter, { search: true }), 'uploaded circular attendance code', 'uploaded code should be found away from the image center');
const longToken = 'a'.repeat(363);
assert.equal(window.decodeCircularAttendanceCode(imageWithCode(longToken, 0)), longToken, 'full attendance tokens should fit and round trip');
console.log('Sparse circular attendance code round-trip passed at four rotations and varied sizes; off-center upload and invalid frame checked.');
