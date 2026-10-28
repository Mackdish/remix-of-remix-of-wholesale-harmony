import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Project-owned replacement for the generated `requireSupabaseAuth`.
 *
 * It only needs the backend URL and the *public* publishable key. These are
 * read from the server environment when present, and otherwise fall back to
 * the public values baked into the build (VITE_*). That way server actions
 * (purchases, sales, returns, stock takes, reports, AI insights) keep working
 * even when the hosting environment does not inject any backend keys at runtime.
 * No private/service keys are ever used — every query runs as the signed-in
 * user and is limited by the database access rules.
 */
function resolveBackendConfig() {
  const url =
    (typeof process !== "undefined" ? process.env?.SUPABASE_URL : undefined) ||
    import.meta.env.VITE_SUPABASE_URL;
  const key =
    (typeof process !== "undefined" ? process.env?.SUPABASE_PUBLISHABLE_KEY : undefined) ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("The app is not connected to its database. Please contact your administrator.");
  }
  return { url: url as string, key: key as string };
}

function isOpaqueKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function keyAwareFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isOpaqueKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { url, key } = resolveBackendConfig();

  const authHeader = getRequest()?.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token.split(".").length !== 3) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const supabase = createClient<Database>(url, key, {
    global: { fetch: keyAwareFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return next({
    context: { supabase, userId: data.claims.sub as string, claims: data.claims },
  });
});
