import { NetworkError } from '../../application/ports/network-client'

const byCode: Record<string, string> = {
  idempotency_conflict: 'Bu amal allaqachon boshqa ma’lumot bilan yuborilgan. Sahifani yangilab, qayta urinib ko‘ring.',
  invalid_csrf_token: 'Xavfsizlik tokeni eskirgan. Sahifani yangilang.',
  rate_limited: 'Bugungi limitga yetdingiz. Ertaga qayta urinib ko‘ring.',
}

const byStatus: Record<number, string> = {
  400: 'Ma’lumotlarda xato bor. Maydonlarni tekshirib, qayta yuboring.',
  401: 'Sessiya tugagan. Sahifani yangilab, qayta kiring.',
  403: 'Bu amalga ruxsatingiz yo‘q.',
  404: 'Topilmadi — ehtimol o‘chirilgan yoki siz uchun yashirilgan.',
  409: 'Holat o‘zgargan. Sahifani yangilab, oxirgi holatni ko‘ring.',
  413: 'Matn juda uzun.',
  429: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.',
}

/** Turns API and transport failures into short Uzbek guidance; raw server text is English and technical. */
export function describeError(error: unknown, fallback = 'Nimadir noto‘g‘ri ketdi. Qayta urinib ko‘ring.') {
  if (error instanceof NetworkError) return byCode[error.code] ?? byStatus[error.status] ?? (error.status >= 500 ? 'Serverda xatolik. Birozdan keyin qayta urinib ko‘ring.' : fallback)
  if (error instanceof TypeError) return 'Server bilan aloqa yo‘q. Internet ulanishini tekshiring.'
  return fallback
}
