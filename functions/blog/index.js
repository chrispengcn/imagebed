// GET /blog and /blog/ — the blog index page.
// Delegates to the same renderer as the catch-all sibling so we render one
// consistent shell for /blog/, /blog/<cat>/, and post pages.
export { onRequestGet } from "./[[path]].js";
