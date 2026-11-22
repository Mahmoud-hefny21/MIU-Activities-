const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client();
const MIU_EMAIL = /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i;

async function verifyGoogleStudentCredential({ credential, expectedNonce, clientId, client = googleClient, now = Date.now() }) {
  if (typeof credential !== 'string' || credential.length > 12_000 || !expectedNonce || !clientId) {
    throw Object.assign(new Error('GOOGLE_CREDENTIAL_INVALID'), { reason: !expectedNonce ? 'nonce_missing' : !clientId ? 'client_not_configured' : 'credential_missing' });
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  } catch {
    throw Object.assign(new Error('GOOGLE_CREDENTIAL_INVALID'), { reason: 'token_rejected' });
  }

  const claims = ticket?.getPayload?.();
  const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const hostedDomain = typeof claims?.hd === 'string' ? claims.hd.trim().toLowerCase() : '';
  const issuedAt = Number(claims?.iat) * 1000;
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'identity_missing' });
  if (claims.nonce !== expectedNonce) throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'nonce_mismatch' });
  if (claims.email_verified !== true) throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'email_unverified' });
  if (hostedDomain !== 'miuegypt.edu.eg' || !MIU_EMAIL.test(email)) {
    throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'miu_domain_mismatch' });
  }
  if (claims.azp && claims.azp !== clientId) throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'client_id_mismatch' });
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000) throw Object.assign(new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'), { reason: 'issued_at_invalid' });

  return { googleSub: claims.sub, email, name: typeof claims.name === 'string' ? claims.name : '' };
}

function decideGoogleAccount({ accountBySubject, accountByEmail }) {
  if (accountBySubject) return { action: 'sign_in', account: accountBySubject };
  if (accountByEmail) return { action: 'explicit_link_required', account: accountByEmail };
  return { action: 'create' };
}

function decideGoogleLink({ accountEmail, googleEmail, currentGoogleSub, requestedGoogleSub, subjectOwnerEmail }) {
  if (String(accountEmail || '').toLowerCase() !== String(googleEmail || '').toLowerCase()) return 'email_mismatch';
  if (subjectOwnerEmail && String(subjectOwnerEmail).toLowerCase() !== String(accountEmail || '').toLowerCase()) return 'subject_in_use';
  if (currentGoogleSub && currentGoogleSub !== requestedGoogleSub) return 'different_google_account_linked';
  return 'link';
}

// Google's redirect mode sets a g_csrf_token cookie on our site and posts the same value; both must match.
function googleCsrfMatches(cookieValue, bodyValue) {
  if (typeof cookieValue !== 'string' || typeof bodyValue !== 'string' || !cookieValue || cookieValue.length > 512) return false;
  const cookie = Buffer.from(cookieValue);
  const body = Buffer.from(bodyValue);
  return cookie.length === body.length && crypto.timingSafeEqual(cookie, body);
}

// A path on this site to return to after sign-in; anything else becomes '/'.
function safeReturnPath(value) {
  const target = typeof value === 'string' ? value : '';
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\') || target.length > 512 || /[\u0000-\u001f\u007f]/.test(target)) return '/';
  try {
    const parsed = new URL(target, 'https://miu.invalid');
    return parsed.origin === 'https://miu.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch {
    return '/';
  }
}

module.exports = { verifyGoogleStudentCredential, decideGoogleAccount, decideGoogleLink, googleCsrfMatches, safeReturnPath };
