import type { Circle, IntroRequest, Person } from '../../domain/model/entities'

export const people: Person[] = [
  {
    id: 'p1', name: 'Laylo Karimova', role: 'Product designer', city: 'Toshkent', initials: 'LK', accent: '#c8ff62',
    intent: { id: 'i1', title: 'Ta’limni o‘yin kabi his qildiradigan mahsulot', outcome: '90 kunda yoshlar uchun zeriktirmaydigan learning prototype yaratish', offers: ['product design', 'user research', 'figma'], needs: ['technical cofounder', 'ai engineering', 'early users'], topics: ['education', 'ai', 'youth'], location: 'Toshkent', mode: 'hybrid', horizon: 'quarter', visibility: 'network' }
  },
  {
    id: 'p2', name: 'Amir Rahmon', role: 'AI engineer', city: 'Berlin', initials: 'AR', accent: '#8aa8ff',
    intent: { id: 'i2', title: 'Ochiq manbali ovoz agenti', outcome: 'Kam resursli tillar uchun real-time voice layer chiqarish', offers: ['ai engineering', 'open source', 'voice ai'], needs: ['uzbek speakers', 'distribution', 'product design'], topics: ['ai', 'language', 'open source'], location: 'Global', mode: 'online', horizon: 'month', visibility: 'network' }
  },
  {
    id: 'p3', name: 'Sofia Chen', role: 'Community builder', city: 'Singapore', initials: 'SC', accent: '#ff8f70',
    intent: { id: 'i3', title: 'Osiyo founderlarini bog‘lash', outcome: 'Yangi bozorlarga chiqayotgan 100 founder uchun trusted circle', offers: ['distribution', 'community', 'early users'], needs: ['founders', 'local insight', 'partnerships'], topics: ['startups', 'community', 'asia'], location: 'Asia', mode: 'online', horizon: 'now', visibility: 'network' }
  },
  {
    id: 'p4', name: 'Temur Soliyev', role: 'Growth strategist', city: 'Olmaota', initials: 'TS', accent: '#e5a8ff',
    intent: { id: 'i4', title: 'Consumer AI mahsulotini 0 → 100K qilish', outcome: 'Kuchli retention bor mahsulotga global growth loop qurish', offers: ['distribution', 'growth', 'analytics'], needs: ['consumer product', 'technical cofounder', 'storytelling'], topics: ['ai', 'startups', 'growth'], location: 'Global', mode: 'hybrid', horizon: 'month', visibility: 'network' }
  },
  {
    id: 'p5', name: 'Maya Okafor', role: 'Trust researcher', city: 'London', initials: 'MO', accent: '#70e1d0',
    intent: { id: 'i5', title: 'AI uchun insoniy rozilik standarti', outcome: 'Agentlar odam nomidan ish qilishidan oldin universal consent pattern yaratish', offers: ['user research', 'trust & safety', 'policy'], needs: ['prototype', 'ai engineering', 'design partners'], topics: ['ai', 'identity', 'trust'], location: 'Global', mode: 'online', horizon: 'quarter', visibility: 'network' }
  }
]

export const starterIntent = {
  title: 'Insonlarning niyatlarini imkoniyatga aylantirish',
  outcome: 'Har bir odamga ayni paytda kerakli inson yoki imkoniyatni topadigan global mahsulot qurish',
  offers: ['technical cofounder', 'local insight', 'storytelling'],
  needs: ['product design', 'ai engineering', 'distribution'],
  topics: ['ai', 'startups', 'identity'],
}

export const initialRequests: IntroRequest[] = [
  { id: 'r1', personId: 'p5', direction: 'incoming', scope: '20 daqiqalik product feedback', status: 'pending', sentAt: '12 daqiqa oldin' },
  { id: 'r2', personId: 'p2', direction: 'outgoing', scope: 'Texnik hamkorlikni o‘rganish', status: 'pending', sentAt: 'Kecha' },
  { id: 'r3', personId: 'p3', direction: 'incoming', scope: 'Community partnership', status: 'accepted', sentAt: '2 kun oldin' },
]

export const circles: Circle[] = [
  { id: 'c1', title: '7 kunda haqiqiy prototype', outcome: 'Har ishtirokchi test qilinadigan bitta mahsulot chiqaradi', members: 6, capacity: 8, day: 4, duration: 7, progress: 57, tags: ['builders', 'ship fast'] },
  { id: 'c2', title: 'Birinchi 10 user intervyu', outcome: 'Muammoni kod yozishdan oldin real odamlar bilan tekshirish', members: 5, capacity: 6, day: 2, duration: 14, progress: 18, tags: ['research', 'founders'] },
  { id: 'c3', title: 'AI × Mahalliy tillar', outcome: 'Kam resursli tillar uchun 3 ochiq demo yaratish', members: 4, capacity: 8, day: 8, duration: 30, progress: 31, tags: ['ai', 'language'] },
]