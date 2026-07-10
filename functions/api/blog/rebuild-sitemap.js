// POST /api/blog/rebuild-sitemap — auth. Manually rebuild sitemap.xml.
import { requireAuth } from "../../_auth.js";
import { rebuildSitemap } from "../../_sitemap.js";

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;
  const origin = new URL(request.url).origin;
  const info = await rebuildSitemap(env, origin);
  return Response.json({ ok: true, ...info });
}
