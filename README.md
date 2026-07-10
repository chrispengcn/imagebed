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

## Layout

```
functions/
  _auth.js          Session cookie helpers (HMAC-signed, HTTP-only, 7 days)
  api/list.js       GET  /api/list?prefix=folder/
  api/login.js      GET  /api/login  (status), POST /api/login (password)
  api/logout.js     POST /api/logout
  api/upload.js     POST /api/upload      (multipart, field=file[, folder])  [auth]
  api/delete.js     POST /api/delete      {key} or {keys}                    [auth]
  api/generate.js   POST /api/generate    {model, prompt, folder?, save?, …} [auth]
  file/[[key]].js   GET  /file/:key       (R2 pass-through)
public/
  index.html        Gallery + preview + folder nav + login
  generate.html     AI generate + folder target + login
  models.js         Shared model catalog (used by generate.html)
  styles.css
wrangler.toml       R2 + AI bindings
```

## Deploy

Prereqs: a Cloudflare account and the `wrangler` CLI.

```sh
# 1. Create the R2 bucket
npx wrangler r2 bucket create imagebed

# 2. Publish to Pages
npm run deploy

# 3. Set the admin password (this becomes the login password)
npx wrangler pages secret put ADMIN_PASSWORD --project-name imagebed
# Paste the password when prompted; wrangler stores it encrypted.
```

After the first deploy, open the Pages project **Settings → Functions → Bindings** and add:
- R2 binding: `BUCKET` → `imagebed`
- AI binding: `AI`

Subsequent `wrangler pages deploy` runs will reuse those bindings.

## Notes

- **Auth model:** one password (`ADMIN_PASSWORD` secret). Login issues an HMAC-signed session cookie tied to the current password value; changing the password invalidates every existing session (intentional). If the secret is unset, all locked endpoints return `503` and the login dialog will surface that message.
- **Default password:** the demo deployment uses the default password `123456`. Please change it immediately in production via `npx wrangler pages secret put ADMIN_PASSWORD --project-name imagebed`. / **默认密码：** 演示部署使用默认密码 `123456`，请在生产环境中通过 `npx wrangler pages secret put ADMIN_PASSWORD --project-name imagebed` 立即修改。
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

## 目录结构

```
functions/
  _auth.js          会话 cookie 工具（HMAC 签名、HTTP-only、7 天有效）
  api/list.js       GET  /api/list?prefix=folder/
  api/login.js      GET  /api/login  (状态查询)，POST /api/login (提交密码)
  api/logout.js     POST /api/logout
  api/upload.js     POST /api/upload      (multipart，字段=file[, folder])  [需登录]
  api/delete.js     POST /api/delete      {key} 或 {keys}                    [需登录]
  api/generate.js   POST /api/generate    {model, prompt, folder?, save?, …} [需登录]
  file/[[key]].js   GET  /file/:key       (R2 透传)
public/
  index.html        图库 + 预览 + 文件夹导航 + 登录
  generate.html     AI 生成 + 目标文件夹 + 登录
  models.js         共享模型目录（由 generate.html 使用）
  styles.css
wrangler.toml       R2 + AI 绑定配置
```

## 部署

前置条件：一个 Cloudflare 账号和 `wrangler` CLI。

```sh
# 1. 创建 R2 存储桶
npx wrangler r2 bucket create imagebed

# 2. 发布到 Pages
npm run deploy

# 3. 设置管理员密码（此密码即为登录密码）
npx wrangler pages secret put ADMIN_PASSWORD --project-name imagebed
# 按提示粘贴密码；wrangler 会加密存储。
```

首次部署后，打开 Pages 项目的 **Settings → Functions → Bindings**，添加：
- R2 绑定：`BUCKET` → `imagebed`
- AI 绑定：`AI`

后续 `wrangler pages deploy` 运行会复用这些绑定。

## 说明

- **认证模型：** 单一密码（`ADMIN_PASSWORD` 密钥）。登录后会签发一个与当前密码值绑定的 HMAC 签名会话 cookie；修改密码会使所有已签发的会话失效（这是有意为之）。如果未设置该密钥，所有受保护接口返回 `503`，登录对话框会显示相应提示。
- **默认密码：** 演示部署使用默认密码 `123456`，请在生产环境中通过 `npx wrangler pages secret put ADMIN_PASSWORD --project-name imagebed` 立即修改。
- **公开读取：** `GET /api/list` 和 `GET /file/:key` 无需登录。任何拿到 URL 的人都可以查看文件。
- **文件夹** 只是 R2 key 中以 `/` 分隔的前缀。删除文件夹中最后一个文件后，该文件夹会从列表中消失。
- **Nano Banana 第三方费用：** 这些模型为第三方模型（零数据保留），从你的 Workers AI 余额扣费，而不是免费每日额度。目前已对 `/api/generate` 强制鉴权，但仍请注意用量。
- 生成的图片以类似 `[folder/]ai_20260708T121530_<model>_<slug>.<ext>` 的 key 存入 R2。
