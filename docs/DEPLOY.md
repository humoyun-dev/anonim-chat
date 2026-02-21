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

> Important: run Docker Compose from this folder (where `docker-compose.yml` and `.env` are).
> If you run Compose from another directory, use `--env-file` explicitly.

`.env` ichida:
- `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME`
- `DASHBOARD_DOMAIN` (masalan: `dashboard.example.com`)
- `LETSENCRYPT_EMAIL`
- `ADMIN_PASS`, `SESSION_SECRET`

## 3) Up

```bash
docker compose --env-file .env up -d --build
```

## 4) Tekshirish

```bash
docker compose ps
docker compose logs -f dashboard
docker compose logs -f bot
docker compose logs -f mongo-init
docker compose logs -f letsencrypt
```

## 5) Muhim tavsiyalar
- `ADMIN_PASS` va `SESSION_SECRET` ni albatta kuchli qiling.
- `bot/.env` dagi `PAY_SUPPORT_TEXT` ni to‘ldiring (`/paysupport` uchun).
- MongoDB ma’lumotlari `mongo_data` volume’da saqlanadi.

> Note: `mongo-init` servis replica set’ni avtomatik ishga tushiradi (Change Streams / realtime uchun).
> Agar dashboard oldin polling fallback’ga tushib qolgan bo‘lsa, `docker compose restart dashboard` qiling.
