'use client'

import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Flashcard, LookupResult } from '@/lib/types'
import { newSchedulingFields, scheduleReview, schedulerParameters, schedulerVersion } from '@/lib/fsrs'
import { getProfileGeminiKey } from '@/lib/profiles'
import type { Grade } from 'ts-fsrs'

type Profile = { id: string; username: string }
type ProfileContextType = {
  activeProfile: Profile | null
  ready: boolean
  geminiKey: string
  saveKey: (key: string) => void
  flashcards: Flashcard[]
  dueCards: Flashcard[]
  selectOrCreateProfile: (username: string) => Promise<void>
  loadFlashcards: () => Promise<void>
  loadDueCards: () => Promise<void>
  saveFlashcard: (card: LookupResult) => Promise<void>
  removeFlashcard: (id: string) => Promise<void>
  reviewCard: (card: Flashcard, grade: Grade) => Promise<void>
}
const ProfileContext = createContext<ProfileContextType | undefined>(undefined)
const keyStorage = (id: string) => `norsk-ord:gemini-key:${id}`

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const profileRef = useRef<Profile | null>(null)
  const selection = useRef(0)
  const dueRequest = useRef(0)
  const allRequest = useRef(0)
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [dueCards, setDueCards] = useState<Flashcard[]>([])
  const [geminiKey, setGeminiKey] = useState('')
  const reviewing = useRef(new Set<string>())

  async function selectOrCreateProfile(username: string) {
    const cleanName = username.trim().toLowerCase()
    if (!cleanName) return
    const request = ++selection.current
    const { data, error } = await supabase.from('profiles').select('id, username')
      .eq('username', cleanName).maybeSingle()
    if (error) throw error
    let profile: Profile | null = data
    if (!profile) {
      const inserted = await supabase.from('profiles').insert({ username: cleanName })
        .select('id, username').single()
      if (inserted.error) throw inserted.error
      profile = inserted.data
    }
    if (request !== selection.current || !profile) return
    profileRef.current = profile
    ++dueRequest.current
    ++allRequest.current
    setActiveProfile(profile)
    setFlashcards([])
    setDueCards([])
    // Read the original local profile key as a fallback; do not rewrite its cards.
    let key = ''
    try { key = localStorage.getItem(keyStorage(profile.id)) ?? getProfileGeminiKey(profile.username) } catch {}
    setGeminiKey(key)
  }

  function saveKey(key: string) {
    const profile = profileRef.current
    if (!profile) throw new Error('Select a profile first.')
    localStorage.setItem(keyStorage(profile.id), key.trim())
    setGeminiKey(key.trim())
  }

  const loadFlashcards = useCallback(async () => {
    const profile = profileRef.current
    if (!profile) return
    const request = ++allRequest.current
    const cards: Flashcard[] = []
    // Explicit paging preserves browsing for decks larger than Supabase's row cap.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('flashcards').select('*')
        .eq('profile_id', profile.id).order('created_at', { ascending: false })
        .order('id').range(offset, offset + 499)
      if (error) throw error
      if (profileRef.current?.id !== profile.id || request !== allRequest.current) return
      cards.push(...(data as Flashcard[]))
      if (data.length < 500) break
    }
    setFlashcards(cards)
  }, [])

  const loadDueCards = useCallback(async () => {
    const profile = profileRef.current
    if (!profile) return
    const request = ++dueRequest.current
    const { data, error } = await supabase.from('flashcards').select('*')
      .eq('profile_id', profile.id).lte('due', new Date().toISOString())
      .order('due').order('id').limit(100)
    if (error) throw error
    if (profileRef.current?.id === profile.id && request === dueRequest.current) {
      setDueCards(data as Flashcard[])
    }
  }, [])

  async function saveFlashcard(card: LookupResult) {
    const profile = profileRef.current
    if (!profile) throw new Error('Select a profile first.')
    const { data, error } = await supabase.from('flashcards')
      .insert({ ...card, ...newSchedulingFields(), profile_id: profile.id })
      .select('*').single()
    if (error) throw error
    if (profileRef.current?.id === profile.id) {
      ++allRequest.current
      ++dueRequest.current
      setFlashcards(previous => [data as Flashcard, ...previous])
    }
  }

  async function removeFlashcard(id: string) {
    const profile = profileRef.current
    if (!profile) throw new Error('Select a profile first.')
    const { data, error } = await supabase.from('flashcards').delete()
      .eq('id', id).eq('profile_id', profile.id).select('id').single()
    if (error) throw error
    if (!data) throw new Error('The card could not be deleted. Refresh and try again.')
    if (profileRef.current?.id === profile.id) {
      ++allRequest.current
      ++dueRequest.current
      setFlashcards(previous => previous.filter(card => card.id !== id))
      setDueCards(previous => previous.filter(card => card.id !== id))
    }
  }

  async function reviewCard(card: Flashcard, grade: Grade) {
    const profile = profileRef.current
    if (!profile || card.profile_id !== profile.id) throw new Error('Select this card’s profile first.')
    if (reviewing.current.has(card.id)) throw new Error('This review is already saving.')
    reviewing.current.add(card.id)
    try {
      const next = scheduleReview(card, grade)
      const { data, error } = await supabase.rpc('review_flashcard', {
        p_card_id: card.id, p_profile_id: profile.id, p_expected_version: card.review_version,
        p_schedule: next.card, p_log: next.log,
        p_scheduler_version: schedulerVersion, p_parameters: schedulerParameters,
      }).single()
      if (error) throw error
      if (!data) throw new Error('No review was saved. Refresh and try again.')
      if (profileRef.current?.id === profile.id) {
        ++dueRequest.current
        ++allRequest.current
        setDueCards(previous => previous.filter(item => item.id !== card.id))
        setFlashcards(previous => previous.map(item => item.id === card.id ? data as Flashcard : item))
      }
    } finally {
      reviewing.current.delete(card.id)
    }
  }

  return <ProfileContext.Provider value={{ activeProfile, ready: true, geminiKey, saveKey,
    flashcards, dueCards, selectOrCreateProfile, loadFlashcards, loadDueCards,
    saveFlashcard, removeFlashcard, reviewCard }}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used within ProfileProvider')
  return context
}
