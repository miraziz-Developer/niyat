import { useEffect, useState } from 'react'
import { loadLocal, saveLocal } from '../../infrastructure/persistence/browser-storage'

export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => loadLocal(key, fallback))

  useEffect(() => saveLocal(key, value), [key, value])

  return [value, setValue] as const
}