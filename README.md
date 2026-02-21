# 🕵️ Anonim Chat — Telegram Bot + Admin Dashboard

Telegram orqali **to'liq anonim** xabar almashinuv tizimi. Foydalanuvchilar shaxsiy anonim link orqali xabar yuboradi — yozuvchining kimligini bilmasdan. Barcha suhbatlar **Admin Dashboard**da real-time kuzatiladi.

---

## 🌟 Loyiha haqida

**Anonim Chat** — bu odamlar bir-biriga Telegram orqali **anonim** savol va xabar yuborishini ta'minlovchi tizim. Bu ASK.fm yoki NGL.link'ga o'xshash, lekin to'liq Telegram ichida ishlaydi.

### Qanday ishlaydi

1. **Owner** (ega) `/getlink` buyrug'i orqali o'ziga xos anonim link oladi
2. Shu linkni do'stlariga, obunachilarga yoki bio'siga qo'yadi
3. Istalgan kishi (**anonim foydalanuvchi**) link orqali kirib xabar yozadi
4. Owner xabarni oladi — **kimdan kelganini bilmaydi**
5. Owner javob bera oladi; anonim foydalanuvchi ham javobni ko'radi
6. Qo'shimcha: 50 Telegram Stars to'lab yozuvchining shaxsini ochish mumkin

---

## ✨ Xususiyatlar

### 🤖 Telegram Bot

| Xususiyat | Tavsif |
|-----------|--------|
| **Anonim xabar** | Matn, foto, video, stiker, voice, audio, video-note, hujjat — barcha media turlari |
| **Javob berish** | Owner inline tugma orqali anonim foydalanuvchiga javob yozadi |
| **Kimligini ochish** | 50 Telegram Stars to'lab anonim yozuvchining ID, ism va username'ini bilish mumkin |
| **Reaksiyalar** | Ikkala tomon ham xabarga emoji reaksiya qo'ya oladi — reaksiyalar bir-biriga ko'rinadi |
| **Ko'p til** | O'zbek 🇺🇿, Русский 🇷🇺, English 🇬🇧 — foydalanuvchi tili avtomatik aniqlanadi |
| **Spam himoya** | Rate limiting va spam so'zlar filtri |
| **Sessiya boshqaruvi** | Xabar yuborilgach sessiya avtomatik yopiladi; "Yana so'ra" tugmasi qayta ochadi |

### 📊 Admin Dashboard

| Xususiyat | Tavsif |
|-----------|--------|
| **Telegram-style chat** | Barcha suhbatlar Telegram'ga o'xshash interfeysdagi chat panelida ko'rsatiladi |
| **Real-time yangilanish** | Yangi xabar kelishi bilan sahifa yangilanmasdan chat yangilanadi (Socket.io) |
| **Media ko'rish** | Rasmlar, video, stiker, ovozli xabarlar to'g'ridan-to'g'ri dashboardda ko'rsatiladi |
| **Reaksiyalar** | Kimning qanday emoji qo'ygani (sender / recipient) dashboardda alohida ko'rinadi |
| **Foydalanuvchilar** | Barcha foydalanuvchilar ro'yxati, xabar tarixi, batafsil profil |
| **Analytics** | DAU / WAU / MAU, yangi foydalanuvchilar, retention rate, eng faol soatlar heatmapi |
| **HTTPS / SSL** | Let's Encrypt orqali avtomatik SSL sertifikat (Docker deploy'da) |

---

## 🏗️ Arxitektura

```
foydal. ──→ Bot (grammY) ──→ MongoDB ←── Dashboard (Express)
                               │                    │
                          Change Streams       Socket.io
                               └──────────────────→ Browser
```

**2 mustaqil servis, 1 MongoDB:**
- `bot/` — Telegram bot (grammY kutubxonasi)
- `dashboard/` — Admin web panel (Express, EJS, Socket.io)
- `shared/` — Ikkala servis uchun umumiy Mongoose modellari

---

## 🚀 O'rnatish (Docker yordamida)

### Talablar
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Telegram Bot Token ([BotFather](https://t.me/BotFather) orqali)

### 1. Repo clone qilish

```bash
git clone <repo-url>
cd anonim-chat
```

### 2. `.env` fayl tayyorlash

```bash
cp .env.example .env
```

`.env` ichida to'ldiring:

```env
# Bot
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
BOT_USERNAME=your_bot_username
REVEAL_STARS_COST=50
PAY_SUPPORT_TEXT=Yordam: @your_admin

# Dashboard
ADMIN_USER=admin
ADMIN_PASS=murakkab_parol
SESSION_SECRET=kamida-32-belgili-tasodifiy-satr

# Deploy (HTTPS uchun)
DASHBOARD_DOMAIN=dashboard.example.com
LETSENCRYPT_EMAIL=you@example.com

# Ixtiyoriy
COOKIE_SECURE=true
TRUST_PROXY=1
```

### 3. Ishga tushirish

```bash
docker compose up -d --build
```

### 4. Tekshirish

```bash
docker compose logs -f bot
docker compose logs -f dashboard
```

- **Lokal:** `http://localhost:3000`
- **Deploy:** `https://dashboard.example.com` (SSL avtomatik)

---

## 🔄 Reaksiyalar qanday ishlaydi

Telegram botga faqat 1 ta reaksiya kuzatishga ruxsat beradi. Tizim quyidagicha ishlaydi:

```
Owner xabarga 😂 bosadi
    └→ Bot anonim foydalanuvchining xabar nusxasiga ham 😂 qo'yadi

Anonim foydalanuvchi 🔥 bosadi
    └→ Bot ownerning xabar nusxasiga ham 🔥 qo'yadi
```

Har ikki tomon bir-birining reaksiyasini ko'radi. Dashboard'da ham ikkala reaksiya alohida ko'rsatiladi.

---

## 🗂️ Loyiha tuzilmasi

```
anonim-chat/
├── bot/                    # Telegram bot
│   ├── handlers/           # message, callback, reaction handlerlari
│   ├── lib/                # i18n, spam guard, room logic
│   └── locales/            # uz / ru / en tarjimalar
│
├── dashboard/              # Admin web panel
│   ├── routes/             # chat, users, analytics, tg-media proxy
│   ├── views/              # EJS shablonlar (Telegram-style dark UI)
│   ├── public/             # CSS + client JS (Socket.io)
│   └── services/           # realtime (Change Streams → Socket.io)
│
├── shared/
│   └── models/             # Message, User, Session, ConversationSummary
│
├── docker-compose.yml
├── docs/
│   ├── INSTALL.md          # Docker-siz o'rnatish
│   └── DEPLOY.md           # VPS deploy
└── .env
```

---

## 📱 Bot buyruqlari

| Buyruq | Tavsif |
|--------|--------|
| `/start` | Botni ishga tushirish |
| `/getlink` | Shaxsiy anonim link olish |
| `/lang` | Tilni o'zgartirish (uz / ru / en) |
| `/help` | Yordam |
| `/menu` | Asosiy menyu |
| `/userstats` | Shaxsiy statistika |
| `/cancel` | Joriy javob rejimini bekor qilish |
| `/paysupport` | To'lov bo'yicha yordam |

---

## 🔐 Xavfsizlik

- Dashboard faqat login/parol bilan kirish mumkin
- CSRF himoya va `helmet.js` HTTP sarlavhalari
- MongoDB ulanishi faqat ichki Docker tarmoqda (tashqari portga ochilmaydi)
- Media fayllar Telegram CDN'dan bot token orqali proksi qilinadi — token brauzerga chiqmaydi

---

## 🛠️ Texnologiyalar

| Qatlam | Texnologiya |
|--------|-------------|
| Bot | Node.js, [grammY](https://grammy.dev/) |
| Dashboard | Express.js, EJS, Socket.io |
| Ma'lumotlar bazasi | MongoDB 7 (Replica Set) |
| Realtime | MongoDB Change Streams → Socket.io |
| Deploy | Docker Compose, Nginx, Let's Encrypt |
| UI | Telegram-style dark theme (vanilla CSS + EJS) |

---

## 📖 Qo'shimcha hujjatlar

- [Docker-siz o'rnatish](docs/INSTALL.md)
- [VPS Deploy qo'llanmasi](docs/DEPLOY.md)

---

## 📄 Litsenziya

MIT
