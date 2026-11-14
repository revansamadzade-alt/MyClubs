// The single Supabase client for ClubFund. Only public settings are used here (project URL + publishable key).
// It is loaded only by the ClubFund pages, so the rest of MyClubs never depends on Supabase being reachable.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False when this copy of MyClubs has no Supabase settings (see .env.example). */
export const clubfundConfigured = !!url && !!key && /^https?:\/\/[^/]+/.test(url);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!clubfundConfigured) throw new Error('ClubFund is not configured');
  client ??= createClient(url!, key!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'myclubs-clubfund-auth',
    },
  });
  return client;
}
