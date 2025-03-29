# Anonim Chat

Anonim Chat — bu foydalanuvchilarga Telegram orqali anonim xabar almashish imkoniyatini beruvchi loyiha. Loyiha ikkita asosiy komponentdan iborat:

1. **Dashboard (Admin Panel)**: Foydalanuvchilar va anonim xabar almashishni real vaqt rejimida boshqarish uchun mo'ljallangan.
2. **Telegram Bot**: Anonim xabar almashish, spam filtrlash va sessiyalarni nazorat qilish funksiyalarini bajaradi.

## Loyihaning Tuzilishi

```
anonim-chat/
│-- dashboard/       # Admin panel
│   ├── models/      # Ma'lumotlar bazasi modellari
│   ├── routes/      # API yo‘nalishlari
│   ├── controllers/ # Logika va biznes qoidalar
│   ├── views/       # Frontend qismi (Agar mavjud bo'lsa)
│   ├── server.js    # Asosiy server fayli
│-- bot/             # Telegram bot
│   ├── handlers/    # Bot buyruqlari va xabarlarni boshqarish
│   ├── config/      # Konfiguratsiya fayllari
│   ├── bot.js       # Asosiy bot fayli
│-- .env             # Muhit o'zgaruvchilari
│-- package.json     # Loyihaga bog‘liq kutubxonalar
│-- README.md        # Hujjat
```

## Xususiyatlar

- **Anonim Xabar Yuborish**: Foydalanuvchilar o'z shaxsini oshkor qilmasdan xabar yuborishlari mumkin.
- **Spam Filtrlash**: Taqiqlangan so'zlar va xabar yuborish tezligini nazorat qilish orqali spam xabarlar filtrlanadi.
- **Sessiyalarni Boshqarish**: Har bir anonim foydalanuvchi va egasi o'rtasida alohida sessiyalar yaratiladi va boshqariladi.
- **Foydalanuvchi Ma'lumotlarini Saqlash**: Telegram foydalanuvchilarning ID, ismi, familiyasi va username kabi ma'lumotlari saqlanadi.
- **Xabarlar Tarixini Saqlash**: Yuborilgan barcha xabarlar tarixini saqlash imkoniyati mavjud.

## Texnologiyalar

- **Node.js** (Express.js) - Server va bot uchun
- **MongoDB** - Ma'lumotlar bazasi sifatida ishlatiladi
- **Mongoose** - MongoDB bilan ishlash uchun ODM kutubxonasi
- **Socket.io** - Real-time chat va admin panel uchun
- **node-telegram-bot-api** - Telegram botini yaratish va boshqarish uchun

## O'rnatish

### 1. Loyihani klonlash

```bash
git clone https://github.com/humoyun-dev/anonim-chat.git
cd anonim-chat
```

### 2. Muhit sozlamalari
`.env` faylini yaratib, quyidagi ma'lumotlarni kiriting:

```env
# Telegram bot sozlamalari
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username

# Ma'lumotlar bazasi
MONGODB_URI=your_mongodb_connection_uri

# Server sozlamalari
PORT=5000
```

### 3. Kerakli bog‘liqliklarni o‘rnatish

```bash
cd dashboard
npm install
cd ../bot
npm install
```

### 4. Loyihani ishga tushirish

#### Botni ishga tushirish
```bash
cd bot
node bot.js
```

#### Dashboardni ishga tushirish
```bash
cd dashboard
node server.js
```

## Buyruqlar va Foydalanish

### Telegram bot buyruqlari
- **/getlink** – Foydalanuvchi anonim xabar olish uchun havola yaratadi.
- **/start** – Foydalanuvchilar xabar yuborish uchun sessiya ochadi.
- **/userstats** – Foydalanuvchi statistikasini ko‘rsatadi.

### Admin Panel imkoniyatlari
- **Foydalanuvchilarni ko‘rish va boshqarish**
- **Xabarlarni real vaqt rejimida ko‘rish**
- **Spam filtri va taqiqlangan so‘zlar sozlamalari**

## Xavfsizlik va Maxfiylik
- **Spam Filtrlash**: Taqiqlangan so‘zlar va rate-limiting orqali botni spamdan himoya qilish.
- **Ma'lumotlarni Himoya Qilish**: Shaxsiy ma'lumotlar saqlanadi, lekin maxfiyligi ta'minlanadi.

## Hissa Qo‘shish
1. **Fork qiling**: Loyihani GitHub hisobingizga fork qiling.
2. **Branch yarating**: O‘zgarishlar uchun yangi branch yarating.
3. **O‘zgarishlar kiritib, commit qiling**.
4. **Pull request yuboring**.

## Litsenziya
Ushbu loyiha [MIT litsenziyasi](LICENSE) ostida tarqatiladi.

## Muallif
**Humoyun Dev** – [GitHub Profil](https://github.com/humoyun-dev)

