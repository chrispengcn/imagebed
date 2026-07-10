// POST /api/blog/delete — auth. Body { key }
// Deletes the post and regenerates the sitemap.
import { requireAuth } from "../../_auth.js";
import { parseKey } from "./_lib.js";
import { rebuildSitemap } from "../../_sitemap.js";

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const key = body.key || "";
  if (!parseKey(key)) return Response.json({ error: "invalid key" }, { status: 400 });

  await env.BUCKET.delete(key);
  const origin = new URL(request.url).origin;
  await rebuildSitemap(env, origin);
  return Response.json({ deleted: key });
}
