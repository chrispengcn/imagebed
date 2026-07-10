// Client-side markdown renderer used by the blog editor for live preview.
// This is a browser copy of functions/_markdown.js (server module) so it can
// be imported as an ES module in the browser without a bundler. Keep the two
// files in sync when the renderer changes.

export function parseFrontmatter(src) {
  const text = String(src || "");
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: text };
  const head = text.slice(3, end).replace(/^\r?\n/, "");
  const rest = text.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};
  for (const line of head.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[m[1]] = v;
  }
  return { data, body: rest };
}

export function renderMarkdown(md) {
  const src = String(md || "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s{0,3}```\s*([\w.-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      i++;
      const buf = [];
      while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code${lang ? ` class="lang-${escAttr(lang)}"` : ""}>${escHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/.test(line)) { out.push("<hr/>"); i++; continue; }

    if (/^\s{0,3}>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++; }
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s{0,3}[-*+]\s+/, "")); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s{0,3}\d+[.)]\s+/, "")); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    const para = [line]; i++;
    while (i < lines.length && !isBlockStart(lines[i]) && !/^\s*$/.test(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join("\n"))}</p>`);
  }
  return out.join("\n");
}

function isBlockStart(line) {
  return /^\s{0,3}#{1,6}\s+/.test(line)
      || /^\s{0,3}```/.test(line)
      || /^\s{0,3}>\s?/.test(line)
      || /^\s{0,3}[-*+]\s+/.test(line)
      || /^\s{0,3}\d+[.)]\s+/.test(line)
      || /^\s{0,3}(?:-\s*){3,}$/.test(line);
}

function inline(text) {
  let s = escHtml(text);
  const codeSlots = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => { codeSlots.push(`<code>${code}</code>`); return ` CODE${codeSlots.length - 1} `; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => `<img src="${escAttr(url)}" alt="${escAttr(alt)}"${title ? ` title="${escAttr(title)}"` : ""}/>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, txt, url, title) => `<a href="${escAttr(url)}"${title ? ` title="${escAttr(title)}"` : ""}>${txt}</a>`);
  s = s.replace(/&lt;(https?:\/\/[^\s<>]+)&gt;/g, (_, url) => `<a href="${escAttr(url)}">${url}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  s = s.replace(/\n/g, "<br/>");
  s = s.replace(/ CODE(\d+) /g, (_, n) => codeSlots[Number(n)]);
  return s;
}

export function escHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function escAttr(s) { return escHtml(s); }
