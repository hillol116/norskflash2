import type { LookupResult } from './types'

export async function lookupSavedFirst(
  word: string,
  findSavedWord: (word: string) => Promise<LookupResult | null>,
  lookupProvider: () => Promise<LookupResult>
): Promise<{ result: LookupResult; fromSavedCard: boolean }> {
  const saved = await findSavedWord(word)
  if (saved) return { result: saved, fromSavedCard: true }
  return { result: await lookupProvider(), fromSavedCard: false }
}
