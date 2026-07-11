// GET  /api/newpost  — self-contained HTML form to publish a blog post.
//                       Hidden: no nav link, no sitemap entry, robots-noindex.
// POST /api/newpost  — create or update a blog post. Auth by password field
//                       in the request body (not the session cookie), so this
//                       is scriptable from Python/curl without login flow.
//
// Accepts EITHER JSON or multipart/form-data. Fields:
//   password  (required) — matches the R2-stored admin password
//   category  (required) — R2 folder name; created lazily
//   date      (required) — YYYY-MM-DD
//   title     (required)
//   slug      (optional) — derived from title if omitted
//   image     (optional) — featured image URL
//   body      (required) — the markdown source
//   overwrite (optional) — truthy value replaces an existing post at the
//                          same category+date+slug (use it to edit-in-place
//                          from scripts); default is 409 conflict.
//
// Example (Python) — publish:
//   requests.post("…/api/newpost", json={
//       "password":"…","category":"news","date":"2026-07-11",
//       "title":"Hello","body":"# Hello"})
//
// Example (Python) — republish / edit the same post:
//   requests.post("…/api/newpost", json={
//       "password":"…","category":"news","date":"2026-07-11",
//       "title":"Hello","body":"# Updated body","overwrite": True})

import { verifyPassword } from "../_auth.js";
import { makePostKey, normalizeCategory, normalizeDate, slugifySeg, keyToUrl } from "./blog/_lib.js";
import { stringifyFrontmatter } from "../_markdown.js";
import { rebuildSitemap } from "../_sitemap.js";

export async function onRequestGet() {
  return new Response(renderPage(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPost({ env, request }) {
  const ct = request.headers.get("content-type") || "";
  let data;
  try {
    if (ct.includes("application/json")) {
      data = await request.json();
    } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      data = Object.fromEntries([...form.entries()]);
    } else {
      // Try JSON as a last resort — accommodates curl -d '{"…":…}' without -H.
      const text = await request.text();
      data = text ? JSON.parse(text) : {};
    }
  } catch {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  data = data || {};

  const password = String(data.password || "");
  if (!password) return Response.json({ error: "password is required" }, { status: 401 });
  if (!(await verifyPassword(env, password))) {
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "invalid password" }, { status: 401 });
  }

  const category = normalizeCategory(data.category);
  const date = normalizeDate(data.date);
  const title = String(data.title || "").trim();
  const slug = slugifySeg(data.slug || title);
  const image = String(data.image || "").trim();
  const md = String(data.body || "");

  if (!category) return Response.json({ error: "category is required" }, { status: 400 });
  if (!title)    return Response.json({ error: "title is required" }, { status: 400 });
  if (!slug)     return Response.json({ error: "slug is required (letters, numbers, dashes)" }, { status: 400 });
  if (!date)     return Response.json({ error: "invalid date" }, { status: 400 });
  if (!md.trim())return Response.json({ error: "body is required" }, { status: 400 });

  let key;
  try { key = makePostKey({ category, date, slug }); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }

  // By default refuse to overwrite an existing post with the same date+slug;
  // callers that mean to edit-in-place must set overwrite=true. Accept the
  // usual truthy shapes since this comes in as either JSON or form-encoded.
  const overwrite = isTruthy(data.overwrite);
  const existing = await env.BUCKET.head(key);
  if (existing && !overwrite) {
    return Response.json({
      error: "a post with this date+slug already exists in that category; pass overwrite=true to replace it",
      key,
    }, { status: 409 });
  }

  const fm = {
    title,
    date: new Date(`${date}T00:00:00Z`).toISOString(),
    slug,
    category,
  };
  if (image) fm.image = image;

  const text = stringifyFrontmatter(fm, md);
  await env.BUCKET.put(key, text, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { title: title.slice(0, 256), category: category.slice(0, 60) },
  });

  const origin = new URL(request.url).origin;
  await rebuildSitemap(env, origin);

  return Response.json({
    key,
    url: keyToUrl(key),
    replaced: !!existing,   // false = new post, true = overwrote an existing one
  });
}

// Loose truthiness — accepts booleans, strings, numbers, since this field
// arrives from JSON, multipart, or form-urlencoded bodies interchangeably.
function isTruthy(v) {
  if (v === true) return true;
  if (v == null || v === false) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

// ---------- HTML form ----------
function renderPage() {
  // Default the date input to today (in UTC — matches the server-side
  // normalizeDate fallback so the two agree).
  return `<!doctype html>
<html lang="en" data-bs-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Quick post publish</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"/>
  <style>
    body { background: #f4f6fa; }
    .quick-card { max-width: 780px; margin: 40px auto; }
    textarea[name="body"] {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 14px; min-height: 340px; line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container quick-card">
    <div class="text-center mb-3">
      <span class="badge bg-warning text-dark">Hidden endpoint</span>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body p-4">
        <h4 class="card-title mb-1">Quick post publish</h4>
        <p class="text-muted small mb-4">
          Publish a blog post with password in the request — no login cookie
          needed. Also works as a POST endpoint for scripts (JSON or form).
        </p>

        <form id="form">
          <div class="mb-3">
            <label class="form-label small">Password</label>
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-key"></i></span>
              <input type="password" name="password" class="form-control" autocomplete="current-password" required/>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label small">Category</label>
              <input type="text" name="category" class="form-control" placeholder="e.g. news" required/>
              <div class="form-text">Will be created if it doesn't exist.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label small">Date</label>
              <input type="date" name="date" class="form-control" id="date" required/>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-8">
              <label class="form-label small">Title</label>
              <input type="text" name="title" class="form-control form-control-lg" placeholder="Post title" id="title" required/>
            </div>
            <div class="col-md-4">
              <label class="form-label small">Slug</label>
              <input type="text" name="slug" class="form-control" placeholder="auto from title" id="slug"/>
              <div class="form-text">URL: /blog/&lt;cat&gt;/YYYY-MM-DD-&lt;slug&gt;/</div>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small">Featured image URL <span class="text-muted">(optional)</span></label>
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-image"></i></span>
              <input type="text" name="image" class="form-control" placeholder="/file/photos/hero.jpg or https://…"/>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small">Body <span class="text-muted">(Markdown)</span></label>
            <textarea name="body" class="form-control" spellcheck="false" placeholder="# Hello&#10;&#10;Write your post here…" required></textarea>
          </div>

          <div class="form-check mb-3">
            <input class="form-check-input" type="checkbox" name="overwrite" value="true" id="overwrite"/>
            <label class="form-check-label small" for="overwrite">
              Overwrite if a post with the same category + date + slug already exists (use to edit-in-place)
            </label>
          </div>

          <div id="alert" class="alert d-none" role="alert"></div>

          <div class="d-grid">
            <button type="submit" class="btn btn-primary" id="submit">
              <i class="bi bi-send"></i> Publish post
            </button>
          </div>
        </form>
      </div>
    </div>

    <p class="text-center text-muted small mt-3">
      <a href="/blog/" class="text-decoration-none">← Back to blog</a>
    </p>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    // Default date to today.
    (function () {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      $("date").value = \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())}\`;
    })();

    // Auto-slug from title while slug is untouched.
    let slugTouched = false;
    $("slug").addEventListener("input", () => { slugTouched = true; });
    $("title").addEventListener("input", () => {
      if (slugTouched) return;
      $("slug").value = String($("title").value)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^\\w\\s-]+/g, "")
        .trim()
        .replace(/\\s+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    });

    function showAlert(msg, variant, html) {
      const el = $("alert");
      el.className = "alert alert-" + variant;
      if (html) el.innerHTML = msg; else el.textContent = msg;
      el.classList.remove("d-none");
    }

    $("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("alert").classList.add("d-none");
      const btn = $("submit");
      const prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Publishing…';

      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      try {
        const res = await fetch("/api/newpost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            // Give the user a one-click retry that flips overwrite=true and
            // resubmits, so "oh I meant to update it" is a single interaction.
            const el = $("alert");
            el.className = "alert alert-warning";
            el.innerHTML =
              (data.error || "Conflict") +
              ' <button type="button" class="btn btn-sm btn-warning ms-2" id="retryOverwrite">Overwrite &amp; retry</button>';
            el.classList.remove("d-none");
            document.getElementById("retryOverwrite").addEventListener("click", () => {
              $("overwrite").checked = true;
              e.target.requestSubmit();
            });
            return;
          }
          showAlert(data.error || "Publish failed", "danger");
          return;
        }
        showAlert(
          (data.replaced ? "Replaced. " : "Published. ") +
            '<a href="' + data.url + '" target="_blank" class="alert-link">' + data.url + '</a>',
          "success",
          true
        );
        // Clear only the body so it's easy to fire off another post in the
        // same category. Leave the overwrite checkbox as-is (users editing a
        // series of posts often want it to stay on).
        e.target.body.value = "";
        e.target.title.value = "";
        e.target.slug.value = "";
        slugTouched = false;
      } catch (err) {
        showAlert("Publish failed: " + (err.message || err), "danger");
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
  </script>
</body>
</html>`;
}
