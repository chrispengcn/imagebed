// GET /api/list — list objects in the R2 bucket, newest first.
// Query params:
//   ?prefix=folder/  (optional) — only list items under this folder
// Returns { items, folders, truncated, cursor }. `folders` is the set of
// top-level folder names discovered at the current prefix level.
import { getPasswordPath } from "../_admin.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  let prefix = url.searchParams.get("prefix") || "";
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  const cursor = url.searchParams.get("cursor") || undefined;

  const res = await env.BUCKET.list({ prefix, cursor, limit: 1000, include: ["httpMetadata"] });

  const pwPath = getPasswordPath(env);
  // Derive the immediate folder segment that contains the password blob at
  // the current listing level so we don't surface it as a browsable folder.
  // Example: PASSWORD_PATH="admin/pass-xyz", prefix="" -> hide "admin";
  // prefix="admin/" -> hide the leaf "pass-xyz" (won't reach here because
  // the loop already skips the file itself, but a nested prefix like
  // "admin/deeper/pass" would need the same segment-hiding logic).
  const pwRel = pwPath && pwPath.startsWith(prefix) ? pwPath.slice(prefix.length) : null;
  const pwFolderSeg = pwRel && pwRel.includes("/") ? pwRel.slice(0, pwRel.indexOf("/")) : null;

  const folderSet = new Set();
  const items = [];
  for (const o of res.objects) {
    // The bucket also holds blog markdown, sitemap.xml and the admin password
    // blob. None of those should surface in the gallery listing.
    if (o.key === "sitemap.xml") continue;
    if (o.key.startsWith("blog/")) continue;
    if (pwPath && o.key === pwPath) continue;

    const rel = o.key.slice(prefix.length);
    const slash = rel.indexOf("/");
    if (slash > 0) {
      const seg = rel.slice(0, slash);
      if (pwFolderSeg && seg === pwFolderSeg) continue;
      folderSet.add(seg);
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
