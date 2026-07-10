// Build and write a sitemap.xml into R2 under the key `sitemap.xml`.
// The public sitemap is served by functions/sitemap.xml.js which pulls this
// exact key. Regenerated on blog publish/delete/rebuild-sitemap.

import { listAllPostObjects, categoriesFromObjects, keyToUrl, categoryUrl } from "./api/blog/_lib.js";

const STATIC_URLS = [
  { path: "/",              changefreq: "daily",  priority: "1.0" },
  { path: "/generate.html", changefreq: "monthly", priority: "0.7" },
  { path: "/blog/",         changefreq: "daily",   priority: "0.9" },
  { path: "/help.html",     changefreq: "yearly",  priority: "0.3" },
];

const SITEMAP_KEY = "sitemap.xml";

export async function rebuildSitemap(env, origin) {
  const base = (origin || "").replace(/\/$/, "");
  const posts = await listAllPostObjects(env);

  // Pull frontmatter dates so we can emit accurate <lastmod>.
  const postEntries = [];
  for (const o of posts) {
    // For a post, lastmod = the R2 upload time (revision) OR the date field.
    // Upload time is fresher for edits, so prefer it.
    const url = keyToUrl(o.key);
    if (!url) continue;
    postEntries.push({
      loc: base + url,
      lastmod: (o.uploaded instanceof Date ? o.uploaded : new Date(o.uploaded || Date.now())).toISOString(),
      changefreq: "monthly",
      priority: "0.6",
    });
  }

  const cats = categoriesFromObjects(posts);
  const catEntries = cats.map((c) => ({
    loc: base + categoryUrl(c),
    changefreq: "weekly",
    priority: "0.5",
  }));

  const staticEntries = STATIC_URLS.map((u) => ({
    loc: base + u.path,
    changefreq: u.changefreq,
    priority: u.priority,
  }));

  const all = [...staticEntries, ...catEntries, ...postEntries];
  const xml = renderSitemap(all);
  await env.BUCKET.put(SITEMAP_KEY, xml, {
    httpMetadata: { contentType: "application/xml; charset=utf-8" },
  });
  return { count: all.length };
}

function renderSitemap(entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const e of entries) {
    lines.push("  <url>");
    lines.push(`    <loc>${escXml(e.loc)}</loc>`);
    if (e.lastmod) lines.push(`    <lastmod>${escXml(e.lastmod)}</lastmod>`);
    if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return lines.join("\n");
}

function escXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

export { SITEMAP_KEY };
