FROM node:20-alpine

WORKDIR /app

COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
RUN cd dashboard && npm ci --omit=dev

COPY dashboard/ ./dashboard/
COPY shared/ ./shared/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/dashboard
CMD ["node", "adminDashboard.js"]
