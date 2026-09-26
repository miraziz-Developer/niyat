import { describe, expect, it } from 'vitest'
import { formatDayHeading, formatShortDate } from './format-date'

describe('Uzbek date formatting', () => {
  it('formats headings and short dates without relying on Intl locale data', () => {
    const tuesday = new Date(2026, 8, 8, 12)
    expect(formatDayHeading(tuesday)).toBe('SESHANBA · 08 SENTABR')
    expect(formatShortDate(tuesday)).toBe('8 sentabr')
  })
})
