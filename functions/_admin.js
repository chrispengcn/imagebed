// Admin password storage.
//
// The password lives in R2 at the key given by `env.PASSWORD_PATH` (set in
// wrangler.toml under [vars]). The file holds a JSON blob:
//   { alg: "sha256", salt: <hex>, hash: <hex>, updated: <isoString> }
//
// Bootstrap behavior — if the file is missing, the login password is the
// hard-coded default `123456`. This is intentional: it lets a fresh deploy
// log in and immediately rotate the password from /settings.html, which
// then materialises the R2 file. There is no wrangler secret involved.
//
// Security notes:
//   - The path itself is a weak secret. Anyone who guesses it and calls
//     /file/<path> would still be 404'd (see functions/file/[[key]].js) —
//     but pick a hard-to-guess name anyway. /api/list also filters it.
//   - Rotating the password changes the HMAC-signing key used for session
//     cookies (see _auth.js), which invalidates every other existing
//     session. The caller's own cookie is re-signed in the same request
//     (see api/settings/password.js) so they stay signed in.

const ENC = new TextEncoder();

// Default password used only when the R2 file does not exist. Keep this in
// sync with the README bootstrap instructions.
export const DEFAULT_PASSWORD = "123456";

function bytesToHex(u8) {
  return [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function sha256Hex(saltBytes, password) {
  const buf = new Uint8Array(saltBytes.length + password.length);
  buf.set(saltBytes, 0);
  buf.set(ENC.encode(password), saltBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

function passwordPath(env) {
  const p = String(env.PASSWORD_PATH || "").trim();
  // We reject an empty path so a mis-configured deployment doesn't silently
  // read/write objects at the empty key.
  if (!p) throw new Error("PASSWORD_PATH is not configured in wrangler.toml [vars]");
  return p;
}

// Read the stored password blob, or null if not set.
async function readStored(env) {
  const obj = await env.BUCKET.get(passwordPath(env));
  if (!obj) return null;
  try {
    const data = JSON.parse(await obj.text());
    if (data && data.hash && data.salt && data.alg === "sha256") return data;
  } catch { /* fall through */ }
  return null;
}

// Effective secret for HMAC session signing. This changes when the password
// rotates, which is how we invalidate old sessions.
//   - If the R2 blob is present, use its salt+hash as the key material.
//   - Otherwise use the default-password sentinel so anonymous cookies
//     issued with the default password can be verified.
export async function effectiveSecret(env) {
  const stored = await readStored(env);
  if (stored) return `stored:${stored.salt}:${stored.hash}`;
  return `default:${DEFAULT_PASSWORD}`;
}

// Always true — bootstrap default means auth is always "configured".
// Kept as a function so call sites don't need to change.
export async function isConfigured(env) {
  // Confirm PASSWORD_PATH is set — that IS the only mandatory config now.
  try { passwordPath(env); return true; } catch { return false; }
}

// Verify a submitted password.
export async function verifyPassword(env, submitted) {
  const s = String(submitted || "");
  const stored = await readStored(env);
  if (stored) {
    const salt = hexToBytes(stored.salt);
    const hash = await sha256Hex(salt, s);
    return constantTimeEq(hash, stored.hash);
  }
  // No file yet — the default password is the only valid credential. Use
  // constant-time compare so the timing side-channel doesn't leak length.
  return constantTimeEq(s, DEFAULT_PASSWORD);
}

// True iff a stored password file exists in R2. The settings page uses this
// to show whether the deployment is still running on the bootstrap default.
export async function passwordIsOverridden(env) {
  return !!(await readStored(env));
}

// Persist a new password. Overwrites the existing R2 file (if any).
export async function setPassword(env, newPw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256Hex(salt, String(newPw));
  const blob = {
    alg: "sha256",
    salt: bytesToHex(salt),
    hash,
    updated: new Date().toISOString(),
  };
  await env.BUCKET.put(passwordPath(env), JSON.stringify(blob), {
    httpMetadata: { contentType: "application/json" },
  });
  return blob;
}

function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Exposed so file/[[key]].js and api/list.js can refuse to serve/list this
// specific key regardless of what path the operator chose.
export function getPasswordPath(env) {
  try { return passwordPath(env); } catch { return null; }
}
