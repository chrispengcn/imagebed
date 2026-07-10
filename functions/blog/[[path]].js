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
//
// Visual language for these pages is Bootstrap 5 (loaded from cdn.jsdelivr),
// distinct from the dark gallery/editor pages. Public blog pages get a
// clean editorial look; the /styles.css from the rest of the app is NOT
// pulled in here to keep the two themes from fighting.

import { loadPost, listAllPostObjects, listCategories, keyToUrl, categoryUrl, ROOT } from "../api/blog/_lib.js";
import { renderMarkdown, escHtml, escAttr, excerpt as makeExcerpt } from "../_markdown.js";

const BS_CSS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
const BS_JS  = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";

export async function onRequestGet({ env, request, params }) {
  const url = new URL(request.url);
  const raw = params.path;
  let segs = Array.isArray(raw) ? [...raw] : raw ? [raw] : [];
  while (segs.length && segs[segs.length - 1] === "") segs.pop();

  if (segs.length === 0) return renderIndex(env, url);

  if (segs.length === 1) {
    if (!url.pathname.endsWith("/")) {
      return Response.redirect(url.origin + url.pathname + "/" + url.search, 308);
    }
    return renderCategory(env, url, decodeURIComponent(segs[0]));
  }

  if (segs.length === 2) {
    if (!url.pathname.endsWith("/")) {
      return Response.redirect(url.origin + url.pathname + "/" + url.search, 308);
    }
    return renderPost(env, url, decodeURIComponent(segs[0]), decodeURIComponent(segs[1]));
  }

  return html(404, page({ title: "Not found · Blog", activeCategory: "", categories: [],
    body: `<div class="container py-5"><h1 class="h3">Not found</h1><p><a href="/blog/">← Back to blog</a></p></div>` }));
}

// ---------- pages ----------

async function renderIndex(env, url) {
  const categories = await listCategories(env);
  const q = (url.searchParams.get("q") || "").trim();
  return html(200, page({
    title: "Blog · Imagebed",
    activeCategory: "",
    categories,
    canonical: url.origin + "/blog/",
    description: "All posts on the Imagebed blog, newest first.",
    body: listShell({
      heroKicker: "Journal",
      heroTitle: "The Imagebed Blog",
      heroLead: "Notes, walkthroughs, and image experiments from the shopaii team.",
      categories,
      activeCategory: "",
      searchQuery: q,
    }),
  }));
}

async function renderCategory(env, url, category) {
  const categories = await listCategories(env);
  if (!categories.includes(category)) {
    return html(404, page({
      title: `Category not found · Blog`,
      activeCategory: "",
      categories,
      body: `<div class="container py-5">
        <h1 class="h3">Category not found</h1>
        <p class="text-muted">No such category: <code>${escHtml(category)}</code></p>
        <a class="btn btn-outline-primary" href="/blog/">← Back to blog</a>
      </div>`,
    }));
  }
  const q = (url.searchParams.get("q") || "").trim();
  return html(200, page({
    title: `${category} · Blog · Imagebed`,
    activeCategory: category,
    categories,
    canonical: url.origin + categoryUrl(category),
    description: `Posts filed under “${category}”.`,
    body: listShell({
      heroKicker: "Category",
      heroTitle: category,
      heroLead: `All posts filed under "${category}", newest first.`,
      categories,
      activeCategory: category,
      searchQuery: q,
    }),
  }));
}

async function renderPost(env, url, category, postName) {
  const key = `${ROOT}${category}/${postName}.md`;
  const post = await loadPost(env, key);
  const categories = await listCategories(env);
  if (!post) {
    return html(404, page({
      title: `Post not found · Blog`,
      activeCategory: category,
      categories,
      body: `<div class="container py-5">
        <h1 class="h3">Post not found</h1>
        <a class="btn btn-outline-primary" href="/blog/">← Back to blog</a>
      </div>`,
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

  const readingTime = estimateReadingTime(post.body);

  const body = `
  <article class="post-article">
    ${post.image ? `<div class="post-hero" style="background-image:url('${escAttr(post.image)}')"></div>` : `<div class="post-hero post-hero--plain"></div>`}
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8">
          <nav aria-label="breadcrumb" class="mt-4">
            <ol class="breadcrumb small">
              <li class="breadcrumb-item"><a href="/blog/">Blog</a></li>
              <li class="breadcrumb-item"><a href="${escAttr(categoryUrl(post.category))}">${escHtml(post.category)}</a></li>
              <li class="breadcrumb-item active" aria-current="page">${escHtml(post.title)}</li>
            </ol>
          </nav>

          <header class="post-header mb-4">
            <span class="badge rounded-pill text-bg-primary mb-3">${escHtml(post.category)}</span>
            <h1 class="post-title display-5 fw-bold mb-3">${escHtml(post.title)}</h1>
            <div class="post-meta text-muted small d-flex flex-wrap gap-3">
              <span><i class="bi bi-calendar3"></i> <time datetime="${escAttr(post.frontmatter.date || post.date)}">${escHtml(post.date)}</time></span>
              <span>· ${readingTime} min read</span>
            </div>
          </header>

          <div class="post-body">
            ${html_body}
          </div>

          <footer class="post-footer mt-5 pt-4 border-top">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <a class="btn btn-outline-secondary btn-sm" href="/blog/">← All posts</a>
              <a class="btn btn-outline-primary btn-sm" href="${escAttr(categoryUrl(post.category))}">More in ${escHtml(post.category)} →</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  </article>`;

  return html(200, page({
    title: `${post.title} · Blog · Imagebed`,
    activeCategory: post.category,
    categories,
    canonical,
    extraHead: meta,
    body,
  }));
}

// ---------- shell ----------

function page({ title, activeCategory, categories, canonical, description, extraHead, body }) {
  return `<!doctype html>
<html lang="en" data-bs-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  ${canonical ? `<link rel="canonical" href="${escAttr(canonical)}"/>` : ""}
  ${description ? `<meta name="description" content="${escAttr(description)}"/>` : ""}
  ${extraHead || ""}
  <link href="${BS_CSS}" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"/>
  <link href="/blog.css" rel="stylesheet"/>
</head>
<body class="blog-body">
  ${renderNav(activeCategory, categories)}
  ${body}
  ${renderFooter()}
  <script src="${BS_JS}" defer></script>
</body>
</html>`;
}

function renderNav(activeCategory, categories) {
  const catItems = (categories || []).slice(0, 8).map((c) => {
    const active = c === activeCategory ? " active" : "";
    return `<li><a class="dropdown-item${active}" href="${escAttr(categoryUrl(c))}">${escHtml(c)}</a></li>`;
  }).join("");
  const hasCats = (categories || []).length > 0;

  return `
  <nav class="navbar navbar-expand-lg bg-white border-bottom sticky-top">
    <div class="container">
      <a class="navbar-brand fw-bold" href="/blog/">
        <span class="text-primary">📷</span> Imagebed Blog
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#topnav" aria-controls="topnav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="topnav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><a class="nav-link" href="/">Gallery</a></li>
          <li class="nav-item"><a class="nav-link" href="/generate.html">AI Generate</a></li>
          <li class="nav-item"><a class="nav-link active" aria-current="page" href="/blog/">Blog</a></li>
          ${hasCats ? `
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Categories</a>
              <ul class="dropdown-menu">
                <li><a class="dropdown-item${activeCategory === "" ? " active" : ""}" href="/blog/">All posts</a></li>
                <li><hr class="dropdown-divider"></li>
                ${catItems}
              </ul>
            </li>
          ` : ""}
          <li class="nav-item"><a class="nav-link" href="/help.html">Help</a></li>
        </ul>
        <a class="btn btn-outline-primary btn-sm" href="/blog-edit.html">
          <i class="bi bi-pencil-square"></i> Manage
        </a>
      </div>
    </div>
  </nav>`;
}

function renderFooter() {
  const year = "2026"; // date not available in this runtime; page is server-rendered so a stale year is fine
  return `
  <footer class="blog-footer border-top mt-5 py-4">
    <div class="container text-center text-muted small">
      © ${year} Imagebed ·
      <a class="text-decoration-none" href="/">Gallery</a> ·
      <a class="text-decoration-none" href="/blog/">Blog</a> ·
      <a class="text-decoration-none" href="/sitemap.xml">Sitemap</a>
    </div>
  </footer>`;
}

// The list body: hero + category chips + search + grid + pager. The grid
// content is populated by the inlined script via /api/blog/list.
function listShell({ heroKicker, heroTitle, heroLead, categories, activeCategory, searchQuery }) {
  const chips = [
    `<a href="/blog/" class="cat-chip${activeCategory === "" ? " cat-chip-active" : ""}">All</a>`,
    ...categories.map((c) => {
      const active = c === activeCategory ? " cat-chip-active" : "";
      return `<a href="${escAttr(categoryUrl(c))}" class="cat-chip${active}">${escHtml(c)}</a>`;
    }),
  ].join("");

  return `
  <header class="blog-hero py-5">
    <div class="container">
      <p class="text-uppercase small text-primary fw-semibold mb-2 letter-spaced">${escHtml(heroKicker)}</p>
      <h1 class="display-4 fw-bold mb-3">${escHtml(heroTitle)}</h1>
      <p class="lead text-muted mb-0" style="max-width:720px">${escHtml(heroLead)}</p>
    </div>
  </header>

  <section class="blog-toolbar-wrap py-3 bg-white border-top border-bottom">
    <div class="container">
      <div class="d-flex flex-column flex-md-row gap-3 align-items-md-center justify-content-between">
        <div class="cat-chips">${chips}</div>
        <div class="search-box">
          <div class="input-group">
            <span class="input-group-text bg-white border-end-0"><i class="bi bi-search"></i></span>
            <input type="search" class="form-control border-start-0" id="blogSearch" placeholder="Search posts…" value="${escAttr(searchQuery || "")}"/>
          </div>
        </div>
      </div>
    </div>
  </section>

  <main class="container py-4 py-md-5">
    <div id="blogList" class="row g-4">
      <div class="col-12 text-center text-muted py-5">Loading posts…</div>
    </div>

    <nav class="mt-5" aria-label="Blog pagination">
      <ul class="pagination justify-content-center">
        <li class="page-item disabled" id="prevLi"><button type="button" class="page-link" id="prevBtn">← Prev</button></li>
        <li class="page-item disabled"><span class="page-link" id="pageInfo">—</span></li>
        <li class="page-item disabled" id="nextLi"><button type="button" class="page-link" id="nextBtn">Next →</button></li>
      </ul>
    </nav>
  </main>

  <script>
    const CATEGORY = ${JSON.stringify(activeCategory)};
    const PAGE_SIZE = 12;
    const state = { offset: 0, q: ${JSON.stringify(searchQuery || "")}, total: 0, items: [], loading: false };

    const listEl   = document.getElementById("blogList");
    const searchEl = document.getElementById("blogSearch");
    const prevBtn  = document.getElementById("prevBtn");
    const nextBtn  = document.getElementById("nextBtn");
    const prevLi   = document.getElementById("prevLi");
    const nextLi   = document.getElementById("nextLi");
    const pageInfo = document.getElementById("pageInfo");

    const escapeHtml = (s) => String(s).replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const escapeAttr = escapeHtml;

    async function load() {
      state.loading = true;
      listEl.innerHTML = '<div class="col-12 text-center text-muted py-5"><div class="spinner-border spinner-border-sm me-2"></div>Loading posts…</div>';
      const params = new URLSearchParams();
      if (CATEGORY) params.set("category", CATEGORY);
      if (state.q)  params.set("q", state.q);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(state.offset));
      try {
        const res = await fetch("/api/blog/list?" + params);
        const data = await res.json();
        state.items = data.items || [];
        state.total = data.total || 0;
      } catch (e) {
        listEl.innerHTML = '<div class="col-12"><div class="alert alert-danger">Failed to load posts: ' + escapeHtml(e.message) + '</div></div>';
        state.loading = false;
        return;
      }
      state.loading = false;
      render();
    }

    function render() {
      if (!state.items.length) {
        listEl.innerHTML = '<div class="col-12 text-center text-muted py-5"><i class="bi bi-inbox fs-1 d-block mb-2"></i>No posts yet.</div>';
      } else {
        listEl.innerHTML = state.items.map((p) => {
          const img = p.image
            ? '<a href="' + escapeAttr(p.url) + '" class="ratio ratio-16x9 d-block card-img-wrap"><img loading="lazy" src="' + escapeAttr(p.image) + '" alt="' + escapeAttr(p.title) + '" class="card-img-top object-fit-cover"/></a>'
            : '<a href="' + escapeAttr(p.url) + '" class="ratio ratio-16x9 d-block card-img-wrap card-img-placeholder"><span><i class="bi bi-image"></i></span></a>';
          return \`
            <div class="col-sm-6 col-lg-4">
              <article class="card h-100 post-card border-0 shadow-sm">
                \${img}
                <div class="card-body d-flex flex-column">
                  <div class="mb-2">
                    <a href="/blog/\${encodeURIComponent(p.category)}/" class="badge rounded-pill text-bg-light border text-decoration-none">\${escapeHtml(p.category)}</a>
                    <span class="text-muted small ms-1"><time datetime="\${escapeAttr(p.date)}">\${escapeHtml(p.date)}</time></span>
                  </div>
                  <h3 class="h5 card-title mb-2"><a class="stretched-link text-decoration-none text-body" href="\${escapeAttr(p.url)}">\${escapeHtml(p.title)}</a></h3>
                  <p class="card-text text-muted small mb-0">\${escapeHtml(p.excerpt || "")}</p>
                </div>
              </article>
            </div>
          \`;
        }).join("");
      }
      const canPrev = state.offset > 0;
      const canNext = state.offset + PAGE_SIZE < state.total;
      prevLi.classList.toggle("disabled", !canPrev);
      nextLi.classList.toggle("disabled", !canNext);
      prevBtn.disabled = !canPrev;
      nextBtn.disabled = !canNext;

      const from = state.total === 0 ? 0 : state.offset + 1;
      const to = Math.min(state.total, state.offset + state.items.length);
      pageInfo.textContent = state.total ? \`\${from}–\${to} of \${state.total}\` : "—";
    }

    prevBtn.addEventListener("click", () => { state.offset = Math.max(0, state.offset - PAGE_SIZE); load(); window.scrollTo({top: 0, behavior: "smooth"}); });
    nextBtn.addEventListener("click", () => { state.offset += PAGE_SIZE; load(); window.scrollTo({top: 0, behavior: "smooth"}); });

    let debounce;
    searchEl.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.q = searchEl.value.trim(); state.offset = 0; load(); }, 250);
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

// Rough English-word reading time; 200 wpm floor of 1 minute.
function estimateReadingTime(md) {
  const words = String(md || "").replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
