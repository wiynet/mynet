// Melk: creates an account from a nickname + password, with no email at all.
// Deployed as the Supabase Edge Function "melk-signup" (verify_jwt off: it is called before login).
// The account gets a placeholder address on the owner's domain that never receives mail.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const LOGIN_DOMAIN = "melk.mestario.top";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 40) || username;

  if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: "bad_username" }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: "bad_password" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: taken, error: lookupErr } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (lookupErr) return json({ error: "failed" }, 500);
  if (taken) return json({ error: "taken" }, 409);

  const { error } = await admin.auth.admin.createUser({
    email: `${username}@${LOGIN_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username, name, app: "melk" },
  });
  if (error) {
    const m = error.message || "";
    if (/already|exists|registered/i.test(m)) return json({ error: "taken" }, 409);
    if (/password/i.test(m)) return json({ error: "weak_password" }, 400);
    console.error("createUser failed", m);
    return json({ error: "failed" }, 500);
  }
  return json({ ok: true, email: `${username}@${LOGIN_DOMAIN}` });
});
