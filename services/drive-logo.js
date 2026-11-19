// Club logos given as Google Drive links in the clubs Excel sheet. The browser cannot read Drive files (no CORS),
// so the server downloads the shared file, checks it is a real JPG/PNG/WebP up to 10 MB, and uploads it to the
// club image folder exactly like an embedded logo. The import then uses it like any other uploaded logo.
const crypto = require('node:crypto');

const MAX_BYTES = 10 * 1024 * 1024;

// Accepts /file/d/<id>/..., open?id=<id>, uc?id=<id>, thumbnail?id=<id> and docs.google.com variants.
function driveFileId(link) {
  const value = String(link || '').trim();
  let url;
  try { url = new URL(value); } catch { return ''; }
  if (!/^(drive|docs)\.google\.com$/i.test(url.hostname) && !/^drive\.usercontent\.google\.com$/i.test(url.hostname)) return '';
  const fromPath = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,200})/);
  const id = fromPath ? fromPath[1] : url.searchParams.get('id') || '';
  return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : '';
}

// Real image type from the file's first bytes (never trust the name or the header Drive sends).
function sniffImage(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return '';
}

async function downloadDriveImage(link, fetchImpl = fetch) {
  const id = driveFileId(link);
  if (!id) throw Object.assign(new Error('This is not a Google Drive file link.'), { status: 400 });
  const response = await fetchImpl(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error('The Drive file could not be downloaded. Share it as "Anyone with the link".'), { status: 400 });
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw Object.assign(new Error('The Drive logo is larger than 10 MB.'), { status: 400 });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error('The Drive logo is larger than 10 MB.'), { status: 400 });
  const mime = sniffImage(bytes);
  if (!mime) throw Object.assign(new Error('The Drive link is not a public JPG, PNG or WebP image. Share it as "Anyone with the link" and use an image file.'), { status: 400 });
  return { bytes, mime };
}

function registerDriveLogoImport(app, { cloudinary, cloudinaryConfigured, folder, isSameOriginRequest, fetchImpl = fetch }) {
  app.post('/api/admin/clubs/import/drive-logo', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
    if (!cloudinaryConfigured()) return res.status(503).json({ message: 'Image storage is not configured.' });
    try {
      const { bytes, mime } = await downloadDriveImage(req.body?.url, fetchImpl);
      // Same public-id shape as browser uploads, so the import accepts it as a fresh club logo.
      const result = await cloudinary.uploader.upload(`data:${mime};base64,${bytes.toString('base64')}`, {
        resource_type: 'image', folder, public_id: `${folder}-${crypto.randomUUID()}`, overwrite: false, unique_filename: false, timeout: 60000
      });
      res.json({ url: result.secure_url, publicId: result.public_id });
    } catch (error) {
      if (!error.status) console.error('Drive logo import failed:', error.name);
      res.status(error.status || 503).json({ message: error.status ? error.message : 'The Drive logo could not be imported right now.' });
    }
  });
}

module.exports = { registerDriveLogoImport, downloadDriveImage, driveFileId, sniffImage };
