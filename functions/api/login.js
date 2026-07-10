// POST /api/login  — body: {password}
// GET  /api/login  — returns {authed: bool, configured: bool} without exposing the password
import { verifyPassword, issueCookie, isAuthed } from "../_auth.js";
import { isConfigured } from "../_admin.js";

export async function onRequestGet({ env, request }) {
  return Response.json({
    authed: await isAuthed(env, request),
    configured: await isConfigured(env),
  });
}

export async function onRequestPost({ env, request }) {
  if (!(await isConfigured(env))) {
    return Response.json(
      { error: "PASSWORD_PATH is not configured in wrangler.toml" },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const ok = await verifyPassword(env, body.password);
  if (!ok) {
    // Small delay to blunt brute-forcing.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "invalid password" }, { status: 401 });
  }
  const { header, exp } = await issueCookie(env);
  return new Response(JSON.stringify({ ok: true, exp }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": header },
  });
}
