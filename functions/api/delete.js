// POST /api/delete  — body: { key: string } or { keys: string[] }
// Requires a valid session cookie.
import { requireAuth } from "../_auth.js";

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const keys = body.keys || (body.key ? [body.key] : []);
  if (!keys.length) return Response.json({ error: "no keys" }, { status: 400 });
  await env.BUCKET.delete(keys);
  return Response.json({ deleted: keys });
}
