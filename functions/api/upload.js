// POST /api/upload  — multipart form-data with field `file` (one or many),
// stores each into R2 under a timestamped, slugified key.
// Optional field `folder` — a virtual folder prefix (e.g. "photos/2026").
// Requires a valid session cookie (see functions/_auth.js).
import { requireAuth } from "../_auth.js";

function slugify(name) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^\w.\-]+/g, "_").slice(0, 60);
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^\w.]+/g, "") : "";
  return `${base || "file"}${ext}`;
}

function makeKey(originalName, folder) {
  const now = new Date();
  const stamp =
    now.toISOString().replace(/[-:T]/g, "").slice(0, 14) +
    "_" + Math.random().toString(36).slice(2, 8);
  const base = `${stamp}_${slugify(originalName)}`;
  const prefix = normalizeFolder(folder);
  return prefix ? `${prefix}/${base}` : base;
}

// Whitelisted characters keep the folder from breaking R2/URL semantics.
export function normalizeFolder(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/^\/+|\/+$/g, "");             // strip leading/trailing slashes
  s = s.replace(/\/{2,}/g, "/");               // collapse doubles
  s = s.split("/").map((seg) =>
    seg.replace(/[^\w.\-]+/g, "_").slice(0, 60)
  ).filter(Boolean).join("/");
  return s.slice(0, 240);
}

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const form = await request.formData();
  const files = form.getAll("file").filter((f) => f && typeof f === "object" && "arrayBuffer" in f);
  if (!files.length) return Response.json({ error: "no files" }, { status: 400 });
  const folder = normalizeFolder(form.get("folder"));

  const out = [];
  for (const f of files) {
    const key = makeKey(f.name || "upload", folder);
    await env.BUCKET.put(key, f.stream(), {
      httpMetadata: { contentType: f.type || "application/octet-stream" },
    });
    out.push({ key, size: f.size, url: `/file/${encodeURI(key)}` });
  }
  return Response.json({ uploaded: out, folder });
}
