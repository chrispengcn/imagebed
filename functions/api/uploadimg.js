// GET  /api/uploadimg  — self-contained HTML upload page (hidden; not linked
//                        from any nav, not in sitemap, robots-noindex).
// POST /api/uploadimg  — multipart form-data upload endpoint.
//
// Auth is by password field in the POST body, NOT the session cookie. That
// makes this endpoint scriptable from Python etc. without cookie juggling.
// The response is always JSON when POSTed, so the same URL doubles as the
// API and the interactive page.
//
// Fields (all in the same multipart body):
//   password  — required, matches the R2-stored admin password
//   folder    — optional, virtual folder (same semantics as /api/upload)
//   file      — required; multiple `file` fields are allowed
//
// Example (Python):
//   import requests
//   r = requests.post("https://.../api/uploadimg", data={
//       "password": "…", "folder": "photos/2026"
//   }, files=[("file", open("a.jpg","rb")), ("file", open("b.jpg","rb"))])
//   print(r.json())

import { verifyPassword } from "../_auth.js";
import { normalizeFolder } from "./upload.js";

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

export async function onRequestGet() {
  return new Response(renderPage(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Deliberately un-listed and un-indexed.
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPost({ env, request }) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  let form;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "invalid multipart body" }, { status: 400 }); }

  const password = String(form.get("password") || "");
  if (!password) return Response.json({ error: "password is required" }, { status: 401 });
  if (!(await verifyPassword(env, password))) {
    // Small delay to blunt brute-forcing — mirrors /api/login.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "invalid password" }, { status: 401 });
  }

  const files = form.getAll("file").filter((f) => f && typeof f === "object" && "arrayBuffer" in f);
  if (!files.length) return Response.json({ error: "no files (field name must be 'file')" }, { status: 400 });
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

// ---------- HTML form ----------
function renderPage() {
  return `<!doctype html>
<html lang="en" data-bs-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Quick image upload</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"/>
  <style>
    body { background: #f4f6fa; }
    .quick-card { max-width: 640px; margin: 40px auto; }
    .drop-zone {
      border: 2px dashed #cfd6de; border-radius: 10px;
      padding: 28px 20px; text-align: center; color: #6c757d;
      transition: all 0.15s ease; cursor: pointer; background: #fff;
    }
    .drop-zone.hover, .drop-zone:hover { border-color: #0d6efd; color: #0d6efd; background: #f0f7ff; }
    .drop-zone i { font-size: 2rem; display: block; margin-bottom: 8px; }
    .file-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .file-badge { font-size: 12px; padding: 3px 10px; background: #e7f1ff; color: #0a58ca; border-radius: 999px; }
    .result-item { display: flex; gap: 12px; align-items: center; padding: 8px; border-bottom: 1px solid #eef1f5; }
    .result-item img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; background: #f1f3f5; }
    .result-item .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="container quick-card">
    <div class="text-center mb-3">
      <span class="badge bg-warning text-dark">Hidden endpoint</span>
    </div>

    <div class="card border-0 shadow-sm">
      <div class="card-body p-4">
        <h4 class="card-title mb-1">Quick image upload</h4>
        <p class="text-muted small mb-4">
          Direct upload with password in the request — no login cookie needed.
          Also works as a POST endpoint for scripts (Python, curl…).
        </p>

        <form id="form" enctype="multipart/form-data">
          <div class="mb-3">
            <label class="form-label small">Password</label>
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-key"></i></span>
              <input type="password" name="password" class="form-control" id="pw" autocomplete="current-password" required/>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small">Save to folder <span class="text-muted">(optional)</span></label>
            <div class="input-group">
              <span class="input-group-text bg-white"><i class="bi bi-folder"></i></span>
              <input type="text" name="folder" class="form-control" placeholder="e.g. photos/2026" id="folder"/>
            </div>
            <div class="form-text">Leave blank to upload to the bucket root.</div>
          </div>

          <div class="mb-3">
            <label class="form-label small">Files</label>
            <div class="drop-zone" id="drop">
              <i class="bi bi-cloud-arrow-up"></i>
              <div><strong>Drop files here</strong> or click to select</div>
              <div class="small mt-1">You can select multiple files.</div>
              <input type="file" id="file" name="file" multiple hidden/>
            </div>
            <div class="file-badges" id="badges"></div>
          </div>

          <div id="alert" class="alert d-none" role="alert"></div>

          <div class="d-grid">
            <button type="submit" class="btn btn-primary" id="submit">
              <i class="bi bi-cloud-upload"></i> Upload
            </button>
          </div>
        </form>

        <div id="results" class="mt-4" style="display:none">
          <h6 class="text-muted small text-uppercase">Uploaded</h6>
          <div id="resultList"></div>
        </div>
      </div>
    </div>

    <p class="text-center text-muted small mt-3">
      <a href="/" class="text-decoration-none">← Back to gallery</a>
    </p>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const drop = $("drop"), fileInput = $("file"), badges = $("badges");
    let picked = [];

    drop.addEventListener("click", () => fileInput.click());
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("hover"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("hover"); }));
    drop.addEventListener("drop", (e) => { picked = Array.from(e.dataTransfer.files); renderBadges(); });
    fileInput.addEventListener("change", () => { picked = Array.from(fileInput.files); renderBadges(); });

    function renderBadges() {
      badges.innerHTML = picked.map((f) => \`<span class="file-badge">\${escapeHtml(f.name)} · \${fmtSize(f.size)}</span>\`).join("");
    }
    function fmtSize(n) {
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
      return (n / 1024 / 1024).toFixed(2) + " MB";
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

    function showAlert(msg, variant) {
      const el = $("alert");
      el.className = "alert alert-" + variant;
      el.textContent = msg;
      el.classList.remove("d-none");
    }
    function clearAlert() { $("alert").classList.add("d-none"); }

    $("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      clearAlert();
      if (!picked.length) { showAlert("Please select at least one file.", "warning"); return; }
      const fd = new FormData();
      fd.append("password", $("pw").value);
      fd.append("folder", $("folder").value.trim());
      picked.forEach((f) => fd.append("file", f));

      const btn = $("submit");
      const prev = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Uploading…';
      try {
        const res = await fetch("/api/uploadimg", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) { showAlert(data.error || "Upload failed", "danger"); return; }
        showAlert("Uploaded " + data.uploaded.length + " file(s) to " + (data.folder || "root"), "success");
        $("results").style.display = "";
        $("resultList").innerHTML = data.uploaded.map((u) => \`
          <div class="result-item">
            <img src="\${u.url}" onerror="this.style.visibility='hidden'"/>
            <div class="flex-grow-1 min-w-0">
              <div class="url"><a href="\${u.url}" target="_blank">\${u.url}</a></div>
              <div class="text-muted small">\${fmtSize(u.size)}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="navigator.clipboard.writeText(location.origin + '\${u.url}')">
              <i class="bi bi-clipboard"></i>
            </button>
          </div>
        \`).join("");
        picked = []; renderBadges(); fileInput.value = "";
      } catch (err) {
        showAlert("Upload failed: " + (err.message || err), "danger");
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
  </script>
</body>
</html>`;
}
