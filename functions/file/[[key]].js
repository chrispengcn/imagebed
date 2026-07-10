// GET /file/:key  — stream an object out of R2.
// Guardrails:
//   - The admin password blob (env.PASSWORD_PATH) is 404'd — that data is
//     never public regardless of how it's linked.
//   - blog/*.md source files are 404'd — they're rendered via /blog/...
//     rather than served raw.
import { getPasswordPath } from "../_admin.js";

export async function onRequestGet({ params, env }) {
  const key = Array.isArray(params.key) ? params.key.join("/") : params.key;
  if (!key) return new Response("Not found", { status: 404 });

  const pwPath = getPasswordPath(env);
  if (pwPath && key === pwPath) return new Response("Not found", { status: 404 });

  if (key.startsWith("blog/") && key.endsWith(".md")) {
    return new Response("Not found", { status: 404 });
  }
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (!headers.has("content-type")) {
    headers.set("content-type", obj.httpMetadata?.contentType || "application/octet-stream");
  }
  return new Response(obj.body, { headers });
}
