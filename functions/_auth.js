// Shared auth helpers for Pages Functions.
//
// Design: single ADMIN_PASSWORD secret. The session cookie is
//   session=<expMs>.<hmacHex>
// where hmac is HMAC-SHA256(key=derivedKey(ADMIN_PASSWORD), msg=String(expMs)).
// Rotating the password invalidates every issued session — intentional.

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
  const pass = env.ADMIN_PASSWORD;
  if (!pass) return false; // auth disabled if unset — see requireAuth
  const cookie = readCookie(request, COOKIE_NAME);
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot < 0) return false;
  const expStr = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(pass, expStr);
  return constantTimeEq(sig, expected);
}

export async function issueCookie(env) {
  const pass = env.ADMIN_PASSWORD;
  if (!pass) throw new Error("ADMIN_PASSWORD not configured");
  const exp = Date.now() + SESSION_MS;
  const sig = await hmacHex(pass, String(exp));
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
  if (!env.ADMIN_PASSWORD) {
    return Response.json(
      { error: "ADMIN_PASSWORD is not configured on the server" },
      { status: 503 }
    );
  }
  if (!(await isAuthed(env, request))) {
    return Response.json({ error: "login required" }, { status: 401 });
  }
  return null;
}

export async function verifyPassword(env, submitted) {
  const pass = env.ADMIN_PASSWORD;
  if (!pass) return false;
  // Constant-time compare after normalization.
  const a = String(submitted || "");
  const b = String(pass);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
