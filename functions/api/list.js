// GET /api/list — list objects in the R2 bucket, newest first.
// Query params:
//   ?prefix=folder/  (optional) — only list items under this folder
// Returns { items, folders, truncated, cursor }. `folders` is the set of
// top-level folder names discovered at the current prefix level.
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  let prefix = url.searchParams.get("prefix") || "";
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  const cursor = url.searchParams.get("cursor") || undefined;

  const res = await env.BUCKET.list({ prefix, cursor, limit: 1000, include: ["httpMetadata"] });

  const folderSet = new Set();
  const items = [];
  for (const o of res.objects) {
    const rel = o.key.slice(prefix.length);
    const slash = rel.indexOf("/");
    if (slash > 0) {
      // Object lives in a subfolder — surface the folder segment but don't
      // include the object itself at this level. The client can drill in.
      folderSet.add(rel.slice(0, slash));
      continue;
    }
    items.push({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      contentType: o.httpMetadata?.contentType || "application/octet-stream",
      url: `/file/${encodeURI(o.key)}`,
    });
  }
  items.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  return Response.json({
    items,
    folders: [...folderSet].sort(),
    prefix,
    truncated: res.truncated,
    cursor: res.truncated ? res.cursor : null,
  });
}
