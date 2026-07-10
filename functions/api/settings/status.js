// GET /api/settings/status — auth. Returns info the /settings page needs.
import { requireAuth } from "../../_auth.js";
import { passwordIsOverridden } from "../../_admin.js";

export async function onRequestGet({ env, request }) {
  const gate = await requireAuth(env, request);
  if (gate) return gate;
  return Response.json({
    passwordSource: (await passwordIsOverridden(env)) ? "stored" : "env",
  });
}
