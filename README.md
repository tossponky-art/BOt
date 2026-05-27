
# AI News Telegram Bot

## Features
- Telegram auto news posting
- Reddit + Crypto + Tech RSS
- Sentiment analysis
- Auto fetch every 10 minutes
- Cache system
- Dark cyberpunk dashboard
- Free deployment on Vercel / Render

## Setup

### Backend

```bash
cd backend
npm install
```

Create `.env`

```env
TELEGRAM_BOT_TOKEN=YOUR_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
PORT=3000
```

Run:

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Telegram Chat ID

Open:

https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates

Send message to your bot first.

## Deploy

Backend:
- Render.com
- Railway.app

Frontend:
- Vercel.com

