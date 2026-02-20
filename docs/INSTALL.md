# Lokal o‘rnatish (Docker-siz)

## Talablar
- Node.js 20+
- MongoDB (lokal yoki Atlas)

> Eslatma: Dashboard realtime uchun MongoDB Change Streams ishlatadi. Standalone MongoDB’da Change Streams bo‘lmasa ham dashboard polling fallback orqali ishlaydi.

## 1) Repo

```bash
git clone <repo>
cd anonim-chat
```

## 2) Bot sozlash (`bot/.env`)

`bot/.env` yarating:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/anonim_chat
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
BOT_USERNAME=your_bot_username
REVEAL_STARS_COST=50
PAY_SUPPORT_TEXT=To'lov bo'yicha yordam: @your_admin
```

Botni ishga tushirish:

```bash
cd bot
npm install
npm run start
```

## 3) Dashboard sozlash (`dashboard/.env`)

`dashboard/.env` yarating:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/anonim_chat
SESSION_SECRET=change-me-long-random
ADMIN_USER=admin
ADMIN_PASS=change-me
PORT=3000
```

Dashboard:

```bash
cd dashboard
npm install
npm run start
```

Brauzer: `http://localhost:3000`

