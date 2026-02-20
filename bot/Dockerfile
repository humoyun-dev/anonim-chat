FROM node:20-alpine

WORKDIR /app

COPY bot/package.json bot/package-lock.json ./bot/
RUN cd bot && npm ci --omit=dev

COPY bot/ ./bot/
COPY shared/ ./shared/

ENV NODE_ENV=production

WORKDIR /app/bot
CMD ["node", "start.js"]
