const net = require('node:net');
const production = env => env.NODE_ENV === 'production' || Boolean(env.VERCEL);
function secureCookie(req, env = process.env) { return req.secure || production(env) ? ' Secure;' : ''; }
function trustedClientIp(req, env = process.env) {
  const forwarded = env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const address = forwarded || req.ip || req.socket?.remoteAddress || '';
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) ? normalized : '';
}
function sameOrigin(req, env = process.env) {
  const value = req.get('origin');
  if (!value || value === 'null') return false;
  try {
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return false;
    const expectedProtocol = req.secure || production(env) ? 'https:' : 'http:';
    return origin.host.toLowerCase() === String(req.get('host') || '').toLowerCase() && origin.protocol === expectedProtocol;
  } catch { return false; }
}
// Everything the site loads: Google Identity Services (sign-in), OneSignal (push), Cloudinary (media),
// Google Fonts and the QR code library from jsDelivr. Inline styles stay allowed (style attributes).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client https://cdn.onesignal.com https://api.onesignal.com https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style https://cdn.onesignal.com https://onesignal.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://res.cloudinary.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://accounts.google.com/gsi/ https://oauth2.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://onesignal.com https://*.onesignal.com",
  "frame-src https://accounts.google.com/gsi/ https://*.onesignal.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // Enforced. Pages carry no inline <script> or on*= handlers (see assets/js/inline-actions.js).
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (production(process.env)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}
// Preview/stage deployments must not be indexed; only Vercel production stays indexable.
function stageIndexing(env = process.env) {
  return (req, res, next) => {
    if (env.VERCEL_ENV === 'production') return next();
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.path === '/robots.txt' && ['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    }
    next();
  };
}
// Google's full-page sign-in posts here from accounts.google.com; that route checks Google's
// g_csrf_token double-submit cookie and the sign-in nonce instead of the origin.
const CROSS_SITE_POSTS = new Set(['/student-auth/google/redirect']);
function protectMutations(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method === 'POST' && CROSS_SITE_POSTS.has(req.path)) return next();
  if (!sameOrigin(req) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ message: 'This request could not be verified. Reload the website and try again.' });
  next();
}
function sameOriginCors(req, callback) {
  callback(null, { origin: req.get('origin') && sameOrigin(req) ? req.get('origin') : false, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type'], maxAge: 600 });
}
module.exports = { CONTENT_SECURITY_POLICY, production, secureCookie, trustedClientIp, sameOrigin, securityHeaders, stageIndexing, protectMutations, sameOriginCors };
