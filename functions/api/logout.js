// POST /api/logout — clears the session cookie.
import { clearCookieHeader } from "../_auth.js";

export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearCookieHeader() },
  });
}
