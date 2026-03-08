import { useState } from 'react'

export default function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = (value) => {
    try {
      const toStore = value instanceof Function ? value(stored) : value
      setStored(toStore)
      window.localStorage.setItem(key, JSON.stringify(toStore))
    } catch (e) {
      console.warn(`[Haven] localStorage write failed for key "${key}":`, e)
    }
  }

  return [stored, setValue]
}
