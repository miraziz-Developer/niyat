import type { StateStore } from '../../application/ports/state-store'

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export function saveLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The product remains usable when storage is blocked or full.
  }
}

export const browserStateStore: StateStore = {
  read: loadLocal,
  write: saveLocal,
}