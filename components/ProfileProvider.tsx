'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = { id: string; username: string }
type Flashcard = {
  id: string
  norwegian_word: string
  english_meaning: string
  forms?: any
  sentences?: any
  nuances?: string
}

type ProfileContextType = {
  activeProfile: Profile | null
  ready: boolean
  flashcards: Flashcard[]
  selectOrCreateProfile: (username: string) => Promise<void>
  saveFlashcard: (card: Omit<Flashcard, 'id'>) => Promise<void>
  removeFlashcard: (id: string) => Promise<void>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [ready, setReady] = useState(true)

  async function loadFlashcards(profileId: string) {
    const { data } = await supabase
      .from('flashcards')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
    if (data) setFlashcards(data)
  }

  async function selectOrCreateProfile(username: string) {
    const cleanName = username.trim().toLowerCase()
    if (!cleanName) return

    // Try fetching existing profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', cleanName)
      .maybeSingle()

    // If profile doesn't exist, create it
    if (!profile) {
      const { data: newProfile, error } = await supabase
        .from('profiles')
        .insert({ username: cleanName })
        .select()
        .single()
      if (error) throw error
      profile = newProfile
    }

    if (profile) {
      setActiveProfile(profile)
      await loadFlashcards(profile.id)
    }
  }

  async function saveFlashcard(card: Omit<Flashcard, 'id'>) {
    if (!activeProfile) return
    const { data, error } = await supabase
      .from('flashcards')
      .insert({ ...card, profile_id: activeProfile.id })
      .select()
      .single()

    if (!error && data) {
      setFlashcards((prev) => [data, ...prev])
    }
  }

  async function removeFlashcard(id: string) {
    const { error } = await supabase.from('flashcards').delete().eq('id', id)
    if (!error) {
      setFlashcards((prev) => prev.filter((c) => c.id !== id))
    }
  }

  return (
    <ProfileContext.Provider
      value={{
        activeProfile,
        ready,
        flashcards,
        selectOrCreateProfile,
        saveFlashcard,
        removeFlashcard,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used within ProfileProvider')
  return context
}
