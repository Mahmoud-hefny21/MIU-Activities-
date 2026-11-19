const test = require('node:test');
const assert = require('node:assert/strict');
const { driveFileId, sniffImage, downloadDriveImage } = require('../services/drive-logo');

test('Google Drive share links of every common shape give the file id; other sites are refused', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  assert.equal(driveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`), id);
  assert.equal(driveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(driveFileId(`https://drive.google.com/uc?export=download&id=${id}`), id);
  assert.equal(driveFileId(`https://docs.google.com/uc?id=${id}`), id);
  assert.equal(driveFileId(`https://evil.example/file/d/${id}/view`), '');
  assert.equal(driveFileId('not a link'), '');
});

test('only real JPG, PNG and WebP bytes are accepted', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniffImage(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<!DOCTYPE html><html>sign in</html>')), '');
});

test('a private Drive file (HTML sign-in page) gives a clear sharing message', async () => {
  const fakeFetch = async () => new Response('<!DOCTYPE html><html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(downloadDriveImage('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', fakeFetch), /Anyone with the link/);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const ok = await downloadDriveImage('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', async () => new Response(png, { status: 200 }));
  assert.equal(ok.mime, 'image/png');
});
