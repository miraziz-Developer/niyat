import { useEffect, useState } from 'react'
import { useStateStore } from './persistence-context'

export function usePersistentState<T>(key: string, fallback: T) {
  const store = useStateStore()
  const [value, setValue] = useState<T>(() => store.read(key, fallback))

  useEffect(() => store.write(key, value), [key, store, value])

  return [value, setValue] as const
}