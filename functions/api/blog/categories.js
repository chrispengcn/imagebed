// GET /api/blog/categories — public
// Returns { categories: string[] }
import { listCategories } from "./_lib.js";

export async function onRequestGet({ env }) {
  const categories = await listCategories(env);
  return Response.json({ categories });
}
