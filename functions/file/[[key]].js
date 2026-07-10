// GET /file/:key  — stream an object out of R2.
export async function onRequestGet({ params, env }) {
  const key = Array.isArray(params.key) ? params.key.join("/") : params.key;
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
