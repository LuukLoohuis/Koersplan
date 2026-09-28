import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppConfig } from '@shared/types'

/**
 * Supabase Auth in de browser: alleen de publishable key, uit /api/config.
 * De browser leest geen tabellen; hij haalt alleen een sessie op en stuurt het
 * access token mee naar de eigen API.
 */
let client: SupabaseClient | null = null

export function initAuth(cfg: NonNullable<AppConfig['auth']>): SupabaseClient {
  client ??= createClient(cfg.url, cfg.publishableKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}

export const authClient = () => client

/** Geldig access token (ververst zo nodig), of niets als er geen login is. */
export async function accessToken(): Promise<string | undefined> {
  if (!client) return undefined
  const { data } = await client.auth.getSession()
  return data.session?.access_token
}

/** Stuurt een inloglink. Alleen voor bestaande accounts: nieuwe coaches voegt de admin toe. */
export async function sendLoginLink(email: string, back: string) {
  if (!client) throw new Error('Inloggen staat niet aan.')
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}${back}` },
  })
  if (!error) return
  // Supabase meldt bij een onbekend adres "Signups not allowed for otp"
  if (/signup|not allowed|not found/i.test(error.message)) throw new Error('Dit e-mailadres heeft nog geen account. Vraag je coach of de beheerder om een uitnodiging.')
  if (error.status === 429) throw new Error('Te veel inlogpogingen. Wacht een paar minuten en probeer het opnieuw.')
  throw new Error(error.message)
}

export async function signOut() {
  await client?.auth.signOut()
}
