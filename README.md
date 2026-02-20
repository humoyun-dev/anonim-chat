# Anonim Chat (Telegram bot + Admin Dashboard)

Bu loyiha 2 qismdan iborat:

- `bot/` — Telegram anonim chat boti (Node.js + `grammy`)
- `dashboard/` — Admin dashboard (Express + EJS + Socket.io)

## Asosiy imkoniyatlar

### Bot
- Owner uchun ` /getlink `: shaxsiy anonim link yaratadi.
- Anon foydalanuvchi link orqali kirib **text / media / sticker / custom emoji (premium emoji)** yuboradi.
- Owner xabarga inline tugma orqali **javob beradi**.
- Har bir anonim xabar tagida **“Kim yozganini ko‘rish (50⭐)”** tugmasi:
  - Owner 50 Telegram Stars to‘lasa, bot yozuvchini (ID, ism, username) ko‘rsatadi.
- Spam filter + rate limit (qotib qolmasligi uchun memory cleanup bilan).

### Dashboard
- ` /chat ` sahifa — chat-ga o‘xshash UI (sidebarlar bilan).
- Real-time: MongoDB’dagi yangi xabarlar kelishi bilan Socket.io orqali chat yangilanadi.
  - Agar MongoDB Change Streams mavjud bo‘lsa (Replica Set / Atlas) — haqiqiy realtime.
  - Aks holda polling fallback ishlaydi.

## Tez start (Docker + Nginx + Let's Encrypt) — Deploy uchun

1) `.env` tayyorlang:

```bash
cp .env.example .env
```

2) `.env` ichida quyidagilarni to‘ldiring:
- `TELEGRAM_BOT_TOKEN`
- `BOT_USERNAME`
- `DASHBOARD_DOMAIN` (masalan: `dashboard.example.com`)
- `LETSENCRYPT_EMAIL`
- `ADMIN_PASS`, `SESSION_SECRET`

3) Ishga tushiring:

```bash
docker compose up -d --build
```

4) Dashboard:
- Lokal: `http://localhost:3000`
- Deploy: `https://DASHBOARD_DOMAIN` (SSL avtomatik)

## Docker-siz (lokal o‘rnatish)

To‘liq qo‘llanma: `docs/INSTALL.md`

## Deploy qo‘llanma (VPS)

To‘liq qo‘llanma: `docs/DEPLOY.md`
