import Anthropic from '@anthropic-ai/sdk'
import type { AthleteOverview, GenerateRequest, TrainingPlan } from '../shared/types'
import { normalizeAiPlan, type AiPlan } from '../shared/normalize'
import { addDays, DAY_LONG, DAY_SHORT, fmtDuration, mondayOf, round, weekday } from '../shared/util'
import { workoutMetrics } from '../shared/metrics'

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY)
export const aiModel = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const SYSTEM = `Je bent een ervaren wielrencoach die trainingsblokken ontwerpt voor een menselijke coach.
De coach controleert en past jouw concept aan voordat het naar de atleet gaat.

Werkwijze (Critical Power-denken, zoals moderne coachingplatforms):
- Baseer intensiteit op het CP-model (CP en W′) en de FTP. Doelen schrijf je als % van FTP.
- Stuur op belasting: CTL mag in opbouwweken 3–7 per week stijgen. Bij vorm (TSB) onder −25 eerst herstel inbouwen.
- Gebruik blokperiodisering: meestal 3 opbouwweken + 1 herstelweek (±60% belasting). Bij een doel/wedstrijd de laatste week tapers.
- Maximaal 2–3 kernsessies per week, nooit twee harde dagen achter elkaar, de lange rit op de opgegeven dag.
- Let op W′: intervallen boven CP moeten herstelbaar zijn; herstel tussen VO2-blokken ≥ 50–100% van de inspanning.
- Train duurvermogen (durability) waar relevant: tempo- of drempelblokken ná opgebouwde kilojoules in lange ritten.
- Houd rekening met HRV, rusthartslag, slaap en recente belasting.
- Progressie binnen het blok: meer tijd-in-zone per week, niet alleen hogere intensiteit.

Output-regels:
- Gebruik de tool create_training_block. Alle tekst in het Nederlands.
- Alleen datums binnen het blok en alleen op beschikbare dagen. Eén workout per dag.
- Totale duur per week ≤ het opgegeven aantal uren.
- Stappen: kind = steady | ramp | freeride. durationSec in seconden. lowPct/highPct = % FTP (bij ramp: begin/eind).
- Gebruik secties met repeat voor intervallen (bv. sectie "VO2max" repeat 5 met stappen 3 min 115% en 3 min 50%). Geen geneste herhalingen.
- Elke workout heeft een warming-up en cooling-down (behalve herstelritten).
- coachNote: 1–3 zinnen aan de atleet: doel van de sessie en hoe je hem uitvoert. Geen getallen met "x" aan het eind van een regel.
- rationale: 3–6 zinnen voor de coach over de opbouw en waarom, verwijzend naar de data.`

const TOOL: Anthropic.Tool = {
  name: 'create_training_block',
  description: 'Lever het complete trainingsblok als gestructureerde data.',
  input_schema: {
    type: 'object',
    required: ['title', 'rationale', 'weeks', 'workouts'],
    properties: {
      title: { type: 'string' },
      rationale: { type: 'string' },
      weeks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['index', 'focus'],
          properties: { index: { type: 'integer' }, focus: { type: 'string' } },
        },
      },
      workouts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['date', 'name', 'stimulus', 'coachNote', 'sections'],
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            name: { type: 'string' },
            stimulus: {
              type: 'string',
              enum: ['Herstel', 'Duur', 'Tempo', 'Sweetspot', 'Drempel', 'VO2max', 'Anaeroob', 'Sprint', 'Duurvermogen'],
            },
            coachNote: { type: 'string' },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'repeat', 'steps'],
                properties: {
                  name: { type: 'string' },
                  repeat: { type: 'integer', minimum: 1 },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['kind', 'durationSec', 'lowPct', 'highPct'],
                      properties: {
                        kind: { type: 'string', enum: ['steady', 'ramp', 'freeride'] },
                        durationSec: { type: 'integer' },
                        lowPct: { type: 'number' },
                        highPct: { type: 'number' },
                        cadence: { type: 'integer' },
                        cue: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

/** Het afgewezen voorstel beknopt: per training dag, naam, duur en TSS. */
function rejectedSummary(plan: TrainingPlan, ftp: number): string {
  return plan.workouts
    .filter((w) => w.stimulus !== 'Rust')
    .map((w) => {
      const m = workoutMetrics(w.sections, ftp)
      return `${DAY_SHORT[weekday(w.date)]} ${w.date} ${w.name} (${fmtDuration(m.durationSec)}, ${m.tss} TSS)`
    })
    .join('; ')
}

function context(ov: AthleteOverview, req: GenerateRequest, rejected?: TrainingPlan): string {
  const a = ov.athlete
  const end = ov.wellness.at(-1)?.date
  // Weekbelasting laatste 8 weken
  const weekly: string[] = []
  if (end) {
    for (let i = 7; i >= 0; i--) {
      const to = addDays(end, -i * 7)
      const from = addDays(to, -6)
      const tss = ov.activities.filter((x) => x.date >= from && x.date <= to).reduce((s, x) => s + x.load, 0)
      weekly.push(`${from}: ${round(tss)} TSS`)
    }
  }
  const recent = ov.activities
    .slice(0, 14)
    .map((x) => `${x.date} ${x.name} (${Math.round(x.movingTimeSec / 60)} min, ${x.load} TSS${x.intensity ? `, IF ${x.intensity}` : ''})`)
  const well = ov.wellness
    .slice(-7)
    .map((w) => `${w.date}: CTL ${w.ctl}, ATL ${w.atl}${w.hrv ? `, HRV ${w.hrv}` : ''}${w.restingHR ? `, RHR ${w.restingHR}` : ''}${w.sleepHours ? `, slaap ${w.sleepHours} u` : ''}`)
  const pd = ov.powerCurve
    .filter((p) => [5, 60, 300, 1200, 3600].includes(p.secs))
    .map((p) => `${p.secs}s: ${p.watts} W`)
  const blockEnd = addDays(mondayOf(req.startDate), req.weeks * 7 - 1)

  return `ATLEET: ${a.name}
FTP ${a.ftp} W${a.weightKg ? `, gewicht ${a.weightKg} kg` : ''}
CP-model: ${ov.model ? `CP ${ov.model.cp} W, W′ ${round(ov.model.wPrime / 1000, 1)} kJ, Pmax ${ov.model.pmax ?? '?'} W (R² ${ov.model.r2})` : 'onbekend'}
Power-duration (90 d): ${pd.join(', ') || 'onbekend'}
Nu: fitness (CTL) ${a.ctl}, vermoeidheid (ATL) ${a.atl}, vorm (TSB) ${a.tsb}, ramp ${a.rampRate}/week
Aandachtspunten: ${a.flags.join(', ') || 'geen'}

Weekbelasting laatste 8 weken:
${weekly.join('\n')}

Laatste 7 dagen wellness:
${well.join('\n')}

Recente activiteiten:
${recent.join('\n')}

Reeds geplande workouts (niet van jou): ${ov.plannedLoad.map((p) => `${p.date} ${p.name} ${p.load} TSS`).join('; ') || 'geen'}

OPDRACHT
Doel: ${req.goal || '(niet opgegeven)'}${req.eventDate ? `, doeldatum ${req.eventDate}` : ''}
Focus: ${req.focus}
Blok: ${req.weeks} weken, van ${req.startDate} t/m ${blockEnd}
Beschikbare dagen: ${req.availableDays.map((d) => DAY_LONG[d]).join(', ')}; lange rit op ${DAY_LONG[req.longRideDay]}
Maximaal ${req.hoursPerWeek} uur per week
Opmerkingen van de coach: ${req.notes || 'geen'}${
    req.instructions || rejected
      ? `\n\nOPNIEUW UITZETTEN\n${rejected ? `Het vorige voorstel was: ${rejectedSummary(rejected, a.ftp)}\n` : ''}${req.instructions ? `De coach wees het af met deze instructie: ${String(req.instructions).slice(0, 1000)}` : 'De coach wil een ander voorstel.'}`
      : ''
  }`
}

export async function generateWithClaude(ov: AthleteOverview, req: GenerateRequest, rejected?: TrainingPlan): Promise<TrainingPlan> {
  const client = new Anthropic()
  const stream = client.messages.stream({
    model: aiModel(),
    max_tokens: 32000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: context(ov, req, rejected) }],
  })
  const msg = await stream.finalMessage()
  const block = msg.content.find((c) => c.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('Claude gaf geen gestructureerd blok terug')
  if (msg.stop_reason === 'max_tokens') throw new Error('AI-antwoord afgekapt (max_tokens)')
  return normalizeAiPlan(block.input as AiPlan, req, ov.athlete)
}
