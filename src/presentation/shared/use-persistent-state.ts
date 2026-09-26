import { useEffect, useState } from 'react'
import { useStateStore } from './persistence-context'

/** Browser-persisted state. With `persist` false it behaves like useState, so server data never leaks into local storage. */
export function usePersistentState<T>(key: string, fallback: T, persist = true) {
  const store = useStateStore()
  const [value, setValue] = useState<T>(() => persist ? store.read(key, fallback) : fallback)

  useEffect(() => { if (persist) store.write(key, value) }, [key, persist, store, value])

  return [value, setValue] as const
}
