const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SIGNING_KEY must be at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(claims, secret) {
  const body = base64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(body));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token, secret, expectedKind, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(fromBase64Url(body)));
    if (!claims || claims.kind !== expectedKind || !Number.isFinite(claims.exp) || claims.exp < now) return null;
    return claims;
  } catch {
    return null;
  }
}
