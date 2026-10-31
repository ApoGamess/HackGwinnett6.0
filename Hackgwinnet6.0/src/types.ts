export type Page = 'care' | 'preferences' | 'providers' | 'letter' | 'visit' | 'access' | 'summary' | 'after' | 'explore' | 'camera'
export type Language = 'en' | 'es'
export type Journey = 'before' | 'during' | 'after'
export type AccessFeature = 'stepFree' | 'communication' | 'quiet'
export interface Preferences {
  stepFree: boolean
  communication: boolean
  quiet: boolean
  largeText: boolean
  highContrast: boolean
  readAloud: boolean
  reducedMotion: boolean
  simplified: boolean
}
export interface Provider {
  id: string
  name: string
  specialty: string
  area: string
  address: string
  description: string
  initials: string
  color: 'teal' | 'purple' | 'peach'
  features: AccessFeature[]
  /** An omitted feature is unknown unless it is explicitly unavailable here. */
  unavailableFeatures?: AccessFeature[]
  accessNotes: string[]
  arrival: string
}
export interface PreparationTask {
  id: string
  text: string
  done: boolean
  source: 'starter' | 'letter' | 'user'
  providerId?: string
  letterId?: string
  /** Stable imported identities retained when matching an existing typed item. */
  sourceIds?: string[]
  userEdited?: boolean
  textKey?: string
  textValues?: Record<string, string | number>
}
export interface Question {
  translations?: { en: string; es: string }
  navigationSource?: { name: string; nameEs: string; fictional: boolean }
  id: string
  text: string
  discussed: boolean
  note: string
  priority?: boolean
  /** User-written and edited wording is never automatically translated. */
  userEntered?: boolean
  /** Canonical wording of an added suggestion, retained after the user edits it. */
  sourceText?: string
  providerId?: string
  /** Stable suggestion identities retained even when the question is edited. */
  sourceIds?: string[]
}
export interface Appointment {
  letterId: string
  providerId: string
  clinicName: string
  date: string
  time: string
  arrivalTime: string
  address: string
  arrival: string
  source?: 'sample' | 'user'
  userEdited?: boolean
  editedFields?: string[]
}
export interface AppointmentLetter extends Omit<Appointment, 'letterId'> {
  id: string
  original: string
  summary: string
  tasks: PreparationTask[]
}
export interface AccessStatement {
  id: string
  text: string
  custom?: boolean
}
export interface ArrivalPlan {
  transport: string
  entrance: string
  note: string
}
export interface FollowUp {
  id: string
  title: string
  dueDate: string
  note: string
  done: boolean
}
