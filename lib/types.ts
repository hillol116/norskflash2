export type WordForms = {
  infinitive?: string
  present?: string
  past?: string
  perfect?: string
  plural?: string
}

export type ExampleSentence = {
  norwegian: string
  english: string
}

export type LookupResult = {
  norwegian_word: string
  english_meaning: string
  forms: WordForms
  sentences: ExampleSentence[]
  nuances: string
}

export type Flashcard = {
  id: string
  norwegian_word: string
  english_meaning: string
  forms: Record<string, string>
  sentences: { norwegian: string; english: string }[]
  nuances: string
  created_at: string
}
