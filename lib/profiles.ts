'use client'

import type { LookupResult } from '@/lib/types'

export type StoredFlashcard = {
  id: string
  norwegian_word: string
  english_meaning: string
  forms: Record<string, string>
  sentences: { norwegian: string; english: string }[]
  nuances: string
  created_at: string
}

export type Profile = {
  name: string
  geminiKey: string
  flashcards: StoredFlashcard[]
}

const PROFILES_KEY = 'norsk-ord:profiles'
const ACTIVE_KEY = 'norsk-ord:active-profile'

function isBrowser() {
  return typeof window !== 'undefined'
}

function readAll(): Record<string, Profile> {
  if (!isBrowser()) return {}
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Profile>
    return parsed
  } catch {
    return {}
  }
}

function writeAll(profiles: Record<string, Profile>) {
  if (!isBrowser()) return
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export function getProfileNames(): string[] {
  return Object.keys(readAll()).sort((a, b) => a.localeCompare(b))
}

export function getProfile(name: string): Profile | null {
  return readAll()[name] ?? null
}

export function getActiveProfileName(): string {
  if (!isBrowser()) return ''
  return localStorage.getItem(ACTIVE_KEY) ?? ''
}

export function setActiveProfileName(name: string) {
  if (!isBrowser()) return
  localStorage.setItem(ACTIVE_KEY, name)
}

export function createProfile(name: string): Profile {
  const trimmed = name.trim()
  const all = readAll()
  if (!all[trimmed]) {
    all[trimmed] = { name: trimmed, geminiKey: '', flashcards: [] }
    writeAll(all)
  }
  return all[trimmed]
}

export function deleteProfile(name: string) {
  const all = readAll()
  delete all[name]
  writeAll(all)
  if (getActiveProfileName() === name) {
    setActiveProfileName('')
  }
}

export function setProfileGeminiKey(name: string, key: string) {
  const all = readAll()
  if (!all[name]) return
  all[name].geminiKey = key.trim()
  writeAll(all)
}

export function getProfileGeminiKey(name: string): string {
  return readAll()[name]?.geminiKey ?? ''
}

export function getProfileFlashcards(name: string): StoredFlashcard[] {
  return readAll()[name]?.flashcards ?? []
}

export function addProfileFlashcard(
  name: string,
  result: LookupResult
): StoredFlashcard {
  const all = readAll()
  const profile = all[name]
  const card: StoredFlashcard = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    norwegian_word: result.norwegian_word,
    english_meaning: result.english_meaning,
    forms: result.forms,
    sentences: result.sentences,
    nuances: result.nuances,
    created_at: new Date().toISOString(),
  }
  if (profile) {
    profile.flashcards.unshift(card)
    writeAll(all)
  }
  return card
}

export function deleteProfileFlashcard(name: string, id: string) {
  const all = readAll()
  const profile = all[name]
  if (!profile) return
  profile.flashcards = profile.flashcards.filter((c) => c.id !== id)
  writeAll(all)
}
