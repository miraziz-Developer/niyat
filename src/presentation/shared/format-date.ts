// Browsers ship incomplete Uzbek locale data, so names are formatted here instead of via Intl.
const months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const weekdays = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba']

/** "12 sentabr" */
export function formatShortDate(value: string | number | Date) {
  const date = new Date(value)
  return `${date.getDate()} ${months[date.getMonth()]}`
}

/** "SESHANBA · 09 SENTABR" */
export function formatDayHeading(value: string | number | Date = Date.now()) {
  const date = new Date(value)
  return `${weekdays[date.getDay()]} · ${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]}`.toUpperCase()
}
