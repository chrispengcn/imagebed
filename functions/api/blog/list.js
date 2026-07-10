// GET /api/blog/list  — public
// Query: ?category=name  ?q=search  ?limit=100  ?offset=0
// Returns { items: [{key, url, title, date, slug, category, image, excerpt}],
//           total, categories }.
// Items are sorted date desc (then key desc for tie-break).
// The list is small (markdown files), so we load and sort in one pass rather
// than pretending to paginate at the R2 layer — the client already paginates.

import { listAllPostObjects, loadPost, categoriesFromObjects, MAX_LIMIT } from "./_lib.js";
import { excerpt as makeExcerpt } from "../../_markdown.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const category = (url.searchParams.get("category") || "").trim();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || MAX_LIMIT));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const objs = await listAllPostObjects(env);
  const categories = categoriesFromObjects(objs);

  // Filter by category (prefix) before we read post bodies — saves R2 reads
  // for busy blogs.
  const relevant = category ? objs.filter((o) => o.key.startsWith(`blog/${category}/`)) : objs;

  // Sort by date-in-filename desc; falls back to upload time.
  relevant.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));

  // Load posts and filter by search query. We load all matched posts so the
  // total count is accurate — the per-post markdown is small.
  const loaded = [];
  for (const o of relevant) {
    const post = await loadPost(env, o.key);
    if (!post) continue;
    if (q) {
      const hay = `${post.title}\n${post.slug}\n${post.category}\n${post.body}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    loaded.push(post);
  }

  // Post-load sort by date desc, tie-break by slug asc for stability.
  loaded.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug < b.slug ? -1 : 1;
  });

  const page = loaded.slice(offset, offset + limit).map((p) => ({
    key: p.key,
    url: p.url,
    title: p.title,
    date: p.date,
    slug: p.slug,
    category: p.category,
    image: p.image,
    excerpt: makeExcerpt(p.body, 160),
  }));

  return Response.json({
    items: page,
    total: loaded.length,
    offset,
    limit,
    categories,
  });
}
