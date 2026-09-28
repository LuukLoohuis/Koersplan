import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Supabase staat aan als de URL en beide sleutels in .env staan. Dan is inloggen verplicht. */
export const supabaseEnabled = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY)

let client: SupabaseClient | null = null

/** Serverclient met de secret key: omzeilt RLS. Nooit naar de browser. */
export function sb(): SupabaseClient {
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}

/** Fout van supabase-js omzetten naar een Error met een bruikbare melding. */
export function check<T>(r: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) {
    const hint = r.error.code === 'PGRST205' ? ' Draai eerst `npm run migrate`.' : ''
    throw new Error(`Supabase ${what}: ${r.error.message}.${hint}`)
  }
  return r.data
}
