# imagebed

A minimal Cloudflare Pages image bed:

- **Public read, authenticated write** — anyone can browse the gallery and view images. You need to log in (single admin password) to upload, delete, or generate.
- **No database** — files are stored directly in Cloudflare R2; the gallery is built from `R2.list()`. Folders are just key prefixes.
- **Gallery page** `/` — left pane shows the file list (name, date, size, sorted newest first) with breadcrumb folder navigation; click a row to preview on the right. Preview toolbar has Original / JPG / PNG / WebP download buttons that re-encode client-side via `<canvas>`.
- **AI Generate page** `/generate.html` — pick from several Workers AI image models and save results into R2 (optionally under a chosen folder):

  | Model | Model ID | Notable params |
  |---|---|---|
  | [FLUX.1 [schnell]](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) | `@cf/black-forest-labs/flux-1-schnell` | `steps` (1–8); fixed 1024×1024 |
  | [Phoenix 1.0](https://developers.cloudflare.com/workers-ai/models/phoenix-1.0/) | `@cf/leonardo/phoenix-1.0` | `width`/`height`, `num_steps`, `guidance`, `negative_prompt` |
  | [Lucid Origin](https://developers.cloudflare.com/workers-ai/models/lucid-origin/) | `@cf/leonardo/lucid-origin` | `width`/`height` (up to 2500), `num_steps`, `guidance` |
  | [Nano Banana](https://developers.cloudflare.com/ai/models/google/nano-banana/) | `google/nano-banana` | `aspect_ratio`, `image_size` (1K/2K/4K), `output_format` |
  | [Nano Banana Pro](https://developers.cloudflare.com/ai/models/google/nano-banana-pro/) | `google/nano-banana-pro` | same as Nano Banana |

  Response formats differ per model — base64, binary stream, or a signed URL. The server normalizes all three into bytes stored in R2.

- **Blog** `/blog/` — public, server-rendered markdown blog stored in the same R2 bucket:
  - Posts live at keys like `blog/<category>/YYYY-MM-DD-<slug>.md` with a small YAML frontmatter (`title`, `date`, `slug`, `category`, `image?`).
  - URLs are `/blog/<category>/YYYY-MM-DD-<slug>/` — SEO-friendly, trailing-slash canonical, with `<meta description>` and OpenGraph tags.
  - Category listing at `/blog/<category>/`, all-posts index at `/blog/`. Both have client-side search + next/prev pagination (100 rows/page max on the server).
  - `/blog-edit.html` is the login-gated manager: create categories, publish/edit/delete posts. Preview mode renders the markdown so you see the finished HTML before saving.
  - Publishing rebuilds `/sitemap.xml` automatically — it includes `/`, `/generate.html`, `/blog/`, every category page, every post, and `/help.html`.

- **Settings** `/settings.html` — login-gated. Change the login password at runtime (generate a random 16-char password, copy to clipboard, show/hide, save). The password is stored in R2 as a salted SHA-256 hash at the path from `PASSWORD_PATH` in wrangler.toml (default: `admin/pass-…`). If that file doesn't exist yet, the default login password is `123456` — log in and rotate it immediately. A **⚙ Settings** button appears next to *Signed in* on every logged-in page.

## Layout

```
functions/
  _auth.js            Session cookie helpers (HMAC-signed, HTTP-only, 7 days)
  _admin.js           Password storage — reads/writes the R2 blob at env.PASSWORD_PATH
  _markdown.js        Frontmatter parser + minimal markdown renderer (server side)
  _sitemap.js         Builds and writes sitemap.xml into R2
  api/list.js         GET  /api/list?prefix=folder/
  api/login.js        GET  /api/login  (status), POST /api/login (password)
  api/logout.js       POST /api/logout
  api/upload.js       POST /api/upload      (multipart, field=file[, folder])  [auth]
  api/delete.js       POST /api/delete      {key} or {keys}                    [auth]
  api/generate.js     POST /api/generate    {model, prompt, folder?, save?, …} [auth]
  api/uploadimg.js    GET  /api/uploadimg  (hidden form) · POST (password-in-body, scriptable)
  api/newpost.js      GET  /api/newpost    (hidden form) · POST (password-in-body, scriptable)
  api/blog/list.js    GET  /api/blog/list?category=&q=&limit=&offset=
  api/blog/categories.js  GET  /api/blog/categories
  api/blog/post.js    GET  /api/blog/post?key=blog/<cat>/<file>.md
  api/blog/save.js    POST /api/blog/save   {category, date, title, slug, image?, body, originalKey?} [auth]
  api/blog/delete.js  POST /api/blog/delete {key}                              [auth]
  api/blog/category.js POST /api/blog/category {name, action:"create"|"delete"} [auth]
  api/blog/rebuild-sitemap.js POST /api/blog/rebuild-sitemap                   [auth]
  api/settings/status.js   GET  /api/settings/status                          [auth]
  api/settings/password.js POST /api/settings/password  {current, next}       [auth]
  blog/[[path]].js    GET  /blog[/<cat>[/<slug>/]]  (server-rendered)
  blog/index.js       GET  /blog and /blog/         (delegates to catch-all)
  sitemap.xml.js      GET  /sitemap.xml
  file/[[key]].js     GET  /file/:key        (R2 pass-through)
public/
  index.html          Gallery + preview + folder nav + login
  generate.html       AI generate + folder target + login
  blog-edit.html      Blog manager (list / editor / preview / delete)  [auth]
  settings.html       Change login password (generate / copy / save)   [auth]
  markdown.js         Browser copy of the markdown renderer (for live preview)
  models.js           Shared model catalog (used by generate.html)
  help.html           How-to page
  styles.css
wrangler.toml         R2 + AI bindings
```

## Deploy

Repo: https://github.com/chrispengcn/imagebed

Prereqs: a Cloudflare account and the `wrangler` CLI (`npm i -g wrangler` or use `npx`).

```sh
# 0. Clone the project
git clone https://github.com/chrispengcn/imagebed.git
cd imagebed

# 1. Install dependencies (wrangler)
npm install

# 2. Create the R2 bucket
npx wrangler r2 bucket create imagebed

# 3. Pick a hard-to-guess path for the password blob in wrangler.toml:
#      [vars]
#      PASSWORD_PATH = "admin/pass-<random-string>"
#    (the default value in the file works, but replace the suffix so it isn't
#    the same across every deployment).

# 4. Publish to Pages
npm run deploy

# 5. Log in with the default password `123456`, then open /settings.html and
#    change the password immediately — that writes the salted hash to
#    R2 at PASSWORD_PATH.
```

After the first deploy, open the Pages project **Settings → Functions → Bindings** and add:
- R2 binding: `BUCKET` → `imagebed`
- AI binding: `AI`

Subsequent `wrangler pages deploy` runs will reuse those bindings.

## Resetting the password

The login password is a salted SHA-256 hash stored in R2 at the key given by
`PASSWORD_PATH` in [`wrangler.toml`](wrangler.toml). There is **no** wrangler
secret and no environment variable holding the plaintext — the R2 file is the
only source of truth. That gives you two ways to reset the password.

**Preferred — from the browser (no redeploy):**

1. Sign in with your current password.
2. Open `/settings.html`.
3. Click **🎲 Generate** for a random 16-character password (or type your own),
   optionally **📋 Copy** to your password manager, then **Save**.
4. The new hash overwrites the R2 file at `PASSWORD_PATH`. Every other logged-in
   session is invalidated on the next request; this browser stays signed in.

**Recovery — when you don't know the current password:**

Edit `wrangler.toml`, change `PASSWORD_PATH` to a **new** key (any string —
just pick something different from the current one) and redeploy:

```toml
[vars]
PASSWORD_PATH = "admin/pass-<new-random-suffix>"
```

```sh
npm run deploy
```

Because the new path points to a non-existent R2 object, the app falls back to
the default password `123456`. Sign in with `123456`, then immediately open
`/settings.html` and set a real password — that writes the salted hash to the
new path. The old R2 file (at the previous path) is now orphaned; delete it via
the R2 dashboard or `npx wrangler r2 object delete imagebed/<old-path>` if you
want a clean bucket.

## Hidden quick-upload endpoints (scriptable)

Two hidden URLs let you upload images or publish posts by putting the password
directly in the request body — no login cookie, no session juggling. They're
deliberately not linked from any nav, not in the sitemap, and served with
`X-Robots-Tag: noindex, nofollow`. Each URL doubles as an interactive HTML
form (GET) and a JSON/multipart API endpoint (POST).

### `/api/uploadimg` — upload one or more images

Fields (multipart form-data):

| field | required | notes |
|---|---|---|
| `password` | yes | matches the current admin password |
| `folder` | no | virtual folder prefix, e.g. `photos/2026` (blank = root) |
| `file` | yes | can be repeated for multiple files in one request |

```python
import requests

r = requests.post("https://imgbed.shopaii.net/api/uploadimg", data={
    "password": "…your password…",
    "folder": "photos/2026",
}, files=[
    ("file", ("a.jpg", open("a.jpg", "rb"), "image/jpeg")),
    ("file", ("b.png", open("b.png", "rb"), "image/png")),
])
print(r.json())
# -> {"uploaded":[{"key":"photos/2026/…_a.jpg","size":…,"url":"/file/…"}, …],
#     "folder":"photos/2026"}
```

### `/api/newpost` — publish a blog post

Accepts **either** JSON or multipart/form-data.

| field | required | notes |
|---|---|---|
| `password` | yes | matches the current admin password |
| `category` | yes | R2 folder for the post; created lazily |
| `date`     | yes | `YYYY-MM-DD` |
| `title`    | yes | |
| `slug`     | no  | auto-derived from `title` if omitted |
| `image`    | no  | featured image URL |
| `body`     | yes | markdown source |

Refuses to overwrite an existing `date+slug` in the same category (returns
`409`). Use the logged-in editor at `/blog-edit.html` for edits.

```python
import requests

r = requests.post("https://imgbed.shopaii.net/api/newpost", json={
    "password": "…your password…",
    "category": "news",
    "date":     "2026-07-11",
    "title":    "Hello world",
    "image":    "/file/photos/2026/hero.jpg",  # optional
    "body":     "# Hello\n\nFirst post from Python.",
})
print(r.json())
# -> {"key":"blog/news/2026-07-11-hello-world.md","url":"/blog/news/2026-07-11-hello-world/"}
```

Publishing also regenerates `/sitemap.xml`.

## Notes

- **Auth model:** one password, stored in R2 as a salted SHA-256 hash at the key from `PASSWORD_PATH` in `wrangler.toml`. On a fresh deploy — or any time that R2 file is missing — the fallback password is `123456`; log in and rotate it from `/settings.html`. Login issues an HMAC-signed session cookie tied to the current password; rotating the password invalidates every other existing session (the caller's cookie is re-signed so they stay signed in). `/file/*` and `/api/list` refuse to serve or expose the `PASSWORD_PATH` object. See [Resetting the password](#resetting-the-password) for the two reset paths.
- **Public read:** `GET /api/list` and `GET /file/:key` do NOT require login. Anyone with the URL can view files.
- **Folders** are just R2 key prefixes with `/`. Deleting the last file inside a folder makes the folder disappear from the listing.
- **Nano Banana third-party cost:** those models are third-party (zero data retention) and pull from your Workers AI credit rather than the free daily allowance. Auth is now required for `/api/generate`, but keep an eye on usage anyway.
- Generated images are stored to R2 under keys like `[folder/]ai_20260708T121530_<model>_<slug>.<ext>`.

---

# 中文说明

一个极简的 Cloudflare Pages 图床：

- **公开浏览，登录写入** — 任何人都可以浏览图库和查看图片。上传、删除或生成需要登录（单一管理员密码）。
- **无数据库** — 文件直接存储在 Cloudflare R2 中；图库通过 `R2.list()` 构建。文件夹只是 key 前缀。
- **图库页面** `/` — 左侧显示文件列表（名称、日期、大小，按时间倒序），带面包屑文件夹导航；点击一行在右侧预览。预览工具栏提供 原图 / JPG / PNG / WebP 下载按钮，通过 `<canvas>` 在客户端重新编码。
- **AI 生成页面** `/generate.html` — 从多个 Workers AI 图像模型中选择，并将结果保存到 R2（可选指定文件夹）：

  | 模型 | 模型 ID | 主要参数 |
  |---|---|---|
  | [FLUX.1 [schnell]](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) | `@cf/black-forest-labs/flux-1-schnell` | `steps` (1–8)；固定 1024×1024 |
  | [Phoenix 1.0](https://developers.cloudflare.com/workers-ai/models/phoenix-1.0/) | `@cf/leonardo/phoenix-1.0` | `width`/`height`、`num_steps`、`guidance`、`negative_prompt` |
  | [Lucid Origin](https://developers.cloudflare.com/workers-ai/models/lucid-origin/) | `@cf/leonardo/lucid-origin` | `width`/`height`（最高 2500）、`num_steps`、`guidance` |
  | [Nano Banana](https://developers.cloudflare.com/ai/models/google/nano-banana/) | `google/nano-banana` | `aspect_ratio`、`image_size` (1K/2K/4K)、`output_format` |
  | [Nano Banana Pro](https://developers.cloudflare.com/ai/models/google/nano-banana-pro/) | `google/nano-banana-pro` | 同 Nano Banana |

  不同模型的响应格式不同 —— base64、二进制流或签名 URL。服务器会将这三种格式统一转换为字节并存入 R2。

- **博客** `/blog/` —— 公开可读、服务端渲染的 Markdown 博客，与图片共用同一个 R2 存储桶：
  - 文章路径为 `blog/<分类>/YYYY-MM-DD-<slug>.md`，带简短的 YAML 头部（`title`、`date`、`slug`、`category`、可选 `image`）。
  - URL 形式为 `/blog/<分类>/YYYY-MM-DD-<slug>/`，SEO 友好、以斜杠结尾为规范形式，并输出 `<meta description>` 与 OpenGraph 标签。
  - `/blog/<分类>/` 为分类页，`/blog/` 为总索引；均支持前端搜索与 next/prev 分页（服务端每页上限 100 条）。
  - `/blog-edit.html` 是登录后的管理页：可新建分类、发布 / 编辑 / 删除文章；预览模式直接把 Markdown 渲染成最终 HTML。
  - 发布/删除文章会自动重建 `/sitemap.xml`，其中包含 `/`、`/generate.html`、`/blog/`、每个分类页、每篇文章以及 `/help.html`。

- **设置页** `/settings.html` —— 登录后可访问。用于在运行时修改登录密码：支持随机生成 16 位密码、显示/隐藏、复制到剪贴板、保存。密码以加盐 SHA-256 哈希形式存入 R2，路径由 wrangler.toml 中的 `PASSWORD_PATH` 指定（默认 `admin/pass-…`）；文件不存在时可用默认密码 `123456` 登录，方便首次重置密码。登录后所有页面顶部的 *Signed in* 旁会出现 **⚙ Settings** 按钮。

## 目录结构

```
functions/
  _auth.js            会话 cookie 工具（HMAC 签名、HTTP-only、7 天有效）
  _admin.js           密码存储 —— 读写 env.PASSWORD_PATH 指向的 R2 对象
  _markdown.js        前端/后端共享的 Markdown 渲染 + frontmatter 解析
  _sitemap.js         生成并写入 sitemap.xml 到 R2
  api/list.js         GET  /api/list?prefix=folder/
  api/login.js        GET  /api/login  (状态查询)，POST /api/login (提交密码)
  api/logout.js       POST /api/logout
  api/upload.js       POST /api/upload      (multipart，字段=file[, folder])  [需登录]
  api/delete.js       POST /api/delete      {key} 或 {keys}                    [需登录]
  api/generate.js     POST /api/generate    {model, prompt, folder?, save?, …} [需登录]
  api/uploadimg.js    GET  /api/uploadimg  (隐藏表单页) · POST（密码写在请求体，可脚本化）
  api/newpost.js      GET  /api/newpost    (隐藏表单页) · POST（密码写在请求体，可脚本化）
  api/blog/list.js    GET  /api/blog/list?category=&q=&limit=&offset=
  api/blog/categories.js   GET  /api/blog/categories
  api/blog/post.js    GET  /api/blog/post?key=blog/<分类>/<文件>.md
  api/blog/save.js    POST /api/blog/save                                     [需登录]
  api/blog/delete.js  POST /api/blog/delete                                   [需登录]
  api/blog/category.js POST /api/blog/category                                [需登录]
  api/blog/rebuild-sitemap.js POST /api/blog/rebuild-sitemap                  [需登录]
  api/settings/status.js   GET  /api/settings/status                          [需登录]
  api/settings/password.js POST /api/settings/password  {current, next}       [需登录]
  blog/[[path]].js    GET  /blog[/<分类>[/<slug>/]]   (服务端渲染)
  blog/index.js       GET  /blog 与 /blog/            (转发至 catch-all)
  sitemap.xml.js      GET  /sitemap.xml
  file/[[key]].js     GET  /file/:key       (R2 透传)
public/
  index.html          图库 + 预览 + 文件夹导航 + 登录
  generate.html       AI 生成 + 目标文件夹 + 登录
  blog-edit.html      博客管理页（列表 / 编辑 / 预览 / 删除）   [需登录]
  settings.html       修改登录密码（生成 / 复制 / 保存）        [需登录]
  markdown.js         浏览器端的 Markdown 渲染器（用于实时预览）
  models.js           共享模型目录（由 generate.html 使用）
  help.html           使用指南
  styles.css
wrangler.toml         R2 + AI 绑定配置
```

## 部署

仓库地址：https://github.com/chrispengcn/imagebed

前置条件：一个 Cloudflare 账号和 `wrangler` CLI（`npm i -g wrangler` 或使用 `npx`）。

```sh
# 0. 克隆项目
git clone https://github.com/chrispengcn/imagebed.git
cd imagebed

# 1. 安装依赖（wrangler）
npm install

# 2. 创建 R2 存储桶
npx wrangler r2 bucket create imagebed

# 3. 修改 wrangler.toml 中 [vars] 下的 PASSWORD_PATH，
#    换成一个不易猜测的路径（默认给了一个示例）：
#      [vars]
#      PASSWORD_PATH = "admin/pass-<随机字符串>"

# 4. 发布到 Pages
npm run deploy

# 5. 用默认密码 `123456` 登录，打开 /settings.html 立刻改密码 ——
#    这一步会把加盐哈希写入 R2 的 PASSWORD_PATH 路径。
```

首次部署后，打开 Pages 项目的 **Settings → Functions → Bindings**，添加：
- R2 绑定：`BUCKET` → `imagebed`
- AI 绑定：`AI`

后续 `wrangler pages deploy` 运行会复用这些绑定。

## 重置密码

登录密码以加盐 SHA-256 哈希形式存放在 R2 中，路径由 [`wrangler.toml`](wrangler.toml)
里的 `PASSWORD_PATH` 指定。项目里**没有** wrangler secret，也没有任何环境变量
保存明文 —— R2 上的那个文件是唯一的密码来源。所以你有两种重置方式：

**推荐方式 —— 在浏览器里改（不需要重新部署）：**

1. 用当前密码登录；
2. 打开 `/settings.html`；
3. 点 **🎲 Generate** 生成 16 位随机密码（也可以自己输入），可选 **📋 Copy**
   保存到密码管理器，然后点 **Save**；
4. 新哈希会覆盖 R2 上 `PASSWORD_PATH` 指向的文件。其他浏览器的会话会在下一次
   请求时失效，当前浏览器保持登录。

**忘记密码时的救急方式 —— 换一个 `PASSWORD_PATH`：**

编辑 `wrangler.toml`，把 `PASSWORD_PATH` 改成一个**新的**、当前 R2 里不存在的
路径（随便一个和之前不同的字符串即可），然后重新部署：

```toml
[vars]
PASSWORD_PATH = "admin/pass-<新的随机后缀>"
```

```sh
npm run deploy
```

因为新路径在 R2 里没有对应文件，程序会回落到默认密码 `123456`。此时用 `123456`
登录，立刻打开 `/settings.html` 设置新密码 —— 这个动作会向新路径写入加盐哈希。
旧路径下的文件不会再被使用，如果需要清理，可以在 R2 面板或用命令
`npx wrangler r2 object delete imagebed/<旧路径>` 删掉。

## 隐藏的快速上传端点（可脚本化）

两个隐藏 URL 允许你把密码直接放在请求里上传图片或发布文章 —— 不需要登录 cookie、
不需要维护会话。它们**没有**在任何导航中出现，**不进** sitemap，返回头带
`X-Robots-Tag: noindex, nofollow`。每个 URL 既是浏览器打开的可视表单（GET），
也是脚本可以 POST 的 JSON/multipart 端点。

### `/api/uploadimg` —— 上传一张或多张图片

字段（multipart/form-data）：

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `password` | 是 | 当前管理员密码 |
| `folder` | 否 | 目标文件夹前缀，如 `photos/2026`（留空 = 根目录） |
| `file` | 是 | 可重复出现，实现一次上传多张 |

```python
import requests

r = requests.post("https://imgbed.shopaii.net/api/uploadimg", data={
    "password": "……你的密码……",
    "folder": "photos/2026",
}, files=[
    ("file", ("a.jpg", open("a.jpg", "rb"), "image/jpeg")),
    ("file", ("b.png", open("b.png", "rb"), "image/png")),
])
print(r.json())
# -> {"uploaded":[{"key":"photos/2026/…_a.jpg","size":…,"url":"/file/…"}, …],
#     "folder":"photos/2026"}
```

### `/api/newpost` —— 发布一篇博客文章

同时接受 **JSON** 或 **multipart/form-data**。

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `password` | 是 | 当前管理员密码 |
| `category` | 是 | 分类目录名，不存在会自动创建 |
| `date`     | 是 | `YYYY-MM-DD` |
| `title`    | 是 | |
| `slug`     | 否 | 缺省根据 `title` 生成 |
| `image`    | 否 | 特色图 URL |
| `body`     | 是 | Markdown 正文 |

如果同一分类下已经存在相同 `date+slug`，会返回 `409` 拒绝覆盖。修改已有文章
请用登录后的 `/blog-edit.html`。

```python
import requests

r = requests.post("https://imgbed.shopaii.net/api/newpost", json={
    "password": "……你的密码……",
    "category": "news",
    "date":     "2026-07-11",
    "title":    "Hello world",
    "image":    "/file/photos/2026/hero.jpg",  # 可选
    "body":     "# Hello\n\n来自 Python 的第一篇文章。",
})
print(r.json())
# -> {"key":"blog/news/2026-07-11-hello-world.md","url":"/blog/news/2026-07-11-hello-world/"}
```

发布时会自动重建 `/sitemap.xml`。

## 说明

- **认证模型：** 单一密码，以加盐 SHA-256 哈希形式存入 R2，路径由 `wrangler.toml` 中的 `PASSWORD_PATH` 指定。首次部署或该文件缺失时，默认登录密码为 `123456`，请立即通过 `/settings.html` 修改。登录会签发与当前密码绑定的 HMAC 会话 cookie；修改密码会使**其他**已签发的会话失效，当前浏览器会立即拿到重新签名的新 cookie。`/file/*` 与 `/api/list` 会拒绝访问 `PASSWORD_PATH` 指向的对象。两种重置密码的方式详见上方 [重置密码](#重置密码) 章节。
- **公开读取：** `GET /api/list` 和 `GET /file/:key` 无需登录。任何拿到 URL 的人都可以查看文件。
- **文件夹** 只是 R2 key 中以 `/` 分隔的前缀。删除文件夹中最后一个文件后，该文件夹会从列表中消失。
- **Nano Banana 第三方费用：** 这些模型为第三方模型（零数据保留），从你的 Workers AI 余额扣费，而不是免费每日额度。目前已对 `/api/generate` 强制鉴权，但仍请注意用量。
- 生成的图片以类似 `[folder/]ai_20260708T121530_<model>_<slug>.<ext>` 的 key 存入 R2。
