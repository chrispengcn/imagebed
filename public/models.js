// Shared model catalog used by /api/generate and the /generate.html UI.
// Keeping it in one file means the dropdown and the server dispatch never
// drift apart. It's plain JS (no TS types) and served as a static asset so
// the front end can import it as a module.

export const MODELS = {
  "@cf/black-forest-labs/flux-1-schnell": {
    id: "@cf/black-forest-labs/flux-1-schnell",
    label: "FLUX.1 [schnell]",
    provider: "Black Forest Labs · Cloudflare",
    hint: "Fast distilled diffusion. Fixed 1024×1024. 8 steps ≈ best quality this model offers.",
    responseType: "base64",       // result.image is base64 JPEG
    contentType: "image/jpeg",
    ext: "jpg",
    fields: [
      { name: "steps", label: "Steps", type: "number", min: 1, max: 8, default: 8 },
    ],
  },

  "@cf/leonardo/phoenix-1.0": {
    id: "@cf/leonardo/phoenix-1.0",
    label: "Phoenix 1.0",
    provider: "Leonardo",
    hint: "Balanced quality/speed. Higher guidance = stronger prompt adherence but less variety.",
    responseType: "binary",       // env.AI.run returns a ReadableStream
    contentType: "image/jpeg",
    ext: "jpg",
    fields: [
      { name: "width",           label: "Width",           type: "number", min: 256, max: 2048, step: 8, default: 1024 },
      { name: "height",          label: "Height",          type: "number", min: 256, max: 2048, step: 8, default: 1024 },
      { name: "num_steps",       label: "Steps",           type: "number", min: 1,   max: 50,   default: 30 },
      { name: "guidance",        label: "Guidance",        type: "number", min: 2,   max: 10,   step: 0.1, default: 3.5 },
      { name: "negative_prompt", label: "Negative prompt", type: "text",   placeholder: "(optional) e.g. blurry, low quality, watermark" },
    ],
  },

  "@cf/leonardo/lucid-origin": {
    id: "@cf/leonardo/lucid-origin",
    label: "Lucid Origin",
    provider: "Leonardo",
    hint: "Photoreal-leaning. Native resolution is 1120×1120.",
    responseType: "base64",
    contentType: "image/jpeg",
    ext: "jpg",
    fields: [
      { name: "width",     label: "Width",     type: "number", min: 256, max: 2500, step: 8,   default: 1120 },
      { name: "height",    label: "Height",    type: "number", min: 256, max: 2500, step: 8,   default: 1120 },
      { name: "num_steps", label: "Steps",     type: "number", min: 1,   max: 40,              default: 30 },
      { name: "guidance",  label: "Guidance",  type: "number", min: 0,   max: 10,   step: 0.1, default: 4.5 },
    ],
  },

  "google/nano-banana": {
    id: "google/nano-banana",
    label: "Nano Banana",
    provider: "Google (third-party, zero-retention)",
    hint: "Fast text-to-image. Returns a signed URL; server fetches into R2.",
    responseType: "url",          // result.image is a URL to a public image
    contentType: null,            // determined by output_format
    ext: null,                    // determined by output_format
    fields: [
      { name: "aspect_ratio",  label: "Aspect ratio",  type: "select",
        options: ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], default: "1:1" },
      { name: "image_size",    label: "Size",          type: "select",
        options: ["1K","2K","4K"], default: "2K" },
      { name: "output_format", label: "Output format", type: "select",
        options: ["jpg","png","webp"], default: "jpg" },
    ],
  },

  "google/nano-banana-pro": {
    id: "google/nano-banana-pro",
    label: "Nano Banana Pro",
    provider: "Google (third-party, zero-retention)",
    hint: "Higher quality with better prompt adherence. Slower & more expensive than base Nano Banana.",
    responseType: "url",
    contentType: null,
    ext: null,
    fields: [
      { name: "aspect_ratio",  label: "Aspect ratio",  type: "select",
        options: ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], default: "1:1" },
      { name: "image_size",    label: "Size",          type: "select",
        options: ["1K","2K","4K"], default: "2K" },
      { name: "output_format", label: "Output format", type: "select",
        options: ["jpg","png","webp"], default: "jpg" },
    ],
  },
};

export const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

// Mime lookup for nano-banana's `output_format`.
export const MIME_FOR_FORMAT = {
  jpg:  { contentType: "image/jpeg", ext: "jpg"  },
  jpeg: { contentType: "image/jpeg", ext: "jpg"  },
  png:  { contentType: "image/png",  ext: "png"  },
  webp: { contentType: "image/webp", ext: "webp" },
};
