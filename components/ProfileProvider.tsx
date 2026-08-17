'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getActiveProfileName,
  setActiveProfileName,
  getProfileNames,
  createProfile,
  deleteProfile as deleteProfileStore,
  getProfileGeminiKey,
  setProfileGeminiKey,
  getProfileFlashcards,
  addProfileFlashcard,
  deleteProfileFlashcard,
  type StoredFlashcard,
} from '@/lib/profiles'

type ProfileContextValue = {
  activeProfile: string
  profiles: string[]
  geminiKey: string
  hasKey: boolean
  ready: boolean
  selectProfile: (name: string) => void
  addProfile: (name: string) => void
  removeProfile: (name: string) => void
  saveKey: (key: string) => void
  flashcards: StoredFlashcard[]
  reloadFlashcards: () => void
  saveFlashcard: (card: Omit<StoredFlashcard, 'id' | 'created_at'>) => void
  removeFlashcard: (id: string) => void
}

const ProfileContext = createContext<ProfileContextValue>({
  activeProfile: '',
  profiles: [],
  geminiKey: '',
  hasKey: false,
  ready: false,
  selectProfile: () => {},
  addProfile: () => {},
  removeProfile: () => {},
  saveKey: () => {},
  flashcards: [],
  reloadFlashcards: () => {},
  saveFlashcard: () => {},
  removeFlashcard: () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [activeProfile, setActiveProfile] = useState('')
  const [profiles, setProfiles] = useState<string[]>([])
  const [geminiKey, setGeminiKey] = useState('')
  const [flashcards, setFlashcards] = useState<StoredFlashcard[]>([])

  function refresh() {
    const names = getProfileNames()
    setProfiles(names)
    const active = getActiveProfileName()
    setActiveProfile(active)
    setGeminiKey(active ? getProfileGeminiKey(active) : '')
    setFlashcards(active ? getProfileFlashcards(active) : [])
  }

  useEffect(() => {
    refresh()
    setReady(true)
  }, [])

  function selectProfile(name: string) {
    setActiveProfileName(name)
    setActiveProfile(name)
    setGeminiKey(name ? getProfileGeminiKey(name) : '')
    setFlashcards(name ? getProfileFlashcards(name) : [])
  }

  function addProfile(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    createProfile(trimmed)
    setActiveProfileName(trimmed)
    setActiveProfile(trimmed)
    setProfiles(getProfileNames())
    setGeminiKey('')
    setFlashcards([])
  }

  function removeProfile(name: string) {
    deleteProfileStore(name)
    const wasActive = activeProfile === name
    setProfiles(getProfileNames())
    if (wasActive) {
      setActiveProfile('')
      setActiveProfileName('')
      setGeminiKey('')
      setFlashcards([])
    }
  }

  function saveKey(key: string) {
    if (!activeProfile) return
    setProfileGeminiKey(activeProfile, key)
    setGeminiKey(key.trim())
  }

  function reloadFlashcards() {
    if (!activeProfile) return
    setFlashcards(getProfileFlashcards(activeProfile))
  }

  function saveFlashcard(card: Omit<StoredFlashcard, 'id' | 'created_at'>) {
    if (!activeProfile) return
    addProfileFlashcard(activeProfile, card as Parameters<typeof addProfileFlashcard>[1])
    setFlashcards(getProfileFlashcards(activeProfile))
  }

  function removeFlashcard(id: string) {
    if (!activeProfile) return
    deleteProfileFlashcard(activeProfile, id)
    setFlashcards(getProfileFlashcards(activeProfile))
  }

  const value: ProfileContextValue = {
    activeProfile,
    profiles,
    geminiKey,
    hasKey: ready && geminiKey.length > 0,
    ready,
    selectProfile,
    addProfile,
    removeProfile,
    saveKey,
    flashcards,
    reloadFlashcards,
    saveFlashcard,
    removeFlashcard,
  }

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
