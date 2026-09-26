import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_NOTICE_DURATION_MS = 3_200

export type Notice = { message: string; tone: 'success' | 'error' }

export function useTransientNotice(duration = DEFAULT_NOTICE_DURATION_MS) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const timeoutRef = useRef<number | undefined>(undefined)

  const showNotice = useCallback((message: string, tone: Notice['tone'] = 'success') => {
    window.clearTimeout(timeoutRef.current)
    setNotice({ message, tone })
    // Errors stay longer: they usually need to be read, not just noticed.
    timeoutRef.current = window.setTimeout(() => setNotice(null), tone === 'error' ? duration * 2 : duration)
  }, [duration])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return { notice, showNotice }
}
