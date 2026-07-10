// POST /api/login  — body: {password}
// GET  /api/login  — returns {authed: bool} without exposing the password
import { verifyPassword, issueCookie, isAuthed } from "../_auth.js";

export async function onRequestGet({ env, request }) {
  return Response.json({
    authed: await isAuthed(env, request),
    configured: !!env.ADMIN_PASSWORD,
  });
}

export async function onRequestPost({ env, request }) {
  if (!env.ADMIN_PASSWORD) {
    return Response.json(
      { error: "ADMIN_PASSWORD is not configured on the server" },
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
