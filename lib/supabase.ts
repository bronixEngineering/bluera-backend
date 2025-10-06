import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseSingleton: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (supabaseSingleton) return supabaseSingleton;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  }

  supabaseSingleton = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseSingleton;
}


