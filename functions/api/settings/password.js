// POST /api/settings/password  — auth
// Body: { current: string, next: string }
// Verifies `current` against the effective password, writes `next` as the new
// stored password (salted SHA-256 in R2 at env.PASSWORD_PATH), and issues a
// fresh session cookie so the caller stays signed in — otherwise rotating the
// secret would immediately invalidate the caller's own cookie.
import { requireAuth, issueCookie, verifyPassword } from "../../_auth.js";
import { setPassword } from "../../_admin.js";

// Enforce a modest minimum. 8 chars is enough friction against the trivial
// "1" password without being annoying for humans who paste a generated 16-char
// value.
const MIN_LEN = 8;
const MAX_LEN = 256;

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const current = String(body.current || "");
  const next = String(body.next || "");

  if (!current) return Response.json({ error: "current password is required" }, { status: 400 });
  if (!(await verifyPassword(env, current))) {
    // Slow the caller down slightly — mirrors /api/login's brute-force blunt.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "current password is incorrect" }, { status: 401 });
  }
  if (next.length < MIN_LEN) return Response.json({ error: `new password must be at least ${MIN_LEN} characters` }, { status: 400 });
  if (next.length > MAX_LEN) return Response.json({ error: `new password too long` }, { status: 400 });
  if (next === current)      return Response.json({ error: "new password must differ from the current one" }, { status: 400 });

  await setPassword(env, next);

  // Re-sign the session cookie with the new secret. Without this the caller's
  // very next request would come back 401 because the HMAC key just changed.
  const { header, exp } = await issueCookie(env);
  return new Response(JSON.stringify({ ok: true, exp }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": header },
  });
}
