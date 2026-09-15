import type { SchedulingFields } from './fsrs'

// Gemini returns different grammatical keys for nouns, verbs and adjectives.
export type WordForms = Record<string, string>
export type ExampleSentence = { norwegian: string; english: string }
export type LookupResult = {
  norwegian_word: string
  english_meaning: string
  forms: WordForms
  sentences: ExampleSentence[]
  nuances: string
}
export type Flashcard = LookupResult & SchedulingFields & {
  id: string
  profile_id: string | null
  // Legacy Auth ownership is retained, never reinterpreted as a profile ID.
  user_id?: string | null
  created_at: string
  review_version: number
}
