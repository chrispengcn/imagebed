// GET /blog[/...] — server-rendered blog pages. Public.
//
// Routes:
//   /blog/                                  -> index (all posts, categories nav)
//   /blog/<category>/                       -> category listing
//   /blog/<category>/YYYY-MM-DD-<slug>/     -> post detail
//
// Rendering is done on the server so search engines see the content. The
// listing pages hydrate their pagination + search client-side by calling
// /api/blog/list.
//
// Trailing slashes are canonical. Requests without a trailing slash on the
// listing/post routes redirect to the slash form.

import { loadPost, listAllPostObjects, listCategories, keyToUrl, categoryUrl, ROOT } from "../api/blog/_lib.js";
import { renderMarkdown, escHtml, escAttr, excerpt as makeExcerpt } from "../_markdown.js";

export async function onRequestGet({ env, request, params }) {
  const url = new URL(request.url);
  const raw = params.path;
  let segs = Array.isArray(raw) ? [...raw] : raw ? [raw] : [];
  // Cloudflare may include a trailing empty segment for `/blog/cat/` — trim it,
  // we track trailing-slash canonicity from the pathname directly.
  while (segs.length && segs[segs.length - 1] === "") segs.pop();

  // No segments = /blog or /blog/ — the index.
  if (segs.length === 0) {
    return renderIndex(env, url);
  }

  // One segment = category page (or root if it's empty string).
  if (segs.length === 1) {
    // /blog/<cat> — redirect to /blog/<cat>/ for canonical form.
    if (!url.pathname.endsWith("/")) {
      return Response.redirect(url.origin + url.pathname + "/" + url.search, 308);
    }
    return renderCategory(env, url, decodeURIComponent(segs[0]));
  }

  // Two segments = /blog/<cat>/<postname>[/]
  if (segs.length === 2) {
    if (!url.pathname.endsWith("/")) {
      return Response.redirect(url.origin + url.pathname + "/" + url.search, 308);
    }
    const category = decodeURIComponent(segs[0]);
    const postName = decodeURIComponent(segs[1]);
    return renderPost(env, url, category, postName);
  }

  return new Response(page404("Not found"), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ---------- pages ----------

async function renderIndex(env, url) {
  const categories = await listCategories(env);
  const q = (url.searchParams.get("q") || "").trim();
  return html(200, page({
    title: "Blog · Imagebed",
    activeNav: "blog",
    canonical: url.origin + "/blog/",
    description: "All posts on the Imagebed blog, newest first.",
    body: renderListShell({ heading: "Blog", categories, activeCategory: "", searchQuery: q }),
  }));
}

async function renderCategory(env, url, category) {
  const categories = await listCategories(env);
  if (!categories.includes(category)) {
    return html(404, page({
      title: `Category not found · Imagebed`,
      activeNav: "blog",
      body: `<div class="blog-wrap"><h2>Category not found</h2><p><a href="/blog/">← Back to blog</a></p></div>`,
    }));
  }
  const q = (url.searchParams.get("q") || "").trim();
  return html(200, page({
    title: `${category} · Blog · Imagebed`,
    activeNav: "blog",
    canonical: url.origin + categoryUrl(category),
    description: `Posts filed under “${category}”.`,
    body: renderListShell({ heading: `Category: ${category}`, categories, activeCategory: category, searchQuery: q }),
  }));
}

async function renderPost(env, url, category, postName) {
  const key = `${ROOT}${category}/${postName}.md`;
  const post = await loadPost(env, key);
  if (!post) {
    return html(404, page({
      title: `Post not found · Imagebed`,
      activeNav: "blog",
      body: `<div class="blog-wrap"><h2>Post not found</h2><p><a href="/blog/">← Back to blog</a></p></div>`,
    }));
  }
  const html_body = renderMarkdown(post.body);
  const excerpt = makeExcerpt(post.body, 200);
  const image = post.image ? absURL(url.origin, post.image) : "";
  const canonical = url.origin + post.url;

  const meta = [
    `<meta name="description" content="${escAttr(excerpt)}"/>`,
    `<meta property="og:type" content="article"/>`,
    `<meta property="og:title" content="${escAttr(post.title)}"/>`,
    `<meta property="og:description" content="${escAttr(excerpt)}"/>`,
    `<meta property="og:url" content="${escAttr(canonical)}"/>`,
    image ? `<meta property="og:image" content="${escAttr(image)}"/>` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"/>`,
    `<meta name="article:published_time" content="${escAttr(post.frontmatter.date || post.date)}"/>`,
  ].filter(Boolean).join("\n");

  const body = `
    <article class="blog-wrap post">
      <p class="post-nav"><a href="/blog/">← Blog</a> · <a href="${escAttr(categoryUrl(post.category))}">${escHtml(post.category)}</a></p>
      <h1 class="post-title">${escHtml(post.title)}</h1>
      <p class="post-meta"><time datetime="${escAttr(post.frontmatter.date || post.date)}">${escHtml(post.date)}</time> · in <a href="${escAttr(categoryUrl(post.category))}">${escHtml(post.category)}</a></p>
      ${post.image ? `<img class="post-feature" src="${escAttr(post.image)}" alt="${escAttr(post.title)}"/>` : ""}
      <div class="post-body">${html_body}</div>
    </article>
  `;
  return html(200, page({
    title: `${post.title} · Blog · Imagebed`,
    activeNav: "blog",
    canonical,
    extraHead: meta,
    body,
  }));
}

// ---------- shell ----------

function page({ title, activeNav, canonical, description, extraHead, body }) {
  const nav = renderNav(activeNav);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  ${canonical ? `<link rel="canonical" href="${escAttr(canonical)}"/>` : ""}
  ${description ? `<meta name="description" content="${escAttr(description)}"/>` : ""}
  ${extraHead || ""}
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header>
    <h1>📷 Imagebed</h1>
    ${nav}
    <div class="spacer"></div>
    <a class="ghost btn" href="/blog-edit.html" title="Create / manage blog posts">✎ Manage</a>
  </header>
  ${body}
</body>
</html>`;
}

function renderNav(active) {
  const items = [
    { href: "/", label: "Gallery", key: "gallery" },
    { href: "/generate.html", label: "AI Generate", key: "generate" },
    { href: "/blog/", label: "Blog", key: "blog" },
    { href: "/help.html", label: "Help", key: "help" },
  ];
  const links = items.map((it) =>
    `<a href="${it.href}"${active === it.key ? ' class="active"' : ""}>${it.label}</a>`
  ).join("");
  return `<nav>${links}</nav>`;
}

// The listing shell is rendered server-side but the actual list is loaded via
// /api/blog/list so search + pagination stay client-side. This means an empty
// initial HTML (no posts inline) if JS is disabled — a pragmatic trade-off
// given the max-100 rows cap in the spec.
function renderListShell({ heading, categories, activeCategory, searchQuery }) {
  const catLinks = [
    `<a href="/blog/" class="cat-chip${activeCategory === "" ? " active" : ""}">All</a>`,
    ...categories.map((c) =>
      `<a href="${escAttr(categoryUrl(c))}" class="cat-chip${c === activeCategory ? " active" : ""}">${escHtml(c)}</a>`
    ),
  ].join(" ");

  const initialQ = escAttr(searchQuery || "");
  const initialCategory = escAttr(activeCategory);

  return `
  <main class="blog-wrap">
    <h1 class="blog-heading">${escHtml(heading)}</h1>
    <nav class="cat-nav">${catLinks}</nav>
    <div class="blog-toolbar">
      <input type="search" id="blogSearch" placeholder="Search posts…" value="${initialQ}" />
    </div>
    <div id="blogList" class="blog-list">
      <div class="msg">Loading posts…</div>
    </div>
    <div class="blog-pager">
      <button class="ghost" id="prevBtn" disabled>← Prev</button>
      <span id="pageInfo" class="muted"></span>
      <button class="ghost" id="nextBtn" disabled>Next →</button>
    </div>
  </main>

  <script>
    const CATEGORY = ${JSON.stringify(activeCategory)};
    const PAGE_SIZE = 20;   // rows per client page; server cap is 100.
    const state = { offset: 0, q: ${JSON.stringify(searchQuery || "")}, total: 0, items: [], loading: false };

    const listEl = document.getElementById("blogList");
    const searchEl = document.getElementById("blogSearch");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const pageInfo = document.getElementById("pageInfo");

    function escapeHtml(s) { return String(s).replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function escapeAttr(s) { return escapeHtml(s); }

    async function load() {
      state.loading = true;
      listEl.innerHTML = '<div class="msg">Loading posts…</div>';
      const params = new URLSearchParams();
      if (CATEGORY) params.set("category", CATEGORY);
      if (state.q) params.set("q", state.q);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(state.offset));
      try {
        const res = await fetch("/api/blog/list?" + params);
        const data = await res.json();
        state.items = data.items || [];
        state.total = data.total || 0;
      } catch (e) {
        listEl.innerHTML = '<div class="msg err">Failed to load posts: ' + escapeHtml(e.message) + '</div>';
        state.loading = false;
        return;
      }
      state.loading = false;
      render();
    }

    function render() {
      if (!state.items.length) {
        listEl.innerHTML = '<div class="msg">No posts.</div>';
      } else {
        listEl.innerHTML = state.items.map((p) => \`
          <article class="post-card">
            \${p.image ? '<a class="thumb" href="' + escapeAttr(p.url) + '"><img loading="lazy" src="' + escapeAttr(p.image) + '" alt="' + escapeAttr(p.title) + '"/></a>' : ''}
            <div class="post-info">
              <h2 class="post-card-title"><a href="\${escapeAttr(p.url)}">\${escapeHtml(p.title)}</a></h2>
              <p class="post-card-meta"><time datetime="\${escapeAttr(p.date)}">\${escapeHtml(p.date)}</time> · <a href="/blog/\${encodeURIComponent(p.category)}/">\${escapeHtml(p.category)}</a></p>
              <p class="post-card-excerpt">\${escapeHtml(p.excerpt)}</p>
              <p class="post-card-more"><a href="\${escapeAttr(p.url)}">Read more →</a></p>
            </div>
          </article>
        \`).join("");
      }
      prevBtn.disabled = state.offset <= 0;
      nextBtn.disabled = state.offset + PAGE_SIZE >= state.total;
      const from = state.total === 0 ? 0 : state.offset + 1;
      const to = Math.min(state.total, state.offset + state.items.length);
      pageInfo.textContent = state.total ? \`\${from}–\${to} of \${state.total}\` : "";
    }

    prevBtn.addEventListener("click", () => {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
      load();
    });
    nextBtn.addEventListener("click", () => {
      state.offset = state.offset + PAGE_SIZE;
      load();
    });

    let debounce;
    searchEl.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = searchEl.value.trim();
        state.offset = 0;
        load();
      }, 250);
    });

    load();
  </script>`;
}

// ---------- helpers ----------

function html(status, body) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}

function absURL(origin, u) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return origin + u;
  return origin + "/" + u;
}

function page404(msg) {
  return `<!doctype html><meta charset="utf-8"><title>404</title>
  <body style="font:14px/1.5 system-ui;padding:40px"><h2>${escHtml(msg)}</h2>
  <p><a href="/blog/">← Back to blog</a></p></body>`;
}
