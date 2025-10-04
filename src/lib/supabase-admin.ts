import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _sbAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_sbAdmin) return _sbAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  _sbAdmin = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _sbAdmin;
}

// Export as a getter so it's evaluated at runtime, not build time
export const sbAdmin = {
  get auth() { return getSupabaseAdmin().auth; },
  get from() { return getSupabaseAdmin().from; },
  get rpc() { return getSupabaseAdmin().rpc; },
  get storage() { return getSupabaseAdmin().storage; },
  get functions() { return getSupabaseAdmin().functions; },
  get realtime() { return getSupabaseAdmin().realtime; },
  get channel() { return getSupabaseAdmin().channel; },
  get removeAllChannels() { return getSupabaseAdmin().removeAllChannels; },
  get removeChannel() { return getSupabaseAdmin().removeChannel; },
  get getChannels() { return getSupabaseAdmin().getChannels; },
} as unknown as SupabaseClient;