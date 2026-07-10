// Shared helpers for the /api/blog/* endpoints. This module is intentionally
// prefixed with `_` so Cloudflare Pages Functions does not expose it as a
// route.
//
// Post layout in R2:
//   blog/<category>/YYYY-MM-DD-<slug>.md
// with YAML-ish frontmatter (see functions/_markdown.js):
//   ---
//   title: ...
//   date: YYYY-MM-DDTHH:MM:SSZ   (full ISO date; the filename only uses YYYY-MM-DD)
//   slug: ...
//   image: /file/foo.jpg   (optional — featured image URL)
//   category: <name>
//   ---
//   body markdown

import { parseFrontmatter } from "../../_markdown.js";

export const ROOT = "blog/";
export const KEEP = ".keep";   // empty marker used to keep an empty category around
export const MAX_LIMIT = 100;

// ---------- naming ----------

// Slugify user text for a filename segment. ASCII-only so the resulting URL is
// stable across shells and Twitter cards. Non-ASCII gets stripped.
export function slugifySeg(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    // Drop combining marks (accents) after NFKD.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Sanitize a category (directory) name. Preserves CJK / unicode; strips only
// characters that would break R2 keys or URLs.
export function normalizeCategory(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s
    .replace(/[\\/\x00-\x1f]+/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 60);
}

export function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s || Date.now());
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function makePostKey({ category, date, slug }) {
  const cat = normalizeCategory(category);
  const d = normalizeDate(date);
  const s = slugifySeg(slug);
  if (!cat) throw new Error("category is required");
  if (!d)   throw new Error("date is required (YYYY-MM-DD)");
  if (!s)   throw new Error("slug is required");
  return `${ROOT}${cat}/${d}-${s}.md`;
}

// Parse "blog/<cat>/YYYY-MM-DD-<slug>.md" -> pieces, or null.
export function parseKey(key) {
  if (!key || !key.startsWith(ROOT) || !key.endsWith(".md")) return null;
  const rest = key.slice(ROOT.length, -3);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const category = rest.slice(0, slash);
  const filename = rest.slice(slash + 1);
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!m) return null;
  return { category, date: m[1], slug: m[2], filename, key };
}

// Public URL for a post (trailing slash so caches / crawlers treat it as a page).
export function keyToUrl(key) {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return `/blog/${encodeURIComponent(parsed.category)}/${parsed.date}-${parsed.slug}/`;
}

export function categoryUrl(cat) {
  return `/blog/${encodeURIComponent(cat)}/`;
}

// ---------- loading posts ----------

// R2.list caps at 1000/page; walk through if needed. Post volume is small
// (markdown text), so this is fine at the scale this app targets.
export async function listAllPostObjects(env) {
  const out = [];
  let cursor;
  do {
    const res = await env.BUCKET.list({ prefix: ROOT, cursor, limit: 1000 });
    for (const o of res.objects) {
      if (o.key.endsWith(".md")) out.push(o);
    }
    cursor = res.truncated ? res.cursor : null;
  } while (cursor);
  return out;
}

// Read a post file and produce a summary record for listings.
export async function loadPost(env, key) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return null;
  const text = await obj.text();
  const { data, body } = parseFrontmatter(text);
  const parsed = parseKey(key);
  if (!parsed) return null;
  return {
    key,
    category: parsed.category,
    slug: parsed.slug,
    date: parsed.date,
    filename: parsed.filename,
    title: data.title || parsed.slug,
    image: data.image || "",
    body,
    frontmatter: data,
    uploaded: obj.uploaded,
    url: keyToUrl(key),
  };
}

// ---------- categories ----------

// Discover categories from the object listing (any object whose key starts
// with blog/<cat>/). Also picks up empty categories represented by a .keep
// marker.
export function categoriesFromObjects(objects) {
  const set = new Set();
  for (const o of objects) {
    const rest = o.key.slice(ROOT.length);
    const slash = rest.indexOf("/");
    if (slash > 0) set.add(rest.slice(0, slash));
  }
  return [...set].sort();
}

// Also include categories that only have a .keep marker (empty category).
export async function listCategories(env) {
  const out = new Set();
  let cursor;
  do {
    const res = await env.BUCKET.list({ prefix: ROOT, cursor, limit: 1000 });
    for (const o of res.objects) {
      const rest = o.key.slice(ROOT.length);
      const slash = rest.indexOf("/");
      if (slash > 0) out.add(rest.slice(0, slash));
    }
    cursor = res.truncated ? res.cursor : null;
  } while (cursor);
  return [...out].sort();
}
