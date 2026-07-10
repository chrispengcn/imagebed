// POST /api/blog/save — auth. Create or update a blog post.
// Body: { category, date, title, slug, image?, body, originalKey? }
// Behavior:
//   - Computes the target key from (category, date, slug).
//   - If originalKey is present AND differs from target, deletes the old key
//     (rename support).
//   - Writes the markdown (with frontmatter) to R2.
//   - Regenerates sitemap.xml.
// Returns { key, url }.
import { requireAuth } from "../../_auth.js";
import { makePostKey, normalizeCategory, normalizeDate, slugifySeg, parseKey, keyToUrl } from "./_lib.js";
import { stringifyFrontmatter } from "../../_markdown.js";
import { rebuildSitemap } from "../../_sitemap.js";

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const category = normalizeCategory(body.category);
  const date = normalizeDate(body.date);
  const title = String(body.title || "").trim();
  const slug = slugifySeg(body.slug || title);
  const image = String(body.image || "").trim();
  const md = String(body.body || "");
  const originalKey = body.originalKey && parseKey(body.originalKey) ? body.originalKey : null;

  if (!category) return Response.json({ error: "category is required" }, { status: 400 });
  if (!title)    return Response.json({ error: "title is required" }, { status: 400 });
  if (!slug)     return Response.json({ error: "slug is required (letters, numbers, dashes)" }, { status: 400 });
  if (!date)     return Response.json({ error: "invalid date" }, { status: 400 });
  if (!md.trim())return Response.json({ error: "body is required" }, { status: 400 });

  let key;
  try { key = makePostKey({ category, date, slug }); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }

  // Refuse to silently overwrite a *different* existing post when creating anew.
  if (!originalKey) {
    const existing = await env.BUCKET.head(key);
    if (existing) return Response.json({ error: "a post with this date+slug already exists in that category" }, { status: 409 });
  }

  const fm = {
    title,
    date: new Date(`${date}T00:00:00Z`).toISOString(),
    slug,
    category,
  };
  if (image) fm.image = image;

  const text = stringifyFrontmatter(fm, md);
  await env.BUCKET.put(key, text, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { title: title.slice(0, 256), category: category.slice(0, 60) },
  });

  // Handle rename — delete the old key after the new one is safely written.
  if (originalKey && originalKey !== key) {
    await env.BUCKET.delete(originalKey);
  }

  // Sitemap. Note: this reads every post; it's fine at this scale but if it
  // ever becomes an issue we can queue this out-of-band.
  const origin = new URL(request.url).origin;
  await rebuildSitemap(env, origin);

  return Response.json({ key, url: keyToUrl(key) });
}
