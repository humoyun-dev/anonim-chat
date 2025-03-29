# Anonymous Chat Platform

Anonymous Chat is a Telegram bot and a web-based dashboard that allows users to send and receive anonymous messages securely. The system consists of two main components:

- **Telegram Bot** (handles anonymous messaging and user interactions)
- **Admin Dashboard** (manages users, messages, and sessions in real-time)

## Features

### Telegram Bot
- Generates a unique anonymous chat link for each user.
- Enables anonymous users to send messages without revealing their identity.
- Supports real-time message forwarding between anonymous users and chat owners.
- Implements spam filtering and rate limiting.
- Tracks user activity and provides statistics.

### Admin Dashboard
- Provides an intuitive web interface to manage users and messages.
- Displays real-time messages using WebSockets.
- Allows admins to monitor chat sessions.
- Offers user session control and moderation features.

## Installation

### Prerequisites
Ensure you have the following installed:
- **Node.js** (for the bot and backend)
- **MongoDB** (for database storage)
- **Express.js** (for the backend API)
- **Socket.io** (for real-time communication)
- **React.js** (for the dashboard frontend)

### Setup
#### 1. Clone the Repository
```sh
  git clone https://github.com/humoyun-dev/anonim-chat.git
  cd anonim-chat
```

#### 2. Configure Environment Variables
Create a `.env` file in both the `bot/` and `dashboard/` directories with the following keys:

**For Telegram Bot (`bot/.env`):**
```sh
MONGODB_URI=<your_mongodb_connection_string>
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>
BOT_USERNAME=<your_bot_username>
```

**For Dashboard Backend (`dashboard/.env`):**
```sh
MONGODB_URI=<your_mongodb_connection_string>
JWT_SECRET=<your_secret_key>
```

#### 3. Install Dependencies
Run the following commands in each respective folder:
```sh
cd bot
npm install
```
```sh
cd ../dashboard
npm install
```

#### 4. Start the Services
Start the Telegram bot:
```sh
cd bot
node index.js
```
Start the admin dashboard backend:
```sh
cd dashboard
npm run server
```
Start the frontend:
```sh
cd dashboard
npm start
```

## Usage
1. **Telegram Bot:** Users can start the bot and generate a personal anonymous chat link.
2. **Anonymous Chat:** Other users can send anonymous messages using the link.
3. **Admin Dashboard:** Administrators can manage and moderate conversations in real-time.

## Technologies Used
- **Backend:** Node.js, Express.js, MongoDB, Socket.io
- **Frontend:** React.js, TailwindCSS
- **Bot:** Node.js, node-telegram-bot-api

## Contribution
Feel free to fork this project and submit pull requests. Contributions are welcome!

## License
This project is licensed under the MIT License.

## Contact
For any questions, reach out via [GitHub Issues](https://github.com/humoyun-dev/anonim-chat/issues).

