// Neutraal datamodel van Koersplan. Workouts worden hierin opgeslagen en pas bij
// publiceren omgezet naar intervals.icu-tekst (later ook Garmin/Wahoo/ZWO).

export type Sport = 'Ride' | 'VirtualRide'

export type StepKind = 'steady' | 'ramp' | 'freeride'

export interface Step {
  id: string
  kind: StepKind
  durationSec: number
  /** Doel als fractie van FTP (0.75 = 75%). Bij ramp: start. */
  lo: number
  /** Bij steady: bovenkant van de range (gelijk aan lo = vaste waarde). Bij ramp: eind. */
  hi: number
  cadence?: number
  cue?: string
}

export interface Section {
  id: string
  name: string
  repeat: number
  steps: Step[]
}

/** Het trainingsdoel/prikkel, zoals Vekta sessies benoemt. */
export type Stimulus =
  | 'Herstel'
  | 'Duur'
  | 'Tempo'
  | 'Sweetspot'
  | 'Drempel'
  | 'VO2max'
  | 'Anaeroob'
  | 'Sprint'
  | 'Duurvermogen'
  | 'Rust'

export interface FeedbackEntry {
  rpe: number // 1-10
  feel: 'sterk' | 'goed' | 'normaal' | 'zwaar' | 'kapot'
  comment: string
  at: string
}

/** Feedback van de atleet op een rit, los van de versies van de koers: blijft bij bijsturen en opnieuw bevestigen. */
export interface FeedbackRecord {
  workoutId: string
  /** dag en naam van de rit zoals de atleet hem had staan */
  date: string
  name: string
  feedback: FeedbackEntry
}

export interface Workout {
  id: string
  date: string // YYYY-MM-DD
  name: string
  sport: Sport
  stimulus: Stimulus
  coachNote: string
  sections: Section[]
  feedback?: FeedbackEntry
  /** intervals.icu event id na publiceren */
  remoteId?: number | string
}

export type PlanStatus = 'concept' | 'gepubliceerd' | 'gewijzigd'

/**
 * Status van één training, in de volgorde van het product:
 * Uitgezet → Bij coach → Bijgestuurd → Bevestigd → Op je fietscomputer → Gereden / Gemist.
 */
export type TrainingStatus = 'uitgezet' | 'bij-coach' | 'bijgestuurd' | 'bevestigd' | 'op-fietscomputer' | 'gereden' | 'gemist'

export interface PlanWeek {
  index: number
  focus: string
  targetTss: number
}

export interface TrainingPlan {
  id: string
  athleteId: string
  title: string
  goal: string
  startDate: string
  weeks: PlanWeek[]
  rationale: string
  workouts: Workout[]
  status: PlanStatus
  source: 'ai' | 'regels'
  createdAt: string
  publishedAt?: string
  /** Het oorspronkelijk uitgezette voorstel; basis voor "was → wordt". Alleen de server zet dit. */
  aiWorkouts?: Workout[]
  /** Het verzoek waarmee het voorstel is uitgezet (voor "Opnieuw laten uitzetten"). */
  request?: GenerateRequest
  /** Notitie van de coach aan de atleet bij deze koers. */
  note?: string
  /** Wanneer en door wie de coach de koers bevestigde. */
  confirmedAt?: string
  confirmedBy?: string
  /** Echt naar intervals.icu gezet (niet gesimuleerd): dan staat de koers op de fietscomputer. */
  syncedAt?: string
  /** De trainingen zoals de coach ze bevestigde; basis voor "opnieuw bevestigen". Alleen de server zet dit. */
  confirmedWorkouts?: Workout[]
  /** Feedback van de atleet per rit. Alleen de server zet dit. */
  feedbackLog?: FeedbackRecord[]
}

export interface WellnessDay {
  date: string
  ctl: number
  atl: number
  rampRate?: number
  hrv?: number
  restingHR?: number
  sleepHours?: number
}

export interface Activity {
  id: string
  date: string
  name: string
  type: string
  movingTimeSec: number
  distanceKm?: number
  load: number // TSS / icu_training_load
  intensity?: number // IF (0-1.x)
  avgWatts?: number
  normWatts?: number
}

export interface PowerPoint {
  secs: number
  watts: number
}

export interface CpModel {
  cp: number
  wPrime: number // joules
  pmax?: number
  r2?: number
  points: number
}

export interface AthleteSummary {
  id: string
  name: string
  source: 'demo' | 'oauth' | 'apikey'
  ftp: number
  weightKg?: number
  ctl: number
  atl: number
  tsb: number
  rampRate: number
  cp?: number
  wPrime?: number
  lastActivity?: string
  flags: string[]
  goal?: string
  /** Abonnement: AI + persoonlijke coach, of alleen AI */
  subscription?: 'coach' | 'ai'
  /** Vorm (TSB) van de laatste 28 dagen, oudste eerst */
  formSeries28?: number[]
  /** Op koers in de laatste 7 dagen: gereden t.o.v. geplande belasting, 0–100 */
  onCourse7d?: number
  /** Geplande trainingen in de laatste 7 dagen zonder rit */
  missed7d?: number
  /** Eerste dag zonder bevestigde koers (vanaf vandaag) */
  nextPlanDue?: string
  /** Uitgezette koersen die op de coach wachten */
  openProposals?: number
}

/** Een koers als doel (intervals.icu RACE_A/B/C). */
export interface Goal {
  date: string
  label: 'A' | 'B' | 'C'
  name: string
}

/**
 * Uitleg bij een dag in de vormgrafiek: van de AI, van de coach, of een signaal
 * dat een vaste regel uit de data haalt (geen AI).
 */
export interface Annotation {
  date: string
  kind: 'ai' | 'coach' | 'signaal'
  text: string
  /** Bij de coach: wie en wat, bv. "Ruud stuurde bij" */
  who?: string
}

export interface EftpPoint {
  date: string
  w: number
}

export interface AthleteOverview {
  athlete: AthleteSummary
  wellness: WellnessDay[]
  activities: Activity[]
  powerCurve: PowerPoint[]
  model: CpModel | null
  /** Geplande workouts die al in intervals.icu staan (niet uit Koersplan). */
  plannedLoad: { date: string; load: number; name: string }[]
  goals?: Goal[]
  annotations?: Annotation[]
  eftp?: EftpPoint[]
}

export interface GenerateRequest {
  goal: string
  eventDate?: string
  startDate: string
  weeks: number
  hoursPerWeek: number
  availableDays: number[] // 0 = maandag … 6 = zondag
  longRideDay: number
  focus: 'basis' | 'drempel' | 'vo2max' | 'duurvermogen' | 'sprint' | 'piek'
  notes: string
  /** Instructie van de coach bij "Opnieuw laten uitzetten" */
  instructions?: string
}

export interface PublishResult {
  ok: boolean
  simulated: boolean
  created: number
  message: string
  payloadPreview: unknown[]
}

export interface AppConfig {
  mode: 'server' | 'static-demo'
  oauthEnabled: boolean
  apiKeyEnabled: boolean
  aiEnabled: boolean
  aiModel?: string
  /** Naam van de coach ("Bevestigd door Ruud") */
  coachName?: string
}
