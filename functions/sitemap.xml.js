// GET /sitemap.xml — served from R2 (rebuilt on blog save/delete).
// If the cached sitemap is missing (fresh install, empty bucket), build one
// on the fly and cache it in R2 for future requests.
import { rebuildSitemap, SITEMAP_KEY } from "./_sitemap.js";

export async function onRequestGet({ env, request }) {
  let obj = await env.BUCKET.get(SITEMAP_KEY);
  if (!obj) {
    const origin = new URL(request.url).origin;
    await rebuildSitemap(env, origin);
    obj = await env.BUCKET.get(SITEMAP_KEY);
    if (!obj) return new Response("sitemap unavailable", { status: 503 });
  }
  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
