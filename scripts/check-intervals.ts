/**
 * Controleert je intervals.icu-koppeling vanaf localhost.
 *
 *   npm run check                 → alleen lezen (profiel, FTP, wellness, ritten, power curve)
 *   npm run check -- i123456      → zelfde, voor een atleet die jou als coach heeft
 *   npm run check -- 0 --write    → zet 1 testworkout voor morgen in de kalender en haalt hem weer weg
 */
import 'dotenv/config'
import { IntervalsClient } from '../server/intervals'
import { fitCpModel } from '../shared/metrics'
import { addDays, today } from '../shared/util'

const args = process.argv.slice(2)
const athleteId = args.find((a) => !a.startsWith('--')) ?? '0'
const write = args.includes('--write')
const key = process.env.INTERVALS_API_KEY

const ok = (m: string) => console.log(`  ✓ ${m}`)
const bad = (m: string) => console.log(`  ✗ ${m}`)

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    bad(`${label}: ${(e as Error).message}`)
    return null
  }
}

async function main() {
  if (!key) {
    console.log('Geen INTERVALS_API_KEY in .env. Haal je key op via intervals.icu → Settings → Developer Settings.')
    process.exit(1)
  }
  const c = new IntervalsClient({ apiKey: key }, athleteId)
  const end = today()
  console.log(`\nintervals.icu-check voor athlete ${athleteId}${write ? ' (met schrijftest)' : ''}\n`)

  const a = await step('Profiel', () => c.athlete())
  if (!a) {
    console.log('\nKan het profiel niet lezen. Klopt de key? Bij een andere atleet: heeft die jou als coach toegevoegd?')
    process.exit(1)
  }
  ok(`Profiel: ${a.name ?? '(geen naam)'} (id ${a.id})`)

  const ss = await step('Sport-instellingen', () => c.sportSettings())
  const ride = ss?.find((s) => s.types?.includes('Ride'))
  ride?.ftp ? ok(`FTP fiets: ${ride.ftp} W`) : bad('Geen FTP voor Ride ingesteld (Koersplan gebruikt dan 250 W)')

  const w = await step('Wellness', () => c.wellness(addDays(end, -41), end))
  if (w) {
    const last = w.at(-1) as Record<string, number> | undefined
    ok(`Wellness: ${w.length} dagen · laatste CTL ${last?.ctl?.toFixed?.(1) ?? '?'}, ATL ${last?.atl?.toFixed?.(1) ?? '?'}${last?.hrv ? `, HRV ${last.hrv}` : ''}`)
  }

  const acts = await step('Activiteiten', () => c.activities(addDays(end, -27), end))
  if (acts) {
    const withLoad = acts.filter((x) => typeof x.icu_training_load === 'number').length
    ok(`Activiteiten (28 d): ${acts.length}, waarvan ${withLoad} met trainingsbelasting`)
    const strava = acts.filter((x) => String(x.source ?? '').toUpperCase() === 'STRAVA').length
    if (strava) bad(`${strava} activiteit(en) komen via Strava; die zijn via de API beperkt. Koppel Garmin/Wahoo direct aan intervals.icu.`)
  }

  const pc = await step('Power curve', () => c.powerCurve(addDays(end, -89), end))
  const curve0 = pc?.list?.[0]
  if (curve0) {
    const pts = curve0.secs.map((s, i) => ({ secs: s, watts: curve0.values[i] })).filter((p) => p.watts > 0)
    const m = fitCpModel(pts)
    m ? ok(`CP-model: CP ${m.cp} W, W′ ${(m.wPrime / 1000).toFixed(1)} kJ (R² ${m.r2})`) : bad('Te weinig maximale inspanningen tussen 2 en 20 min voor een CP-model')
  } else if (pc) bad('Geen power curve gevonden (rijdt de atleet met een vermogensmeter?)')

  const ev = await step('Kalender lezen', () => c.events(end, addDays(end, 28)))
  if (ev) ok(`Kalender: ${ev.length} items in de komende 4 weken`)

  if (write) {
    const date = addDays(end, 1)
    const extId = 'koersplan:check:test'
    const created = await step('Kalender schrijven', () =>
      c.upsertEvents([
        {
          category: 'WORKOUT',
          start_date_local: `${date}T00:00:00`,
          type: 'Ride',
          name: 'Koersplan testworkout (wordt verwijderd)',
          description: 'Test vanaf localhost\n\nWarming-up\n- 10m ramp 50-75%\n\nBlok 3x\n- 5m 90%\n- 3m 55%',
          moving_time: 1920,
          icu_training_load: 30,
          external_id: extId,
        },
      ]),
    )
    if (created) {
      ok(`Testworkout aangemaakt op ${date} (event ${created[0]?.id})`)
      const del = await step('Opruimen', () => c.deleteEvents([extId]))
      if (del !== null) ok('Testworkout weer verwijderd')
    }
  }
  console.log('\nKlaar. Start de app met: npm run dev → http://localhost:5173\n')
}

main()
