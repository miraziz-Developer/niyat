# NIYAT’ni serverga chiqarish

Bitta buyruq serverni to‘liq tayyorlaydi: Docker’ni o‘rnatadi (bo‘lmasa), `.env` ni yaratadi, image’larni build qiladi, bazani migratsiya qiladi, API, web va HTTPS’ni (Caddy, Let’s Encrypt) ishga tushiradi, adminni taklif qiladi, kunlik backup’ni cron’ga qo‘shadi va hammasi ishlayotganini tekshiradi. Qayta ishga tushirish xavfsiz: yangilash ham xuddi shu buyruq.

## 1. Kerakli narsalar

| Nima | Talab |
| --- | --- |
| Server | Ubuntu 22.04+/Debian 12+, kamida 1 vCPU, **2 GB RAM** (build uchun), 10 GB disk |
| Domen | Masalan `niyat.uz`. DNS’da **A-yozuv** → server IP (sub-domen ham bo‘ladi: `app.niyat.uz`) |
| Portlar | 22 (SSH), 80 va 443 (HTTP/HTTPS) ochiq |
| Email | [resend.com](https://resend.com) hisobi, domen tasdiqlangan, API kaliti (`re_...`) |
| Git | `sudo apt-get install -y git` |

Docker o‘rnatilmagan bo‘lsa script uni rasmiy `get.docker.com` orqali o‘zi o‘rnatadi.

## 2. Ishga tushirish (bitta buyruq)

```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw --force enable

git clone https://github.com/miraziz-Developer/niyat.git /srv/niyat
cd /srv/niyat
./scripts/server-up.sh --domain niyat.uz --email siz@gmail.com --resend-key re_xxxxxxxx
```

Tugagach script `https://niyat.uz/v1/ready` ni tekshiradi va keyingi qadamlarni chiqaradi. Brauzerda domenni oching → emailingizni kiriting → kelgan havolani bosing → 18+ va shartlarni tasdiqlab profil yarating.

Parametrsiz `./scripts/server-up.sh` terminalda savollar beradi (domen, admin email, Resend kaliti). Hammasini bo‘sh qoldirsangiz **sinov rejimi** ishga tushadi: `http://SERVER_IP:8080`, parolsiz demo foydalanuvchi bilan. Bu rejimni internetga ochiq qoldirmang.

### Resend kaliti hali yo‘q bo‘lsa

`--resend-key` ni tashlab ketsangiz ham sayt HTTPS bilan ishlaydi, lekin xat yuborilmaydi — kirish havolasi API logiga yoziladi:

```bash
docker compose logs api | grep login_token
```

Kalit tayyor bo‘lganda: `./scripts/server-up.sh --resend-key re_xxx` (qolgan sozlamalar `.env` dan olinadi, rejim avtomatik `production`ga o‘tadi).

### Resend sozlash

1. resend.com → **Domains** → domeningizni qo‘shing, ko‘rsatilgan DNS yozuvlarini (SPF/DKIM) qo‘ying va tasdiqlanishini kuting.
2. **API Keys** → “Sending access” bilan kalit yarating.
3. Jo‘natuvchi shu domendan bo‘lishi shart. Default: `NIYAT <kirish@DOMEN>`; boshqasi kerak bo‘lsa `--mail-from "NIYAT <salom@niyat.uz>"`.

## 3. `.env` — hamma o‘zgaruvchilar

Script `.env` ni o‘zi yaratadi (`chmod 600`) va qayta ishga tushganda mavjud qiymatlarni (ayniqsa parollarni) saqlab qoladi. Qo‘lda o‘zgartirgandan keyin `./scripts/server-up.sh` ni qayta ishga tushiring — `VITE_*` qiymatlari frontend build’iga yoziladi.

**Majburiy** ustuni: ✅ — har doim; 🌐 — domen bilan haqiqiy ishga tushirishda; — — ixtiyoriy. “Avto” — script o‘zi to‘ldiradi.

### Baza

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `POSTGRES_DB` | ✅ | Baza nomi | `niyat` (avto) |
| `POSTGRES_USER` | ✅ | Jadval egasi; faqat migratsiya, backup va admin skriptlari ishlatadi | `niyat` (avto) |
| `POSTGRES_PASSWORD` | ✅ | Egasining paroli | tasodifiy 48 belgi (avto) — **o‘zgartirmang**, baza shu bilan yaratilgan |
| `NIYAT_APP_DB_USER` | ✅ | API ulanadigan cheklangan rol (RLS majburiy, DDL yo‘q) | `niyat_app` (avto) |
| `NIYAT_APP_DB_PASSWORD` | ✅ | Shu rolning paroli; har migratsiyada qayta o‘rnatiladi | tasodifiy (avto) |
| `DATABASE_POOL_SIZE` | — | API’ning bazaga ulanishlar soni | `10` |
| `NIYAT_POSTGRES_PORT` | — | Baza faqat `127.0.0.1` da shu portda (SSH tunnel uchun) | `55432` |
| `NIYAT_BACKUP_KEEP` | — | Nechta oxirgi backup saqlanadi | `14` |

### Tarmoq

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `NIYAT_DOMAIN` | 🌐 | Caddy shu domen uchun HTTPS sertifikat oladi | `niyat.uz` |
| `APP_ORIGIN` | 🌐 | Brauzer ochadigan manzil: xatlardagi havolalar va Origin tekshiruvi. Production’da `https://` majburiy | `https://niyat.uz` (avto) |
| `COMPOSE_PROFILES` | 🌐 | `https` bo‘lsa Caddy konteyneri ham ishga tushadi | `https` (avto, domen bilan) |
| `NIYAT_HTTP_PORT` | — | Web konteyner porti | `8080` |
| `NIYAT_HTTP_BIND` | — | Web port qaysi interfeysda ochiladi. Domen bilan `127.0.0.1` (faqat Caddy orqali), sinovda `0.0.0.0` | avto |

### Kirish va email

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `AUTH_MODE` | ✅ | `email` — taklif asosidagi magic link; `local` — demo auto-login (faqat sinov, production’da rad etiladi) | domen bilan `email`, aks holda `local` |
| `NIYAT_NODE_ENV` | ✅ | `production` — Secure cookie, qat’iy konfiguratsiya tekshiruvi, RLS’ni chetlab o‘tuvchi rol bilan ishga tushmaydi | Resend kaliti bo‘lsa `production`, aks holda `development` |
| `RESEND_API_KEY` | 🌐 | Kirish havolalari va bildirishnomalarni yuborish. **Hech qachon git’ga qo‘ymang** | `re_...` |
| `MAIL_FROM` | 🌐 | Jo‘natuvchi, Resend’da tasdiqlangan domendan | `"NIYAT <kirish@niyat.uz>"` (avto) |
| `NIYAT_ADMIN_EMAIL` | — | Birinchi ishga tushirishda avtomatik taklif qilinadi | `siz@gmail.com` |
| `VITE_DEV_USER_ID` | — | Faqat `local` rejim: brauzer qaysi demo foydalanuvchi bo‘lib kiradi. `email` rejimda **bo‘sh** bo‘lishi shart | domen bilan bo‘sh (avto) |
| `VITE_CONTACT_EMAIL` | — | `/maxfiylik` sahifasidagi maxfiylik va o‘chirish so‘rovlari uchun email | admin emaili (avto) |

Namuna: [`.env.example`](.env.example).

## 4. Birinchi kundan keyin

Hamma admin buyruqlari server papkasida (`cd /srv/niyat`) bajariladi:

```bash
# Moderator tayinlash (odam avval bir marta kirgan bo‘lishi kerak)
docker compose run --rm migrate npm run staff -- --grant moderator siz@gmail.com

# Odamlarni taklif qilish / ro‘yxat / bekor qilish
docker compose run --rm migrate npm run invite -- aziza@example.uz bobur@example.uz
docker compose run --rm migrate npm run invite -- --list
docker compose run --rm migrate npm run invite -- --revoke bobur@example.uz

# Gate 2 ko‘rsatkichlari (oxirgi 30 kun)
docker compose run --rm migrate npm run metrics -- 30
```

Moderator saytda **Moderatsiya** bo‘limini ko‘radi: shikoyatlar navbati, izohlar, a’zoni to‘xtatish.

## 5. Backup va tiklash

Domen bilan ishga tushirilganda script har kuni 03:15 da backup oladigan cron qatorini qo‘shadi (`crontab -l` bilan ko‘ring). Backup’lar `.local/backups/` da, har biri tekshiriladi, oxirgi `NIYAT_BACKUP_KEEP` tasi saqlanadi.

```bash
./scripts/backup.sh                                        # qo‘lda
./scripts/restore.sh .local/backups/niyat-20260927T031500Z.dump   # tiklash (tasdiq so‘raydi, API’ni vaqtincha to‘xtatadi)
```

Backup’ni boshqa joyga ham ko‘chiring (masalan, `rsync` yoki `rclone` bilan) — server diski yo‘qolsa, u ham yo‘qoladi. Cron Docker’ga `sudo` siz kira oladigan foydalanuvchida ishlashi kerak (root yoki `docker` guruhi a’zosi).

## 6. Yangilash

```bash
cd /srv/niyat
git pull
./scripts/server-up.sh
```

Yangi migratsiyalar avtomatik qo‘llanadi, `.env` saqlanadi, konteynerlar qayta build qilinadi. Katta yangilanishdan oldin `./scripts/backup.sh`.

## 7. Muammolar

| Belgi | Tekshirish |
| --- | --- |
| Umuman ochilmayapti | `docker compose ps` — hammasi `healthy`mi? `docker compose logs --tail=100 api web caddy` |
| HTTPS sertifikati yo‘q | `dig +short niyat.uz` server IP’sini qaytaradimi? 80/443 ochiqmi? `docker compose logs caddy` |
| Xat kelmayapti | `docker compose logs api \| grep -i mail`; Resend’da domen tasdiqlanganmi; `MAIL_FROM` shu domendanmi; spam papkasi |
| “Havola eskirgan” | Havola 15 daqiqa va bir marta ishlaydi — qaytadan so‘rang |
| Kirish havolasi so‘raldi, lekin xat yo‘q | Email taklif qilinganmi? `npm run invite -- --list`. Javob ataylab bir xil — kim ro‘yxatda ekanini oshkor qilmaydi |
| API ishga tushmayapti | `docker compose logs api` — konfiguratsiya xatosi aniq yozilgan (masalan, production’da `https` bo‘lmagan `APP_ORIGIN`) |
| Holat | `curl -s https://niyat.uz/v1/ready` → `{"status":"ready"}` |

To‘liq to‘xtatish: `docker compose down` (ma’lumotlar `.local/` da qoladi).

## 8. Xavfsizlik eslatmalari

- `.env` faqat serverda; git’ga qo‘shilmaydi (`.gitignore`). Kalit oshkor bo‘lsa Resend’da darhol almashtiring.
- PostgreSQL internetga ochilmaydi (faqat `127.0.0.1` va ichki Docker tarmog‘i). Domen rejimida web port ham faqat `127.0.0.1` da — tashqaridan faqat Caddy (80/443).
- API bazaga RLS’ni chetlab o‘ta olmaydigan `niyat_app` roli bilan ulanadi; production’da boshqacha bo‘lsa ishga tushmaydi.
- Sinov rejimi (`AUTH_MODE=local`) har kimni demo foydalanuvchi qilib kiritadi — uni ochiq internetda qoldirmang.
- SSH’ni kalit bilan kirishga o‘tkazing va parolli kirishni o‘chiring.
