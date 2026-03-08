import { useCallback } from 'react'
import useLocalStorage from './useLocalStorage'
import { generateClientId } from '../utils/helpers'

export default function useClient() {
  const [clientId, setClientId] = useLocalStorage('haven_client_id', null)
  const [profile, setProfileRaw] = useLocalStorage('haven_profile', null)

  // Ensure clientId always exists
  const id = clientId || (() => {
    const newId = generateClientId()
    setClientId(newId)
    return newId
  })()

  const setProfile = useCallback((p) => {
    setProfileRaw(p)
  }, [setProfileRaw])

  const isOnboarded = !!(profile?.name || profile?.location)

  return { clientId: id, profile, setProfile, isOnboarded }
}
