# NIYAT’ni serverga chiqarish

Bitta buyruq serverni to‘liq tayyorlaydi:
- **Himoya:** firewall, avtomatik xavfsizlik yangilanishlari, fail2ban.
- **Docker:** o‘rnatilmagan bo‘lsa, o‘zi o‘rnatadi.
- **`.env`:** tasodifiy parollar bilan yaratiladi.
- **Build va baza:** image’lar build qilinadi, baza migratsiya qilinadi.
- **Ishga tushirish:** API, web va HTTPS (Caddy, Let’s Encrypt).
- **Admin:** siz birinchi taklifni avtomatik olasiz.
- **Cron:** kunlik backup (xohlasangiz, server tashqarisiga nusxa bilan) va har 5 daqiqalik monitoring, muammo bo‘lsa email ogohlantirish.
- **Tekshiruv:** oxirida hammasi ishlayotgani tekshiriladi.

Qayta ishga tushirish xavfsiz: yangilash ham xuddi shu buyruq bilan qilinadi.

> Bu jarayon Docker’da to‘liq sinovdan o‘tgan:
> - toza o‘rnatish, sinov rejimi va domen rejimi (Caddy HTTPS, HTTP→HTTPS, HSTS);
> - magic-link bilan kirish, brauzerda onboarding;
> - production rejimi;
> - backup, tiklash va tashqi nusxa;
> - ogohlantirish xatlari, cron’lar va himoya skripti (Ubuntu 24.04).
>
> Haqiqiy Let’s Encrypt sertifikati va Resend orqali haqiqiy xat faqat sizning serveringiz va domeningizda tekshiriladi.

## 1. Kerakli narsalar

| Nima | Talab |
| --- | --- |
| Server | **Ubuntu 22.04/24.04** yoki Debian 12. Kamida 1 vCPU, **2 GB RAM** (build uchun) va 20 GB disk |
| Domen | Masalan `niyat.uz`. DNS’da **A-yozuv** server IP’siga qarashi kerak (`app.niyat.uz` kabi sub-domen ham bo‘ladi) |
| Portlar | Hosting panelida (security group) 22, 80 va 443 ochiq bo‘lsin |
| Email | [resend.com](https://resend.com) hisobi, tasdiqlangan domen va API kaliti (`re_...`) |
| Git | `apt-get install -y git` |

Hamma buyruqlarni **root** sifatida bajaring (`sudo -i`). Shunda Docker, cron va backup bitta hisobda ishlaydi.

## 2. Ishga tushirish (bitta buyruq)

```bash
sudo -i
git clone https://github.com/miraziz-Developer/niyat.git /srv/niyat
cd /srv/niyat
./scripts/server-up.sh \
  --domain niyat.uz \
  --email siz@gmail.com \
  --resend-key re_xxxxxxxx \
  --operator "Ism Familiya"
```

Tugagach script `https://niyat.uz/v1/ready` ni tekshiradi va keyingi qadamlarni chiqaradi:

1. Brauzerda domenni oching, emailingizni kiriting va kelgan havolani bosing.
2. 18+ va shartlarni tasdiqlab, profil yarating.
3. O‘zingizni moderator qiling (4-bo‘lim).
4. `./scripts/healthcheck.sh --test` ni ishga tushiring: ogohlantirish xati kelishi kerak.

Parametrsiz `./scripts/server-up.sh` terminalda savollar beradi: domen, admin email va Resend kaliti. Hammasini bo‘sh qoldirsangiz **sinov rejimi** ishga tushadi: `http://SERVER_IP:8080`, parolsiz demo foydalanuvchi bilan. Bu rejimni internetga ochiq qoldirmang.

### Barcha parametrlar

| Parametr | Nima qiladi |
| --- | --- |
| `--domain DOMEN` | HTTPS va taklif asosidagi email kirishni yoqadi |
| `--email EMAIL` | Admin: birinchi taklif, ogohlantirishlar va maxfiylik sahifasidagi aloqa uchun default |
| `--resend-key KALIT` | Xatlarni yuborishni yoqadi va rejimni `production`ga o‘tkazadi |
| `--mail-from "NIYAT <a@domen>"` | Jo‘natuvchini belgilaydi (default: `NIYAT <kirish@DOMEN>`) |
| `--contact EMAIL` | Maxfiylik sahifasidagi aloqa emaili (default: admin emaili) |
| `--operator "NOM"` | Ma’lumot uchun mas’ul shaxs yoki tashkilot. Maxfiylik sahifasida ko‘rsatiladi |
| `--alert-email EMAIL` | Ogohlantirishlar boshqa manzilga borsin desangiz |
| `--backup-remote REMOTE` | Backup nusxasini server tashqarisiga yuboradi (5-bo‘lim) |
| `--ssh-keys-only` | SSH’ga parol bilan kirishni o‘chiradi. Faqat serverda SSH kalitingiz bo‘lsa ishlaydi |
| `--no-harden` | Firewall, avto-yangilanish va fail2ban bosqichini o‘tkazib yuboradi |
| `--env-only` | Faqat `.env` ni yozadi, Docker’ga tegmaydi |

Parametrlar `.env` ga yoziladi. Keyingi ishga tushirishlarda ularni qayta berish shart emas.

### Resend sozlash

1. resend.com → **Domains** bo‘limida domeningizni qo‘shing. Ko‘rsatilgan DNS yozuvlarini (SPF, DKIM) qo‘ying va “Verified” bo‘lishini kuting. Busiz xatlar spamga tushadi.
2. **API Keys** bo‘limida “Sending access” bilan kalit yarating.
3. Jo‘natuvchi shu domendan bo‘lishi shart.

Kalit hali yo‘q bo‘lsa, `--resend-key` siz ham sayt HTTPS bilan ishlaydi, faqat kirish havolasi xatga emas, API logiga yoziladi: `docker compose logs api | grep login_token`. Kalit tayyor bo‘lganda `./scripts/server-up.sh --resend-key re_xxx` ni ishga tushiring.

## 3. `.env` — hamma o‘zgaruvchilar

Script `.env` ni o‘zi yaratadi (`chmod 600`). Qayta ishga tushganda mavjud qiymatlar, ayniqsa parollar, saqlanib qoladi. `.env` ni qo‘lda o‘zgartirgandan keyin `./scripts/server-up.sh` ni qayta ishga tushiring, chunki `VITE_*` qiymatlari frontend build’iga yoziladi.

**Majburiy** ustuni belgilari:
- ✅ — har doim kerak;
- 🌐 — domen bilan haqiqiy ishga tushirishda kerak;
- — — ixtiyoriy.

“Avto” — qiymatni script o‘zi to‘ldiradi.

### Baza va backup

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `POSTGRES_DB` | ✅ | Baza nomi | `niyat` (avto) |
| `POSTGRES_USER` | ✅ | Jadval egasi. Uni faqat migratsiya, backup va admin skriptlari ishlatadi | `niyat` (avto) |
| `POSTGRES_PASSWORD` | ✅ | Egasining paroli | tasodifiy (avto). **O‘zgartirmang**: baza shu parol bilan yaratilgan |
| `NIYAT_APP_DB_USER` | ✅ | API ulanadigan cheklangan rol (RLS majburiy, DDL yo‘q) | `niyat_app` (avto) |
| `NIYAT_APP_DB_PASSWORD` | ✅ | Shu rolning paroli. Har migratsiyada qayta o‘rnatiladi | tasodifiy (avto) |
| `DATABASE_POOL_SIZE` | — | API’ning bazaga ulanishlar soni | `10` |
| `NIYAT_POSTGRES_PORT` | — | Baza faqat `127.0.0.1` da, shu portda ochiq (SSH tunnel uchun) | `55432` |
| `NIYAT_BACKUP_KEEP` | — | Serverda nechta oxirgi backup saqlanadi | `14` |
| `NIYAT_BACKUP_REMOTE` | tavsiya | Backup nusxasi uchun rclone manzili | `b2:niyat-backups` |
| `NIYAT_BACKUP_REMOTE_DAYS` | — | Tashqi nusxalar necha kun saqlanadi | `30` |

### Tarmoq

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `NIYAT_DOMAIN` | 🌐 | Caddy shu domen uchun HTTPS sertifikat oladi | `niyat.uz` |
| `APP_ORIGIN` | 🌐 | Brauzer ochadigan manzil. Xatlardagi havolalar va Origin tekshiruvi shunga tayanadi. Production’da `https://` majburiy | `https://niyat.uz` (avto) |
| `COMPOSE_PROFILES` | 🌐 | `https` bo‘lsa, Caddy konteyneri ham ishga tushadi | `https` (avto, domen bilan) |
| `NIYAT_HTTP_PORT` | — | Web konteyner porti | `8080` |
| `NIYAT_HTTP_BIND` | — | Web port qaysi interfeysda ochiladi. Domen bilan `127.0.0.1` (faqat Caddy orqali), sinovda `0.0.0.0` | avto |

### Kirish, email va sahifalar

| O‘zgaruvchi | Majburiy | Nima uchun | Default / misol |
| --- | --- | --- | --- |
| `AUTH_MODE` | ✅ | `email` — taklif asosidagi magic link. `local` — demo auto-login, faqat sinov uchun (production’da rad etiladi) | domen bilan `email`, aks holda `local` |
| `NIYAT_NODE_ENV` | ✅ | `production`: Secure cookie, qat’iy konfiguratsiya tekshiruvi; RLS’ni chetlab o‘tuvchi rol bilan API ishga tushmaydi | Resend kaliti bo‘lsa `production`, aks holda `development` |
| `RESEND_API_KEY` | 🌐 | Kirish havolalari, bildirishnomalar va ogohlantirishlarni yuboradi. **Hech qachon git’ga qo‘ymang** | `re_...` |
| `MAIL_FROM` | 🌐 | Jo‘natuvchi. Resend’da tasdiqlangan domendan bo‘lishi shart | `"NIYAT <kirish@niyat.uz>"` (avto) |
| `NIYAT_ADMIN_EMAIL` | — | Birinchi ishga tushirishda avtomatik taklif qilinadi | `siz@gmail.com` |
| `VITE_DEV_USER_ID` | — | Faqat `local` rejimda: brauzer qaysi demo foydalanuvchi bo‘lib kiradi. `email` rejimda **bo‘sh** bo‘lishi shart | domen bilan bo‘sh (avto) |
| `VITE_CONTACT_EMAIL` | tavsiya | `/maxfiylik` sahifasida maxfiylik va o‘chirish so‘rovlari uchun email | admin emaili (avto) |
| `VITE_OPERATOR_NAME` | tavsiya | Ma’lumot uchun mas’ul shaxs yoki tashkilot. `/maxfiylik` sahifasida ko‘rsatiladi | `NIYAT private alpha jamoasi` |

### Monitoring

| O‘zgaruvchi | Majburiy | Nima uchun | Default |
| --- | --- | --- | --- |
| `NIYAT_ALERT_EMAIL` | — | Ogohlantirishlar qayerga borsin | `NIYAT_ADMIN_EMAIL` |
| `NIYAT_ALERT_5XX` | — | 5 daqiqada nechta server xatosi bo‘lganda ogohlantirilsin | `5` |
| `NIYAT_ALERT_DISK_PERCENT` | — | Disk necha foiz to‘lganda ogohlantirilsin | `90` |
| `NIYAT_ALERT_REPEAT_HOURS` | — | Muammo davom etsa, necha soatda qayta eslatilsin | `6` |

Namuna: [`.env.example`](.env.example).

## 4. Kundalik boshqaruv

Hamma buyruqlar `cd /srv/niyat` ichida bajariladi:

```bash
# Moderator tayinlash (odam avval bir marta kirgan bo‘lishi kerak)
docker compose run --rm migrate npm run staff -- --grant moderator siz@gmail.com
docker compose run --rm migrate npm run staff -- --list

# Odamlarni taklif qilish, ro‘yxatni ko‘rish, taklifni bekor qilish
docker compose run --rm migrate npm run invite -- aziza@example.uz bobur@example.uz
docker compose run --rm migrate npm run invite -- --list
docker compose run --rm migrate npm run invite -- --revoke bobur@example.uz

# Gate 2 ko‘rsatkichlari (oxirgi 30 kun) — har hafta ko‘rib turing
docker compose run --rm migrate npm run metrics -- 30
```

Moderator saytda **Moderatsiya** bo‘limini ko‘radi: shikoyatlar navbati, izohlar va a’zoni to‘xtatish. To‘xtatilgan a’zoning sessiyalari darhol yopiladi.

## 5. Backup va tiklash

Domen rejimida har kuni soat 03:15 da backup olinadi (cron’ni `crontab -l` bilan ko‘ring). Backup’lar `.local/backups/` papkasida turadi. Har biri `pg_restore` bilan tekshiriladi va oxirgi `NIYAT_BACKUP_KEEP` tasi saqlanadi.

```bash
./scripts/backup.sh                                                  # qo‘lda backup
./scripts/restore.sh .local/backups/niyat-20260927T031500Z.dump      # tiklash (tasdiq so‘raydi, API’ni vaqtincha to‘xtatadi)
```

### Server tashqarisiga nusxa (tavsiya)

Server diski yo‘qolsa, undagi backup’lar ham yo‘qoladi. Buning oldini olish uchun backup’ni tashqi xotiraga ham yuboring. Masalan, Backblaze B2 (10 GB bepul), Cloudflare R2 yoki istalgan S3:

```bash
apt-get install -y rclone
rclone config                      # yangi remote, masalan nomi "b2", turi Backblaze B2, kalitlarni kiriting
rclone mkdir b2:niyat-backups      # bucket
./scripts/server-up.sh --backup-remote b2:niyat-backups
./scripts/backup.sh                # birinchi nusxani hozir yuborib tekshiring
rclone ls b2:niyat-backups
```

Shundan keyin har bir kunlik backup tashqariga ham ko‘chiriladi. 30 kundan eski tashqi nusxalar o‘chiriladi. Ko‘chirish muvaffaqiyatsiz bo‘lsa, lokal backup saqlanib qoladi va monitoring email yuboradi.

Boshqa serverda tiklash uchun `rclone copy b2:niyat-backups/niyat-....dump .local/backups/` ni bajaring, keyin `./scripts/restore.sh`.

Oyiga bir marta tiklashni mashq qilib ko‘ring (bo‘sh sinov serverida).

## 6. Monitoring va ogohlantirishlar

`scripts/healthcheck.sh` har 5 daqiqada quyidagilarni tekshiradi:
- `/v1/ready` lokal va HTTPS orqali javob beradimi;
- so‘nggi 5 daqiqadagi server xatolari (5xx);
- disk qancha to‘lgan;
- oxirgi backup yoshi (26 soatdan oshmasligi kerak);
- tashqi nusxa muvaffaqiyatli bo‘lganmi.

Muammo paydo bo‘lganda Resend orqali email keladi. Muammo davom etsa, har 6 soatda eslatadi. Tuzalganda “tiklandi” xati keladi. Log: `.local/health.log`.

```bash
./scripts/healthcheck.sh --test    # email yetib borishini sinash
./scripts/healthcheck.sh           # hozirgi holat (muammo bo‘lsa, chiqish kodi 1)
```

Qo‘shimcha himoya sifatida tashqi kuzatuvchi qo‘ying. Server butunlay o‘chib qolsa, ichki tekshiruv ham to‘xtaydi. [UptimeRobot](https://uptimerobot.com)’da bepul “HTTP(s)” monitor yarating: manzil `https://DOMEN/v1/ready`, interval 5 daqiqa.

## 7. Server himoyasi

Domen rejimida `scripts/harden.sh` avtomatik ishlaydi. Uni qayta ishga tushirish xavfsiz: `sudo ./scripts/harden.sh`. U quyidagilarni sozlaydi:
- **ufw firewall:** faqat SSH (sshd haqiqatda tinglayotgan port), 80 va 443 ochiq qoladi. PostgreSQL va 8080 porti faqat `127.0.0.1` da ishlaydi.
- **unattended-upgrades:** xavfsizlik yangilanishlari har kuni avtomatik o‘rnatiladi.
- **fail2ban:** SSH’ga 10 daqiqada 5 marta xato urinish qilgan IP 1 soatga bloklanadi.
- **cron:** backup va monitoring uchun.

SSH’ni faqat kalit bilan kirishga o‘tkazish:

```bash
# o‘z kompyuteringizda:
ssh-copy-id root@SERVER_IP
# serverda:
sudo ./scripts/harden.sh --ssh-keys-only
```

`authorized_keys` faylida kalit bo‘lmasa, script parolli kirishni o‘chirmaydi: shu tariqa o‘zingizni qulflab qo‘yishdan himoyalaydi. O‘zgarishdan keyin joriy oynani yopmasdan, yangi oynada kalit bilan kirib ko‘ring.

## 8. Yangilash

```bash
cd /srv/niyat
./scripts/backup.sh
git pull
./scripts/server-up.sh
```

Yangi migratsiyalar avtomatik qo‘llanadi, `.env` saqlanib qoladi va konteynerlar qayta build qilinadi. Yangilash paytidagi uzilish odatda 10–30 soniya davom etadi.

## 9. Muammolar

| Belgi | Tekshirish |
| --- | --- |
| Umuman ochilmayapti | `docker compose ps` — hammasi `healthy`mi? So‘ng `docker compose logs --tail=100 api web caddy` |
| HTTPS sertifikati yo‘q | `dig +short niyat.uz` server IP’sini qaytaradimi? Hosting panelida 80/443 ochiqmi? `docker compose logs caddy` |
| Xat kelmayapti | `docker compose logs api \| grep -i mail`. Resend’da domen “Verified”mi? `MAIL_FROM` shu domendanmi? Spam papkasini ham ko‘ring |
| “Havola eskirgan” | Havola 15 daqiqa amal qiladi va faqat bir marta ishlaydi. Qaytadan so‘rang |
| Havola so‘raldi, lekin xat yo‘q | Email taklif qilinganmi? `npm run invite -- --list`. Javob ataylab doim bir xil: kim ro‘yxatda ekanini oshkor qilmaydi |
| API ishga tushmayapti | `docker compose logs api` — konfiguratsiya xatosi aniq yozilgan bo‘ladi (masalan, production’da `https` bo‘lmagan `APP_ORIGIN`) |
| Ogohlantirish xati kelmayapti | `./scripts/healthcheck.sh --test`; `tail .local/health.log`; `crontab -l` |
| Build “Too Many Requests” (429) | Docker Hub cheklovi. Bir necha daqiqa kuting yoki `docker login` qiling |
| Disk to‘lib qoldi | `docker image prune -f`, `docker builder prune -f` |

To‘liq to‘xtatish: `docker compose down`. Ma’lumotlar `.local/` papkasida qoladi.

## 10. Xavfsizlik hodisasi (incident) bo‘yicha yo‘riqnoma

Mas’ul shaxs `VITE_OPERATOR_NAME` da ko‘rsatilgan odam. Ma’lumot sizib chiqqan deb gumon qilsangiz, quyidagilarni bajaring:

1. **To‘xtating.** Muammoli a’zoni moderatsiya panelida to‘xtating. Kerak bo‘lsa, butun saytni to‘xtating: `docker compose stop web caddy`.
2. **Dalilni saqlang.** Keyinroq tahlil qilish uchun:
   ```bash
   docker compose logs --since 72h > incident-$(date +%F).log
   ./scripts/backup.sh
   ```
3. **Kalitlarni almashtiring.**
   - Resend’da yangi API kalit yarating va `./scripts/server-up.sh --resend-key re_new` ni ishga tushiring.
   - Hamma sessiyalarni yopish uchun:
     ```bash
     docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "update sessions set revoked_at = now() where revoked_at is null"'
     ```
   - Server paroli yoki SSH kaliti oshkor bo‘lgan bo‘lsa, ularni ham almashtiring.
4. **Xabar bering.** 72 soat ichida ta’sirlangan a’zolarga email bilan xabar bering: nima bo‘ldi, qaysi ma’lumotlar, nima qildingiz va ular nima qilishi kerak. Bu va’da `/maxfiylik` sahifasida berilgan.
5. **Tuzating va yozib qo‘ying.** Sababini bartaraf qiling, keyin `git pull && ./scripts/server-up.sh`. Qisqa hisobot yozing: vaqt, sabab, ta’sir va choralar.

## 11. Ishga tushirishdan oldingi ro‘yxat

**Kodda tayyor:**
- taklif asosidagi kirish va 18+/shartlar roziligi;
- matching va intro’lar;
- bloklash, shikoyat qilish va moderatsiya;
- bildirishnomalar va ko‘rsatkichlar;
- backup, tashqi nusxa va tiklash;
- monitoring, himoya va HTTPS.

**Siz qiladigan ishlar:**

- [ ] Domen A-yozuvini server IP’siga qo‘ying
- [ ] Resend’da domenni tasdiqlang (SPF/DKIM) va kalit oling
- [ ] `server-up.sh` ni `--domain --email --resend-key --operator` bilan ishga tushiring
- [ ] Kirib, profil yarating va o‘zingizni moderator qiling
- [ ] `./scripts/healthcheck.sh --test` bilan ogohlantirish xati kelishini tekshiring
- [ ] rclone bilan tashqi backup’ni sozlang (`--backup-remote`) va bir marta tiklashni mashq qiling
- [ ] UptimeRobot monitorini qo‘ying
- [ ] SSH kalitini qo‘shib, `--ssh-keys-only` ni ishga tushiring
- [ ] `/maxfiylik` va `/shartlar` matnlarini yuristga ko‘rsating
- [ ] 30–50 kishini taklif qiling va `npm run metrics` ni har hafta kuzating
