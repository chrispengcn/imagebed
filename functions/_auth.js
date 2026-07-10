// Shared auth helpers for Pages Functions.
//
// Design: single admin password. The password (or a salted hash of it) lives
// in R2 at the path from `env.PASSWORD_PATH`. If the R2 file is missing,
// the default password `123456` unlocks the app so a fresh deploy can log in
// and rotate credentials from /settings.html. `_admin.js` hides that dispatch
// behind `effectiveSecret()` / `verifyPassword()` — this file only needs to
// know that some non-empty secret exists.
//
// Session cookie: session=<expMs>.<hmacHex>
//   hmac = HMAC-SHA256(key = derivedKey(effectiveSecret), msg = String(expMs))
// Rotating the password changes the effective secret, which invalidates every
// issued session — intentional.

import { effectiveSecret, isConfigured } from "./_admin.js";

// verifyPassword is re-exported so callers keep a single import path.
export { verifyPassword } from "./_admin.js";

const COOKIE_NAME = "session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENC = new TextEncoder();

async function subtleKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    ENC.encode("imagebed-session-v1:" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmacHex(secret, msg) {
  const key = await subtleKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function isAuthed(env, request) {
  const secret = await effectiveSecret(env);
  if (!secret) return false; // auth disabled if unset — see requireAuth
  const cookie = readCookie(request, COOKIE_NAME);
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot < 0) return false;
  const expStr = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(secret, expStr);
  return constantTimeEq(sig, expected);
}

export async function issueCookie(env) {
  const secret = await effectiveSecret(env);
  if (!secret) throw new Error("PASSWORD_PATH is not configured");
  const exp = Date.now() + SESSION_MS;
  const sig = await hmacHex(secret, String(exp));
  const value = `${exp}.${sig}`;
  return {
    exp,
    header: `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  };
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Returns null if OK, or a Response to send back. Handles the "no password
// configured" case explicitly so the app fails closed on locked endpoints.
export async function requireAuth(env, request) {
  if (!(await isConfigured(env))) {
    return Response.json(
      { error: "PASSWORD_PATH is not configured in wrangler.toml" },
      { status: 503 }
    );
  }
  if (!(await isAuthed(env, request))) {
    return Response.json({ error: "login required" }, { status: 401 });
  }
  return null;
}
