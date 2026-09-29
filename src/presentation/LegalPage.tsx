import { currentTermsVersion } from '../application/consent/consent'

export type LegalKind = 'privacy' | 'terms'

export const legalPaths: Record<LegalKind, string> = { privacy: '/maxfiylik', terms: '/shartlar' }

export function legalKindFor(pathname: string): LegalKind | null {
  if (pathname === legalPaths.privacy) return 'privacy'
  if (pathname === legalPaths.terms) return 'terms'
  return null
}

const contact = import.meta.env.VITE_CONTACT_EMAIL || '[aloqa emaili]'
const operator = import.meta.env.VITE_OPERATOR_NAME || 'NIYAT private alpha jamoasi'

type Section = { title: string; body: Array<string | string[]> }

/*
 * Retention periods below mirror the implementation (run_maintenance, session and token lifetimes).
 * Change both together.
 */
const retention: string[][] = [
  ['Kirish havolasi (token xeshi)', '15 daqiqa amal qiladi, 7 kundan keyin o‘chiriladi'],
  ['Sessiya', '12 soat amal qiladi, tugaganidan yoki chiqishdan 30 kun keyin o‘chiriladi'],
  ['Takroriy so‘rov himoyasi yozuvlari', '24 soat'],
  ['Yuborilgan bildirishnomalar jurnali', '30 kun'],
  ['Profil, niyatlar, intro va hamkorliklar', 'Akkaunt o‘chirilguncha'],
  ['Mahsulot statistikasi (hodisa nomi va vaqt)', 'Private alpha davomida, ko‘pi bilan 12 oy'],
  ['Shikoyatlar va moderator qarorlari', 'Private alpha davomida, ko‘pi bilan 12 oy'],
  ['Xavfsizlik audit jurnali', 'Private alpha davomida, ko‘pi bilan 12 oy'],
]

const privacy: Section[] = [
  { title: 'Kim ma’lumotni boshqaradi', body: [`${operator}. Savollar, eksport yoki o‘chirish so‘rovlari uchun: ${contact}.`] },
  { title: 'Qanday ma’lumot yig‘amiz', body: [[
    'Email manzilingiz — faqat kirish havolasi va siz yoqqan bildirishnomalar uchun.',
    'Ismingiz va qisqa bio — match’larda yashirin, faqat intro qabul qilingach ikki tomonga ochiladi.',
    'Niyatingiz: nima qurayotganingiz, taklif va ehtiyojlaringiz, mavzular, format va muddat.',
    'Intro so‘rovlari, hamkorlik bosqichlari, natija dalili va hamkor tasdig‘i.',
    'Bloklash va shikoyatlar; 18+ tasdig‘i va shartlarni qabul qilgan sana.',
    'Mahsulot statistikasi: qaysi amal qachon bajarilgani (masalan, “niyat e’lon qilindi”). Matn yoki xabar mazmuni yozilmaydi.',
  ]] },
  { title: 'Nima uchun ishlatamiz', body: [[
    'O‘zaro qiymat bo‘lgan odamlarni topish (match’lar tushuntirilgan qoidalar bilan hisoblanadi, AI qaror qabul qilmaydi).',
    'Siz rozilik bergan aloqalarni ochish va hamkorlikni yuritish.',
    'Xavfsizlik: suiiste’molni oldini olish, shikoyatlarni ko‘rib chiqish.',
    'Alpha natijalarini o‘lchash — faqat umumlashtirilgan ko‘rsatkichlar.',
  ]] },
  { title: 'Kim ko‘radi', body: [
    'Niyatingizni faqat match bo‘lgan a’zolar ko‘radi; “maxfiy” niyatlar hech kimga ko‘rsatilmaydi. Ismingiz intro qabul qilinmaguncha ochilmaydi. Shikoyatni moderatorlar ko‘radi, shikoyat qilingan odam kim yuborganini bilmaydi.',
    'Ma’lumot sotilmaydi. Email yuborish uchun xat provayderi (Resend) faqat email manzilingiz va xat matnini oladi.',
  ] },
  { title: 'Saqlash muddatlari', body: [] },
  { title: 'Huquqlaringiz', body: [`Ma’lumotlaringiz nusxasini olish, tuzatish yoki akkauntni o‘chirishni ${contact} orqali so‘rashingiz mumkin; 30 kun ichida javob beramiz. Bildirishnomalarni Trust markazida o‘chirib qo‘yishingiz mumkin.`] },
  { title: 'Xavfsizlik hodisasi', body: [`Ma’lumot sizib chiqishi aniqlansa, mas’ul (${operator}) 72 soat ichida ta’sirlangan a’zolarga xabar beradi. Zaiflik topsangiz: ${contact}.`] },
]

const terms: Section[] = [
  { title: 'Private alpha', body: ['NIYAT hozir sinov bosqichida va faqat taklif bilan ishlaydi. Xizmat o‘zgarishi, to‘xtatilishi yoki xatolar bo‘lishi mumkin; muhim ma’lumotni faqat shu yerda saqlamang.'] },
  { title: 'Kimlar foydalanishi mumkin', body: ['Faqat 18 yoshdan oshganlar. Bir kishi — bitta akkaunt. Taklif havolangizni boshqaga bermang.'] },
  { title: 'Qoidalar', body: [[
    'Niyatingiz haqiqiy bo‘lsin; soxta profil, spam va reklama taqiqlanadi.',
    'Intro faqat o‘zaro foyda uchun; rad javobini hurmat qiling, qayta-qayta yozmang.',
    'Boshqa a’zoning ochilgan kontaktini uning roziligisiz tarqatmang.',
    'Natija dalilini to‘g‘ri yozing — tasdiqlangan natijalar boshqalar ishonchiga ta’sir qiladi.',
  ]] },
  { title: 'Moderatsiya', body: ['Qoidabuzarlik haqidagi shikoyatlarni odam ko‘rib chiqadi. Jiddiy yoki takroriy buzilishda akkaunt to‘xtatilishi mumkin. Bloklash darhol ishlaydi.'] },
  { title: 'Javobgarlik', body: ['NIYAT odamlarni tanishtiradi, lekin a’zolar o‘rtasidagi kelishuvlar, to‘lovlar yoki natijalar uchun javobgar emas. Uchrashuv va hamkorlikda ehtiyot bo‘ling.'] },
  { title: 'O‘zgarishlar', body: ['Shartlar muhim o‘zgarsa, keyingi amalingizdan oldin qayta tasdiqlash so‘raladi.'] },
]

export function LegalPage({ kind }: { kind: LegalKind }) {
  const sections = kind === 'privacy' ? privacy : terms
  return (
    <main className="legal-page">
      <a className="link-button" href="/">← NIYAT’ga qaytish</a>
      <span className="kicker">Versiya {currentTermsVersion}</span>
      <h1>{kind === 'privacy' ? 'Maxfiylik siyosati' : 'Foydalanish shartlari'}</h1>
      <p className="legal-draft" role="note">Qoralama: ishga tushirishdan oldin yurist ko‘rib chiqishi va [kvadrat qavsdagi] joylar to‘ldirilishi kerak.</p>
      {sections.map(section => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.title === 'Saqlash muddatlari' && (
            <table>
              <thead><tr><th scope="col">Ma’lumot</th><th scope="col">Muddat</th></tr></thead>
              <tbody>{retention.map(([item, period]) => <tr key={item}><td>{item}</td><td>{period}</td></tr>)}</tbody>
            </table>
          )}
          {section.body.map((part, index) => Array.isArray(part)
            ? <ul key={index}>{part.map(item => <li key={item}>{item}</li>)}</ul>
            : <p key={index}>{part}</p>)}
        </section>
      ))}
      <p className="legal-footer">{kind === 'privacy' ? <a href={legalPaths.terms}>Foydalanish shartlari</a> : <a href={legalPaths.privacy}>Maxfiylik siyosati</a>}</p>
    </main>
  )
}
