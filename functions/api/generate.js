// POST /api/generate
// Body: { model, prompt, save?, folder?, ...model-specific-params }
//
// Dispatches to the selected Workers AI image model. All variants end with
// image bytes written to R2 (or returned as a data URI when save=false).
// Requires a valid session cookie.
//
// Model docs:
//   flux-1-schnell    https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
//   phoenix-1.0       https://developers.cloudflare.com/workers-ai/models/phoenix-1.0/
//   lucid-origin      https://developers.cloudflare.com/workers-ai/models/lucid-origin/
//   nano-banana       https://developers.cloudflare.com/ai/models/google/nano-banana/
//   nano-banana-pro   https://developers.cloudflare.com/ai/models/google/nano-banana-pro/
import { requireAuth } from "../_auth.js";
import { normalizeFolder } from "./upload.js";

const MIME_FOR_FORMAT = {
  jpg:  { contentType: "image/jpeg", ext: "jpg"  },
  jpeg: { contentType: "image/jpeg", ext: "jpg"  },
  png:  { contentType: "image/png",  ext: "png"  },
  webp: { contentType: "image/webp", ext: "webp" },
};

const MODELS = {
  "@cf/black-forest-labs/flux-1-schnell": {
    responseType: "base64",
    contentType: "image/jpeg",
    ext: "jpg",
    normalize(body) {
      const out = { prompt: body.prompt };
      const steps = Number(body.steps);
      if (Number.isFinite(steps)) out.steps = Math.max(1, Math.min(8, Math.round(steps)));
      out.seed = Math.floor(Math.random() * 1_000_000);
      return out;
    },
  },

  "@cf/leonardo/phoenix-1.0": {
    responseType: "binary",
    contentType: "image/jpeg",
    ext: "jpg",
    normalize(body) {
      const out = { prompt: body.prompt };
      clampInto(body, out, "width",     256, 2048);
      clampInto(body, out, "height",    256, 2048);
      clampInto(body, out, "num_steps", 1,   50);
      clampInto(body, out, "guidance",  2,   10);
      const neg = body.negative_prompt && String(body.negative_prompt).trim();
      if (neg) out.negative_prompt = neg;
      out.seed = Math.floor(Math.random() * 1_000_000);
      return out;
    },
  },

  "@cf/leonardo/lucid-origin": {
    responseType: "base64",
    contentType: "image/jpeg",
    ext: "jpg",
    normalize(body) {
      const out = { prompt: body.prompt };
      clampInto(body, out, "width",     256, 2500);
      clampInto(body, out, "height",    256, 2500);
      clampInto(body, out, "num_steps", 1,   40);
      clampInto(body, out, "guidance",  0,   10);
      out.seed = Math.floor(Math.random() * 1_000_000);
      return out;
    },
  },

  "google/nano-banana": {
    responseType: "url",
    normalize: nanoInput,
  },

  "google/nano-banana-pro": {
    responseType: "url",
    normalize: nanoInput,
  },
};

export async function onRequestPost({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;

  const body = await request.json().catch(() => ({}));
  const modelId = String(body.model || "@cf/black-forest-labs/flux-1-schnell");
  const spec = MODELS[modelId];
  if (!spec) return Response.json({ error: `unknown model: ${modelId}` }, { status: 400 });

  const prompt = String(body.prompt || "").trim();
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 2048) return Response.json({ error: "prompt too long (max 2048)" }, { status: 400 });

  const input = spec.normalize({ ...body, prompt });

  let result;
  try {
    result = await env.AI.run(modelId, input);
  } catch (e) {
    return Response.json({ error: `AI run failed: ${e.message || e}` }, { status: 502 });
  }

  // Coerce whatever the model returned into (bytes, contentType, ext).
  let bytes, contentType, ext;
  try {
    ({ bytes, contentType, ext } = await resolveResult(result, spec, body));
  } catch (e) {
    return Response.json({ error: `bad model response: ${e.message || e}` }, { status: 502 });
  }
  if (!bytes || !bytes.byteLength) {
    return Response.json({ error: "model returned no image bytes" }, { status: 502 });
  }

  if (body.save === false) {
    const b64 = bytesToBase64(bytes);
    return Response.json({ dataURI: `data:${contentType};base64,${b64}` });
  }

  const folder = normalizeFolder(body.folder);
  const key = makeKey(prompt, modelId, ext, folder);
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      generatedBy: modelId,
      prompt: prompt.slice(0, 512),
      params: JSON.stringify(input).slice(0, 1024),
    },
  });
  return Response.json({ key, url: `/file/${encodeURI(key)}`, size: bytes.byteLength, contentType });
}

async function resolveResult(result, spec, body) {
  // Some responses come as { result: { image }, state } (Gateway wrapper),
  // others as { image } directly, others as a ReadableStream (binary), and
  // some SDKs already give us a Response object.
  if (result instanceof Response) {
    const buf = new Uint8Array(await result.arrayBuffer());
    return { bytes: buf, contentType: result.headers.get("content-type") || spec.contentType || "image/jpeg", ext: spec.ext || extFromCT(result.headers.get("content-type")) };
  }
  if (result && typeof result === "object" && "getReader" in result) {
    // ReadableStream
    const buf = new Uint8Array(await new Response(result).arrayBuffer());
    return { bytes: buf, contentType: spec.contentType || "image/jpeg", ext: spec.ext || "jpg" };
  }

  // Some binding responses arrive as { body: ReadableStream, headers }
  if (result && typeof result === "object" && result.body && typeof result.body.getReader === "function") {
    const buf = new Uint8Array(await new Response(result.body).arrayBuffer());
    const ct = result.headers?.get?.("content-type") || spec.contentType || "image/jpeg";
    return { bytes: buf, contentType: ct, ext: spec.ext || extFromCT(ct) };
  }

  const payload = result?.result && typeof result.result === "object" ? result.result : result;
  const img = payload?.image;

  if (spec.responseType === "base64" || (typeof img === "string" && !/^https?:\/\//i.test(img))) {
    if (typeof img !== "string") throw new Error("expected base64 image field");
    const bytes = base64ToBytes(img.replace(/^data:[^,]+,/, ""));
    return { bytes, contentType: spec.contentType || "image/jpeg", ext: spec.ext || "jpg" };
  }

  if (spec.responseType === "url" || (typeof img === "string" && /^https?:\/\//i.test(img))) {
    if (typeof img !== "string") throw new Error("expected image URL");
    const res = await fetch(img);
    if (!res.ok) throw new Error(`fetching generated image failed: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || guessCTFromFormat(body.output_format) || "image/png";
    return { bytes: buf, contentType: ct, ext: extFromCT(ct) };
  }

  throw new Error("unrecognised response shape");
}

function nanoInput(body) {
  const out = { prompt: body.prompt };
  if (body.aspect_ratio)  out.aspect_ratio  = String(body.aspect_ratio);
  if (body.image_size)    out.image_size    = String(body.image_size);
  if (body.output_format) out.output_format = String(body.output_format);
  return out;
}

function clampInto(src, dst, name, min, max) {
  const v = Number(src[name]);
  if (!Number.isFinite(v)) return;
  dst[name] = Math.max(min, Math.min(max, v));
}

function guessCTFromFormat(fmt) {
  const m = MIME_FOR_FORMAT[String(fmt || "").toLowerCase()];
  return m?.contentType || null;
}
function extFromCT(ct) {
  if (!ct) return "bin";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png"))  return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif"))  return "gif";
  return "bin";
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function makeKey(prompt, modelId, ext, folder) {
  const now = new Date();
  const stamp =
    now.toISOString().replace(/[-:T]/g, "").slice(0, 14) +
    "_" + Math.random().toString(36).slice(2, 8);
  const modelTag = modelId.split("/").pop().replace(/[^\w.-]+/g, "");
  const slug = prompt.replace(/[^\w]+/g, "_").slice(0, 40) || "ai";
  const base = `ai_${stamp}_${modelTag}_${slug}.${ext || "jpg"}`;
  return folder ? `${folder}/${base}` : base;
}
