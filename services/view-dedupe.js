const crypto = require('node:crypto');

// View counters: one counted view per visitor per club/event within a time window, so repeated
// requests cannot inflate the numbers. Visitors are a keyed hash of IP + browser (nothing stored raw),
// held in bounded memory; the oldest entries are dropped first.
function createViewDeduper({ secret, windowMs = 30 * 60 * 1000, maxEntries = 20000, clock = Date.now }) {
  if (!secret) throw new Error('A secret is required to hash visitor identities.');
  const seen = new Map();
  return function isFirstView(target, clientIp, userAgent) {
    const now = clock();
    const visitor = crypto.createHmac('sha256', secret).update(`${clientIp || 'unknown'}|${String(userAgent || '').slice(0, 300)}`).digest('hex');
    const key = `${visitor}:${target}`;
    const last = seen.get(key);
    if (last !== undefined && now - last < windowMs) return false;
    seen.delete(key);
    seen.set(key, now);
    for (const [entry, time] of seen) {
      if (seen.size <= maxEntries && now - time < windowMs) break;
      seen.delete(entry);
    }
    return true;
  };
}

module.exports = { createViewDeduper };
