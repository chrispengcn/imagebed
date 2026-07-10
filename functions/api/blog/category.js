// POST /api/blog/category — auth. Body { name, action?: "create" | "delete" }
// Categories are represented by a `.keep` marker so an empty category persists.
// Creating a category also drops the marker; deleting requires the category
// to be empty (no .md files inside).
import { requireAuth } from "../../_auth.js";
import { normalizeCategory, ROOT, KEEP } from "./_lib.js";

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const name = normalizeCategory(body.name);
  const action = body.action === "delete" ? "delete" : "create";
  if (!name) return Response.json({ error: "invalid category name" }, { status: 400 });

  const keepKey = `${ROOT}${name}/${KEEP}`;

  if (action === "create") {
    await env.BUCKET.put(keepKey, "", {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    return Response.json({ created: name });
  }

  // delete — refuse if any .md posts exist under this category.
  const res = await env.BUCKET.list({ prefix: `${ROOT}${name}/`, limit: 1000 });
  const stillHasPosts = res.objects.some((o) => o.key.endsWith(".md"));
  if (stillHasPosts) return Response.json({ error: "category is not empty" }, { status: 400 });

  // Wipe the .keep marker (and any stray non-md files).
  const keys = res.objects.map((o) => o.key);
  if (keys.length) await env.BUCKET.delete(keys);
  return Response.json({ deleted: name });
}
