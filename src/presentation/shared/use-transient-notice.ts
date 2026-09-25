import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_NOTICE_DURATION_MS = 2_400

export function useTransientNotice(duration = DEFAULT_NOTICE_DURATION_MS) {
  const [notice, setNotice] = useState('')
  const timeoutRef = useRef<number | undefined>(undefined)

  const showNotice = useCallback((message: string) => {
    window.clearTimeout(timeoutRef.current)
    setNotice(message)
    timeoutRef.current = window.setTimeout(() => setNotice(''), duration)
  }, [duration])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return { notice, showNotice }
}