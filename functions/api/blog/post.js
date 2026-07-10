// GET /api/blog/post?key=blog/<cat>/<file>.md — public
// Returns { key, category, slug, date, title, image, body, frontmatter }.
// Used by the editor when loading an existing post. Body is the raw markdown
// source, NOT rendered HTML.
import { loadPost, parseKey } from "./_lib.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!parseKey(key)) return Response.json({ error: "invalid key" }, { status: 400 });
  const post = await loadPost(env, key);
  if (!post) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(post);
}
