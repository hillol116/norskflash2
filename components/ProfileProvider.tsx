'use client'

import React, { createContext, useContext, useState } from 'react'
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
  // Guarantees flashcards is always an array [], never undefined
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [ready] = useState(true)

  async function loadFlashcards(profileId: string) {
    try {
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading flashcards:', error.message)
        return
      }
      setFlashcards(data || [])
    } catch (err) {
      console.error('Failed to load flashcards:', err)
      setFlashcards([])
    }
  }

  async function selectOrCreateProfile(username: string) {
    const cleanName = username.trim().toLowerCase()
    if (!cleanName) return

    try {
      let { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', cleanName)
        .maybeSingle()

      if (fetchError) {
        console.error('Error fetching profile:', fetchError.message)
      }

      if (!profile) {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({ username: cleanName })
          .select()
          .single()

        if (insertError) {
          console.error('Error creating profile:', insertError.message)
          alert(`Failed to create profile: ${insertError.message}`)
          return
        }
        profile = newProfile
      }

      if (profile) {
        setActiveProfile(profile)
        await loadFlashcards(profile.id)
      }
    } catch (err: any) {
      console.error('Profile action failed:', err)
      alert(`Error: ${err.message || 'Could not connect to database'}`)
    }
  }

  async function saveFlashcard(card: Omit<Flashcard, 'id'>) {
    if (!activeProfile) return
    try {
      const { data, error } = await supabase
        .from('flashcards')
        .insert({ ...card, profile_id: activeProfile.id })
        .select()
        .single()

      if (!error && data) {
        setFlashcards((prev) => [data, ...prev])
      } else if (error) {
        console.error('Error saving flashcard:', error.message)
      }
    } catch (err) {
      console.error('Save flashcard failed:', err)
    }
  }

  async function removeFlashcard(id: string) {
    try {
      const { error } = await supabase.from('flashcards').delete().eq('id', id)
      if (!error) {
        setFlashcards((prev) => prev.filter((c) => c.id !== id))
      }
    } catch (err) {
      console.error('Delete flashcard failed:', err)
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
