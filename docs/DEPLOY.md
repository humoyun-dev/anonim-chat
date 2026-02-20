# Deploy (Docker + nginx-proxy + Let's Encrypt)

## 0) DNS va portlar
- Domen A-record: `DASHBOARD_DOMAIN` → server IP
- Firewall: 80 va 443 ochiq bo‘lsin

## 1) Serverda Docker
Docker va Docker Compose plugin o‘rnating.

## 2) Repo va `.env`

```bash
git clone <repo>
cd anonim-chat
cp .env.example .env
```

`.env` ichida:
- `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME`
- `DASHBOARD_DOMAIN` (masalan: `dashboard.example.com`)
- `LETSENCRYPT_EMAIL`
- `ADMIN_PASS`, `SESSION_SECRET`

## 3) Up

```bash
docker compose up -d --build
```

## 4) Tekshirish

```bash
docker compose ps
docker compose logs -f dashboard
docker compose logs -f bot
docker compose logs -f letsencrypt
```

## 5) Muhim tavsiyalar
- `ADMIN_PASS` va `SESSION_SECRET` ni albatta kuchli qiling.
- `bot/.env` dagi `PAY_SUPPORT_TEXT` ni to‘ldiring (`/paysupport` uchun).
- MongoDB ma’lumotlari `mongo_data` volume’da saqlanadi.

