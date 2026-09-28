/**
 * Voert de SQL-migraties in supabase/migrations uit, in volgorde, elk één keer.
 * Houdt bij wat gedaan is in supabase_migrations.schema_migrations (zelfde tabel
 * als de Supabase CLI), zodat je later ook `supabase db push` kunt gebruiken.
 *
 *   npm run migrate            → voert nieuwe migraties uit
 *   npm run migrate -- --list  → toont wat al gedaan is
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.log('Geen SUPABASE_DB_URL in .env (Supabase → Connect → Session pooler).')
  process.exit(1)
}

const dir = path.resolve(process.cwd(), 'supabase/migrations')
const files = fs.readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort()
const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} })

try {
  await sql`create schema if not exists supabase_migrations`
  await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`
  const done = new Set((await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version))

  if (process.argv.includes('--list')) {
    for (const f of files) console.log(`  ${done.has(f.slice(0, 14)) ? '✓' : '·'} ${f}`)
  } else {
    let n = 0
    for (const f of files) {
      const version = f.slice(0, 14)
      if (done.has(version)) continue
      const body = fs.readFileSync(path.join(dir, f), 'utf8')
      await sql.begin(async (tx) => {
        await tx.unsafe(body)
        await tx`insert into supabase_migrations.schema_migrations (version, statements, name) values (${version}, ${[body]}, ${f.slice(15, -4)})`
      })
      console.log(`  ✓ ${f}`)
      n++
    }
    // PostgREST (supabase-js) kent nieuwe tabellen pas na het herladen van zijn schema
    if (n) await sql`notify pgrst, 'reload schema'`
    console.log(n ? `${n} migratie(s) uitgevoerd.` : 'Alles is al bijgewerkt.')
  }
} catch (e) {
  console.error(`Migratie mislukt: ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
